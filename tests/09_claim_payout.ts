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
  positionPda,
  program,
  protocolPda,
  vaultAuthorityPda,
  SUITE_DELAY_MS,
} from "./helpers";

describe("claim_payout", () => {
  before(async () => await delay(SUITE_DELAY_MS));

  it("rejects when market is not settled", async () => {
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount - 1);
    const wallet = program.provider.wallet;
    const position = positionPda(program.programId, market, wallet.publicKey);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const m = await program.account.market.fetch(market);
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      m.tokenMint,
      wallet.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods.claimPayout().accounts(accounts({
        user: wallet.publicKey,
        market,
        position,
        vaultAuthority,
        vault: m.vault,
        userTokenAccount: userAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })).rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string; errorCode?: { code?: string; number?: number } };
      const msg = (err?.message ?? String(e)) + (err?.errorCode?.code ?? "") + String(err?.errorCode?.number ?? "");
      expect(msg).to.match(/InvalidMarketState|6003|required state|position/i);
    }
  });
});
