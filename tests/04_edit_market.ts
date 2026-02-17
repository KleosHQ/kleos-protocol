import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  accounts,
  admin,
  connection,
  delay,
  marketPda,
  program,
  protocolPda,
  SUITE_DELAY_MS,
  ZERO_ITEMS_HASH,
} from "./helpers";

describe("edit_market", () => {
  before(async () => await delay(SUITE_DELAY_MS));

  it("edits draft market", async () => {
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount - 2);

    const slot = await connection.getSlot();
    const blockTime = (await connection.getBlockTime(slot)) ?? 0;
    const startTs = blockTime;
    const endTs = blockTime + 86400;

    const newHash = [...ZERO_ITEMS_HASH];
    newHash[0] = 1;

    await program.methods
      .editMarket(new anchor.BN(startTs), new anchor.BN(endTs), newHash, 3)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    const m = await program.account.market.fetch(market);
    expect(m.startTs.toNumber()).to.equal(startTs);
    expect(m.endTs.toNumber()).to.equal(endTs);
    expect(m.itemCount).to.equal(3);
    expect(m.itemsHash[0]).to.equal(1);
  });

  it("rejects edit when market is not draft", async () => {
    const protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount - 2);

    await program.methods.openMarket().accounts(accounts({
      adminAuthority: admin.publicKey,
      protocol,
      market,
    })).rpc();

    try {
      await program.methods
        .editMarket(new anchor.BN(0), new anchor.BN(86400), ZERO_ITEMS_HASH, 2)
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
          market,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("InvalidMarketState");
    }
  });
});
