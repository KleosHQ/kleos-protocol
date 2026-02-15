use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Position {
  pub market: Pubkey,
  pub user: Pubkey,
  pub selected_item_index: u8,
  pub raw_stake: u64,
  pub effective_stake: u64,
  pub claimed: bool,
  pub bump: u8
}