use anchor_lang::prelude::*;
use crate::MarketStatus;

#[account]
#[derive(InitSpace)]
pub struct Market {
  pub market_id: u64,
  pub items_hash: [u8; 32],
  pub item_count: u8,
  pub start_ts: i64,
  pub end_ts: i64,
  pub status: MarketStatus,
  pub total_raw_stake: u64,
  pub total_effective_stake: u128,
  pub winning_item_index: u8,
  pub total_winning_effective_stake: u128,
  pub protocol_fee_amount: u64,
  pub distributable_pool: u64,
  pub token_mint: Pubkey,
  pub vault: Pubkey,
  pub bump: u8
}