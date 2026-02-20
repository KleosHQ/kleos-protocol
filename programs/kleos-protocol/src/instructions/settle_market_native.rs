use anchor_lang::prelude::*;

use crate::{
    constants::BPS_DENOMINATOR,
    errors::ProtocolError,
    Market,
    MarketStatus,
    Protocol,
};

#[derive(Accounts)]
pub struct SettleMarketNative<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    /// CHECK: Vault PDA that holds lamports; validated by seeds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    /// Treasury wallet that receives protocol fee (SOL)
    /// CHECK: Any account that can receive lamports
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> SettleMarketNative<'info> {
    pub fn settle_market_native(&mut self, bumps: SettleMarketNativeBumps) -> Result<()> {
        require!(
            self.market.status == MarketStatus::Closed,
            ProtocolError::InvalidMarketState
        );
        require!(
            self.market.total_raw_stake > 0,
            ProtocolError::InvalidStakeAmount
        );
        require!(self.market.is_native, ProtocolError::InvalidStakeAmount);

        let protocol_fee = self
            .market
            .total_raw_stake
            .checked_mul(self.protocol.protocol_fee_bps as u64)
            .ok_or(ProtocolError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(ProtocolError::MathOverflow)?;

        let distributable_pool = self
            .market
            .total_raw_stake
            .checked_sub(protocol_fee)
            .ok_or(ProtocolError::MathOverflow)?;

        if protocol_fee > 0 {
            let market_key = self.market.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault",
                market_key.as_ref(),
                &[bumps.vault],
            ]];

            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &self.vault.key(),
                &self.treasury.key(),
                protocol_fee,
            );

            anchor_lang::solana_program::program::invoke_signed(
                &transfer_ix,
                &[
                    self.vault.to_account_info(),
                    self.treasury.to_account_info(),
                    self.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        self.market.protocol_fee_amount = protocol_fee;
        self.market.distributable_pool = distributable_pool;
        self.market.status = MarketStatus::Settled;

        Ok(())
    }
}
