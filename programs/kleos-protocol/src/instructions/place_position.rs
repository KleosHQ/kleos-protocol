use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

use crate::{
    constants::MAX_MULTIPLIER, errors::ProtocolError, Market, MarketStatus, Position, Protocol,
};

#[derive(Accounts)]
pub struct PlacePosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
      mut,
      constraint = vault.key() == market.vault @ ProtocolError::InvalidStakeAmount
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> PlacePosition<'info> {
    pub fn place_position(
        &mut self,
        selected_item_index: u8,
        raw_stake: u64,
        effective_stake: u128,
        bumps: PlacePositionBumps,
    ) -> Result<()> {
        // Protocol must not be paused
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);

        // Market must be open
        require!(
            self.market.status == MarketStatus::Open,
            ProtocolError::InvalidMarketState
        );

        let current_time = Clock::get()?.unix_timestamp;

        // Ensure market not expired
        require!(
            current_time < self.market.end_ts,
            ProtocolError::InvalidTimestamp
        );

        // Validate stake
        require!(raw_stake > 0, ProtocolError::InvalidStakeAmount);

        // Validate item index
        require!(
            selected_item_index < self.market.item_count,
            ProtocolError::InvalidItemIndex
        );

        // Enforce effective stake cap
        require!(
            effective_stake <= raw_stake as u128 * MAX_MULTIPLIER,
            ProtocolError::EffectiveStakeTooLarge
        );

        // Validate correct mint
        require!(
            self.user_token_account.mint == self.market.token_mint,
            ProtocolError::InvalidStakeAmount
        );

        require!(
            self.vault.mint == self.market.token_mint,
            ProtocolError::InvalidStakeAmount
        );

        require!(
            self.vault.key() == self.market.vault,
            ProtocolError::InvalidStakeAmount
        );

        require!(effective_stake > 0, ProtocolError::InvalidStakeAmount);

        // Transfer tokens to vault
        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_token_account.to_account_info(),
                to: self.vault.to_account_info(),
                authority: self.user.to_account_info(),
            },
        );

        anchor_spl::token::transfer(cpi_ctx, raw_stake)?;

        // Store position
        self.position.set_inner(Position {
            market: self.market.key(),
            user: self.user.key(),
            selected_item_index,
            raw_stake,
            effective_stake,
            claimed: false,
            bump: bumps.position,
        });

        // Update market totals
        self.market.total_raw_stake = self
            .market
            .total_raw_stake
            .checked_add(raw_stake)
            .ok_or(ProtocolError::MathOverflow)?;

        self.market.total_effective_stake = self
            .market
            .total_effective_stake
            .checked_add(effective_stake)
            .ok_or(ProtocolError::MathOverflow)?;

        let idx = selected_item_index as usize;

        self.market.effective_stake_per_item[idx] = self.market.effective_stake_per_item[idx]
            .checked_add(effective_stake)
            .ok_or(ProtocolError::MathOverflow)?;

        Ok(())
    }
}
