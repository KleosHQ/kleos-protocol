/**
 * Shared test setup and helpers.
 * To avoid RPC rate limits (429) on devnet, run only one suite: add .only to a describe, e.g.
 *   describe.only("update_protocol", () => { ... })
 * Or set SUITE_DELAY_MS higher (e.g. 3000). Set SUITE_DELAY_MS = 0 for localnet.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { KleosProtocol } from "../target/types/kleos_protocol";

anchor.setProvider(anchor.AnchorProvider.env());

export const program = anchor.workspace.kleosProtocol as Program<KleosProtocol>;
export const admin = program.provider.wallet;
export const connection = program.provider.connection;

export const BPS_MAX = 10_000;
export const MAX_MULTIPLIER = 20;
export const ZERO_ITEMS_HASH = new Array(32).fill(0) as number[];

export const SUITE_DELAY_MS = 1500;
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const accounts = (x: object): any => x;

export function protocolPda(programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    programId
  )[0];
}

export function marketPda(programId: anchor.web3.PublicKey, marketCount: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketCount));
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("market"), buf],
    programId
  )[0];
}

export function vaultAuthorityPda(
  programId: anchor.web3.PublicKey,
  market: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    programId
  )[0];
}

export function positionPda(
  programId: anchor.web3.PublicKey,
  market: anchor.web3.PublicKey,
  user: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
    programId
  )[0];
}
