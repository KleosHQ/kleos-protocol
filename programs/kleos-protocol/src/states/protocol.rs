use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Protocol {
  pub admin_authority: Pubkey,
  pub treasury: Pubkey,
  pub protocol_fees_bps: u16,
  pub market_count: u64,
  pub paused: bool,
  pub bump: u8
}