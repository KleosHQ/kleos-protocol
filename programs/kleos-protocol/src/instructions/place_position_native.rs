use anchor_lang::prelude::*;

use crate::{
    constants::MAX_MULTIPLIER,
    errors::ProtocolError,
    Market,
    MarketStatus,
    Position,
    Protocol,
};

/// Place a position on a native-SOL market. Transfers lamports from user to vault PDA.
#[derive(Accounts)]
pub struct PlacePositionNative<'info> {
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

    /// CHECK: PDA that holds lamports; validated by seeds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> PlacePositionNative<'info> {
    pub fn place_position_native(
        &mut self,
        selected_item_index: u8,
        raw_stake: u64,
        effective_stake: u128,
        bumps: PlacePositionNativeBumps,
    ) -> Result<()> {
        require!(!self.protocol.paused, ProtocolError::ProtocolPaused);
        require!(
            self.market.status == MarketStatus::Open,
            ProtocolError::InvalidMarketState
        );
        require!(self.market.is_native, ProtocolError::InvalidStakeAmount);

        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time < self.market.end_ts,
            ProtocolError::InvalidTimestamp
        );
        require!(raw_stake > 0, ProtocolError::InvalidStakeAmount);
        require!(
            selected_item_index < self.market.item_count,
            ProtocolError::InvalidItemIndex
        );
        require!(
            effective_stake <= raw_stake as u128 * MAX_MULTIPLIER,
            ProtocolError::EffectiveStakeTooLarge
        );
        require!(effective_stake > 0, ProtocolError::InvalidStakeAmount);
        require!(
            self.vault.key() == self.market.vault,
            ProtocolError::InvalidStakeAmount
        );

        let cpi_ctx = CpiContext::new(
            self.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: self.user.to_account_info(),
                to: self.vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx, raw_stake)?;

        self.position.set_inner(Position {
            market: self.market.key(),
            user: self.user.key(),
            selected_item_index,
            raw_stake,
            effective_stake,
            claimed: false,
            bump: bumps.position,
        });

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
