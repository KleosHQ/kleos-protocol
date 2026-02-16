import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  accounts,
  admin,
  delay,
  marketPda,
  program,
  protocolPda,
  SUITE_DELAY_MS,
} from "./helpers";

describe("open_market", () => {
  before(async () => await delay(SUITE_DELAY_MS));

  it("rejects when current time < start_ts", async () => {
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    // Last market is Draft with future start_ts from create_market
    const market = marketPda(program.programId, marketCount - 1);

    try {
      await program.methods.openMarket().accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
      })).rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string; errorCode?: { code?: string; number?: number } };
      const msg = err?.message ?? String(e);
      const code = err?.errorCode?.code ?? "";
      const num = err?.errorCode?.number ?? "";
      expect(msg + code + String(num)).to.match(/InvalidTimestamp|6004|timestamp/i);
    }
  });
});
