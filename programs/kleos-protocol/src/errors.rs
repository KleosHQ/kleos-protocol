use anchor_lang::prelude::*;

#[error_code]
pub enum ProtocolError {

    #[msg("Protocol fee bps must be between 0 and 10000.")]
    InvalidProtocolFeeBps,

    #[msg("Unauthorized access.")]
    Unauthorized,

    #[msg("Protocol is paused.")]
    ProtocolPaused,

    #[msg("Market is not in the required state.")]
    InvalidMarketState,

    #[msg("Invalid timestamp.")]
    InvalidTimestamp,

    #[msg("Invalid item index.")]
    InvalidItemIndex,

    #[msg("Invalid stake amount.")]
    InvalidStakeAmount,

    #[msg("Effective stake exceeds allowed multiplier.")]
    EffectiveStakeTooLarge,

    #[msg("Position already claimed.")]
    AlreadyClaimed,

    #[msg("Market already settled.")]
    MarketAlreadySettled,

    #[msg("Math overflow occurred.")]
    MathOverflow,
}
