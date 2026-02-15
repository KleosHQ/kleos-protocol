use anchor_lang::prelude::*;

use crate::{errors::ProtocolError, Market, MarketStatus};

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
}

impl<'info> CloseMarket<'info> {
    pub fn close_market(&mut self) -> Result<()> {
        // Market must be Open
        require!(
            self.market.status == MarketStatus::Open,
            ProtocolError::InvalidMarketState
        );

        // Ensure end time has passed
        let current_time = Clock::get()?.unix_timestamp;

        require!(
            current_time >= self.market.end_ts,
            ProtocolError::InvalidTimestamp
        );

        // Transition state
        self.market.status = MarketStatus::Closed;

        Ok(())
    }
}
