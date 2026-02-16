import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  accounts,
  admin,
  connection,
  delay,
  marketPda,
  program,
  protocolPda,
  vaultAuthorityPda,
  SUITE_DELAY_MS,
} from "./helpers";

describe("settle_market", () => {
  before(async () => await delay(SUITE_DELAY_MS));

  it("rejects when market is not closed", async () => {
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    // Use first market (still Open), not the draft
    const market = marketPda(program.programId, marketCount - 2);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const m = await program.account.market.fetch(market);
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      m.tokenMint,
      admin.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods.settleMarket().accounts(accounts({
        protocol,
        market,
        vaultAuthority,
        vault: m.vault,
        treasuryTokenAccount: treasuryAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })).rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string; errorCode?: { code?: string; number?: number } };
      const msg = (err?.message ?? String(e)) + (err?.errorCode?.code ?? "") + String(err?.errorCode?.number ?? "");
      expect(msg).to.match(/InvalidMarketState|6003|required state/i);
    }
  });
});
