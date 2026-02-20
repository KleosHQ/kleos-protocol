use anchor_lang::prelude::*;

declare_id!("6jmg3EdNVE2PgLJHkzzGxG8aqsKWxLKvrgDjszTreAhD");

pub mod constants;
pub mod enums;
pub mod errors;
pub mod instructions;
pub mod states;

pub use constants::*;
pub use enums::*;
pub use errors::*;
pub use instructions::*;
pub use states::*;

#[program]
pub mod kleos_protocol {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        protocol_fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        ctx.accounts
            .initialize_protocol(protocol_fee_bps, treasury, ctx.bumps)
    }

    pub fn update_protocol(
        ctx: Context<UpdateProtocol>,
        protocol_fee_bps: u16,
        treasury: Pubkey,
        paused: bool,
    ) -> Result<()> {
        ctx.accounts.update_protocol(protocol_fee_bps, treasury, paused)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
    ) -> Result<()> {
        ctx.accounts.create_market(
            start_ts,
            end_ts,
            items_hash,
            item_count,
            ctx.bumps,
        )
    }

    pub fn create_market_native(
        ctx: Context<CreateMarketNative>,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
    ) -> Result<()> {
        ctx.accounts.create_market_native(
            start_ts,
            end_ts,
            items_hash,
            item_count,
            ctx.bumps,
        )
    }

    pub fn edit_market(
        ctx: Context<EditMarket>,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
    ) -> Result<()> {
        ctx.accounts
            .edit_market(start_ts, end_ts, items_hash, item_count)
    }

    pub fn open_market(
        ctx: Context<OpenMarket>,
    ) -> Result<()> {
        ctx.accounts.open_market()
    }

    pub fn place_position(
        ctx: Context<PlacePosition>,
        selected_item_index: u8,
        raw_stake: u64,
        effective_stake: u128,
    ) -> Result<()> {
        ctx.accounts.place_position(
            selected_item_index,
            raw_stake,
            effective_stake,
            ctx.bumps,
        )
    }

    pub fn place_position_native(
        ctx: Context<PlacePositionNative>,
        selected_item_index: u8,
        raw_stake: u64,
        effective_stake: u128,
    ) -> Result<()> {
        ctx.accounts.place_position_native(
            selected_item_index,
            raw_stake,
            effective_stake,
            ctx.bumps,
        )
    }

    pub fn close_market(
        ctx: Context<CloseMarket>,
    ) -> Result<()> {
        ctx.accounts.close_market()
    }

    pub fn settle_market(
        ctx: Context<SettleMarket>,
    ) -> Result<()> {
        ctx.accounts.settle_market(ctx.bumps)
    }

    pub fn settle_market_native(
        ctx: Context<SettleMarketNative>,
    ) -> Result<()> {
        ctx.accounts.settle_market_native(ctx.bumps)
    }

    pub fn claim_payout(
        ctx: Context<ClaimPayout>,
    ) -> Result<()> {
        ctx.accounts.claim_payout(ctx.bumps)
    }

    pub fn claim_payout_native(
        ctx: Context<ClaimPayoutNative>,
    ) -> Result<()> {
        ctx.accounts.claim_payout_native(ctx.bumps)
    }
}
