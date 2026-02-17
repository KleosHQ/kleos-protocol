use crate::{errors::ProtocolError, Protocol};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateProtocol<'info> {
    #[account(mut)]
    pub admin_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin_authority @ ProtocolError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateProtocol<'info> {
    pub fn update_protocol(
        &mut self,
        protocol_fee_bps: u16,
        treasury: Pubkey,
        paused: bool,
    ) -> Result<()> {
        // Validate fee range
        require!(
            protocol_fee_bps <= 10_000,
            ProtocolError::InvalidProtocolFeeBps
        );

        // Update values
        self.protocol.protocol_fee_bps = protocol_fee_bps;
        self.protocol.treasury = treasury;
        self.protocol.paused = paused;

        Ok(())
    }
}
