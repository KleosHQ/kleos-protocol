use anchor_lang::prelude::*;

use crate::{errors::ProtocolError, Market, MarketStatus, Position};

#[derive(Accounts)]
pub struct ClaimPayoutNative<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        has_one = market,
        has_one = user
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Vault PDA that holds lamports; validated by seeds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ClaimPayoutNative<'info> {
    pub fn claim_payout_native(&mut self, bumps: ClaimPayoutNativeBumps) -> Result<()> {
        require!(
            self.market.status == MarketStatus::Settled,
            ProtocolError::InvalidMarketState
        );
        require!(!self.position.claimed, ProtocolError::AlreadyClaimed);
        require!(
            self.market.total_effective_stake > 0,
            ProtocolError::InvalidStakeAmount
        );
        require!(self.market.is_native, ProtocolError::InvalidStakeAmount);

        let payout = self
            .position
            .effective_stake
            .checked_mul(self.market.distributable_pool as u128)
            .ok_or(ProtocolError::MathOverflow)?
            .checked_div(self.market.total_effective_stake)
            .ok_or(ProtocolError::MathOverflow)?;

        let payout_u64: u64 = payout.try_into().map_err(|_| ProtocolError::MathOverflow)?;

        self.position.claimed = true;

        if payout_u64 > 0 {
            let market_key = self.market.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault",
                market_key.as_ref(),
                &[bumps.vault],
            ]];

            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &self.vault.key(),
                &self.user.key(),
                payout_u64,
            );

            anchor_lang::solana_program::program::invoke_signed(
                &transfer_ix,
                &[
                    self.vault.to_account_info(),
                    self.user.to_account_info(),
                    self.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        Ok(())
    }
}
