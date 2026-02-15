use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

use crate::{errors::ProtocolError, Market, MarketStatus, Position};

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
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

    /// CHECK: PDA authority for vault
    #[account(
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
      mut,
      constraint = vault.key() == market.vault @ ProtocolError::InvalidStakeAmount
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimPayout<'info> {
    pub fn claim_payout(&mut self, bumps: ClaimPayoutBumps) -> Result<()> {
        // Market must be settled
        require!(
            self.market.status == MarketStatus::Settled,
            ProtocolError::InvalidMarketState
        );

        // Prevent double claim
        require!(!self.position.claimed, ProtocolError::AlreadyClaimed);

        // Must be winning position
        require!(
            self.position.selected_item_index == self.market.winning_item_index,
            ProtocolError::InvalidMarketState
        );

        // Get total winning effective stake from on-chain aggregation
        let total_winning_effective_stake =
            self.market.effective_stake_per_item[self.market.winning_item_index as usize];

        require!(
            total_winning_effective_stake > 0,
            ProtocolError::InvalidStakeAmount
        );

        // Compute payout
        let payout = self
            .position
            .effective_stake
            .checked_mul(self.market.distributable_pool as u128)
            .ok_or(ProtocolError::MathOverflow)?
            .checked_div(total_winning_effective_stake)
            .ok_or(ProtocolError::MathOverflow)?;

        let payout_u64: u64 = payout.try_into().map_err(|_| ProtocolError::MathOverflow)?;

        // Mark claimed BEFORE transfer
        self.position.claimed = true;

        // Transfer payout
        if payout_u64 > 0 {
            let market_key = self.market.key();

            let seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[bumps.vault_authority]];

            let signer = &[seeds];

            let cpi_ctx = CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.vault.to_account_info(),
                    to: self.user_token_account.to_account_info(),
                    authority: self.vault_authority.to_account_info(),
                },
                signer,
            );

            anchor_spl::token::transfer(cpi_ctx, payout_u64)?;
        }

        Ok(())
    }
}
