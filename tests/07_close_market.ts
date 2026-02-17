import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { accounts, admin, delay, marketPda, program, protocolPda, SUITE_DELAY_MS } from "./helpers";

describe("close_market", () => {
  before(async () => await delay(SUITE_DELAY_MS));

  it("rejects when market is not open", async () => {
    // Use last market (Draft), not the open market
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount - 1);

    try {
      await program.methods.closeMarket().accounts(accounts({
        signer: admin.publicKey,
        market,
        systemProgram: anchor.web3.SystemProgram.programId,
      })).rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string; errorCode?: { code?: string; number?: number } };
      const msg = (err?.message ?? String(e)) + (err?.errorCode?.code ?? "") + String(err?.errorCode?.number ?? "");
      expect(msg).to.match(/InvalidMarketState|6003|required state/i);
    }
  });
});
