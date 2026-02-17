use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

use crate::{constants::BPS_DENOMINATOR, errors::ProtocolError, Market, MarketStatus, Protocol};

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    /// CHECK: PDA authority for vault
    #[account(
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> SettleMarket<'info> {
  pub fn settle_market(
      &mut self,
      bumps: SettleMarketBumps,
  ) -> Result<()> {

      // Must be Closed
      require!(
          self.market.status == MarketStatus::Closed,
          ProtocolError::InvalidMarketState
      );

      // Ensure stake exists
      require!(
          self.market.total_raw_stake > 0,
          ProtocolError::InvalidStakeAmount
      );

      // Compute protocol fee
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

      // Transfer fee to treasury
      if protocol_fee > 0 {
          let market_key = self.market.key();

          let seeds: &[&[u8]] = &[
              b"vault",
              market_key.as_ref(),
              &[bumps.vault_authority],
          ];

          let signer = &[seeds];

          let cpi_ctx = CpiContext::new_with_signer(
              self.token_program.to_account_info(),
              Transfer {
                  from: self.vault.to_account_info(),
                  to: self.treasury_token_account.to_account_info(),
                  authority: self.vault_authority.to_account_info(),
              },
              signer,
          );

          anchor_spl::token::transfer(cpi_ctx, protocol_fee)?;
      }

      // Store results
      self.market.protocol_fee_amount = protocol_fee;
      self.market.distributable_pool = distributable_pool;
      self.market.status = MarketStatus::Settled;

      Ok(())
  }
}
