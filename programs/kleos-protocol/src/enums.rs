use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketStatus {
    Draft,
    Open,
    Closed,
    Settled,
}
