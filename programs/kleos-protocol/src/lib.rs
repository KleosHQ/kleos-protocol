use anchor_lang::prelude::*;

declare_id!("kLeosk5KrdC8uXDRh66QhvwXqnjfkeadb7mU4ekGqcK");

pub mod enums;
pub mod states;
pub mod instructions;
pub mod constants;
pub mod errors;
pub mod utils;

pub use enums::*;
pub use states::*;
pub use instructions::*;
pub use constants::*;
pub use errors::*;
pub use utils::*;

#[program]
pub mod kleos_protocol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
