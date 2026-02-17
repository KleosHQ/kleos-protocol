use crate::{errors::ProtocolError, Protocol};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump,
    )]
    pub protocol: Account<'info, Protocol>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeProtocol<'info> {
    pub fn initialize_protocol(
        &mut self,
        protocol_fee_bps: u16,
        treasury: Pubkey,
        bumps: InitializeProtocolBumps,
    ) -> Result<()> {
        require!(
            protocol_fee_bps <= 10_000,
            ProtocolError::InvalidProtocolFeeBps
        );

        self.protocol.set_inner(Protocol {
            admin_authority: self.admin.key(),
            treasury,
            protocol_fee_bps,
            market_count: 0,
            paused: false,
            bump: bumps.protocol,
        });

        Ok(())
    }
}
