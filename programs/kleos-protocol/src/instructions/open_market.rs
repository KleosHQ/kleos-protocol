use anchor_lang::prelude::*;

use crate::{errors::ProtocolError, Market, MarketStatus, Protocol};

#[derive(Accounts)]
pub struct OpenMarket<'info> {
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

impl<'info> OpenMarket<'info> {
    pub fn open_market(&mut self) -> Result<()> {
        // Protocol must not be paused
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);

        // Market must be Draft
        require!(
            self.market.status == MarketStatus::Draft,
            ProtocolError::InvalidMarketState
        );

        // Ensure current time >= start_ts
        let current_time = Clock::get()?.unix_timestamp;

        require!(
            current_time >= self.market.start_ts,
            ProtocolError::InvalidTimestamp
        );

        // Transition state
        self.market.status = MarketStatus::Open;

        Ok(())
    }
}
