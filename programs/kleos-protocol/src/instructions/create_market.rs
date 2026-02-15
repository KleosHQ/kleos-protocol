use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

use crate::{
    Protocol,
    Market,
    MarketStatus,
    errors::ProtocolError,
    constants::MAX_ITEMS,
};

#[derive(Accounts)]
pub struct CreateMarket<'info> {
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

    /// CHECK: PDA authority for vault
    #[account(
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin_authority,
        associated_token::mint = token_mint,
        associated_token::authority = vault_authority
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateMarket<'info> {
    pub fn create_market(
        &mut self,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
        bumps: CreateMarketBumps,
    ) -> Result<()> {

        // Protocol must not be paused
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);

        // Validate timestamps
        require!(end_ts > start_ts, ProtocolError::InvalidTimestamp);

        // Validate item count
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

            winning_item_index: 0,
            protocol_fee_amount: 0,
            distributable_pool: 0,

            token_mint: self.token_mint.key(),
            vault: self.vault.key(),
            bump: bumps.market,
        });

        // Increment market counter
        self.protocol.market_count = self
            .protocol
            .market_count
            .checked_add(1)
            .ok_or(ProtocolError::MathOverflow)?;

        Ok(())
    }
}
