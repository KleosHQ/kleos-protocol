use anchor_lang::prelude::*;

use crate::{
    errors::ProtocolError,
    constants::MAX_ITEMS,
    Market,
    MarketStatus,
    Protocol,
};

/// Create a market that accepts native SOL (lamports) instead of SPL tokens.
/// The vault is the vault_authority PDA itself, which holds lamports directly.
#[derive(Accounts)]
pub struct CreateMarketNative<'info> {
    #[account(mut)]
    pub admin_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin_authority @ ProtocolError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = admin_authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", protocol.market_count.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA for vault; when is_native, this PDA holds lamports directly; validated by seeds
    #[account(
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateMarketNative<'info> {
    pub fn create_market_native(
        &mut self,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
        bumps: CreateMarketNativeBumps,
    ) -> Result<()> {
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);
        require!(end_ts > start_ts, ProtocolError::InvalidTimestamp);
        require!(item_count > 1, ProtocolError::InvalidItemIndex);
        require!(
            item_count as usize <= MAX_ITEMS,
            ProtocolError::InvalidItemIndex
        );

        let market_id = self.protocol.market_count;

        self.market.set_inner(Market {
            market_id,
            items_hash,
            item_count,
            start_ts,
            end_ts,
            status: MarketStatus::Draft,

            total_raw_stake: 0,
            total_effective_stake: 0,
            effective_stake_per_item: [0u128; MAX_ITEMS],
            protocol_fee_amount: 0,
            distributable_pool: 0,

            token_mint: anchor_lang::system_program::ID,
            vault: self.vault_authority.key(),
            bump: bumps.market,
            is_native: true,
        });

        self.protocol.market_count = self
            .protocol
            .market_count
            .checked_add(1)
            .ok_or(ProtocolError::MathOverflow)?;

        Ok(())
    }
}
