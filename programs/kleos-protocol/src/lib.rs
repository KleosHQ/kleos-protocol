use anchor_lang::prelude::*;

declare_id!("kLeosk5KrdC8uXDRh66QhvwXqnjfkeadb7mU4ekGqcK");

pub mod constants;
pub mod enums;
pub mod errors;
pub mod instructions;
pub mod states;
pub mod utils;

pub use constants::*;
pub use enums::*;
pub use errors::*;
pub use instructions::*;
pub use states::*;
pub use utils::*;

#[program]
pub mod kleos_protocol {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts
            .initialize_protocol(protocol_fee_bps, ctx.bumps)
    }
}
