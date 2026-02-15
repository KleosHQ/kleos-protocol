use anchor_lang::prelude::*;

use crate::{Market, MarketStatus, Protocol, errors::ProtocolError};

#[derive(Accounts)]
pub struct EditMarket<'info> {
    #[account(mut)]
    pub admin_authority: Signer<'info>,

    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin_authority @ ProtocolError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(mut)]
    pub market: Account<'info, Market>,
}

impl<'info> EditMarket<'info> {
    pub fn edit_market(
        &mut self,
        start_ts: i64,
        end_ts: i64,
        items_hash: [u8; 32],
        item_count: u8,
    ) -> Result<()> {

        // Protocol must not be paused
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);

        // Market must be in Draft state
        require!(
            self.market.status == MarketStatus::Draft,
            ProtocolError::InvalidMarketState
        );

        // No positions must exist
        require!(
            self.market.total_raw_stake == 0,
            ProtocolError::InvalidMarketState
        );

        // Validate timestamps
        require!(end_ts > start_ts, ProtocolError::InvalidTimestamp);

        // Validate item count
        require!(item_count > 1, ProtocolError::InvalidItemIndex);

        // Apply updates
        self.market.start_ts = start_ts;
        self.market.end_ts = end_ts;
        self.market.items_hash = items_hash;
        self.market.item_count = item_count;

        Ok(())
    }
}
