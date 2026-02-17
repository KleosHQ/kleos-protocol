import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
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
  ZERO_ITEMS_HASH,
} from "./helpers";

describe("create_market", () => {
  let tokenMint: anchor.web3.PublicKey;
  let protocol: anchor.web3.PublicKey;

  before(async () => {
    await delay(SUITE_DELAY_MS);
    protocol = protocolPda(program.programId);
    await program.methods
      .updateProtocol(300, admin.publicKey, false)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    tokenMint = await createMint(
      connection,
      admin.payer,
      admin.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
  });

  it("creates market with valid params", async () => {
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const vaultAddress = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const slot = await connection.getSlot();
    const blockTime = (await connection.getBlockTime(slot)) ?? 0;
    const startTs = blockTime;
    const endTs = blockTime + 86400; // 1 day so place_position can run before expiry

    await program.methods
      .createMarket(
        new anchor.BN(startTs),
        new anchor.BN(endTs),
        ZERO_ITEMS_HASH,
        2
      )
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
        vaultAuthority,
        vault: vaultAddress,
        tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    const m = await program.account.market.fetch(market);
    expect(m.marketId.toNumber()).to.equal(marketCount);
    expect(m.itemCount).to.equal(2);
    expect(m.startTs.toNumber()).to.equal(startTs);
    expect(m.endTs.toNumber()).to.equal(endTs);
    expect(m.status.draft !== undefined).to.be.true;
    expect(m.totalRawStake.toNumber()).to.equal(0);

    // Create second market with future start_ts so open_market and close_market can use it
    const nextCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const t = blockTime + 99999;
    const market1 = marketPda(program.programId, nextCount);
    const vaultAuthority1 = vaultAuthorityPda(program.programId, market1);
    const vault1 = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority1,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await program.methods
      .createMarket(new anchor.BN(t), new anchor.BN(t + 100), ZERO_ITEMS_HASH, 2)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market: market1,
        vaultAuthority: vaultAuthority1,
        vault: vault1,
        tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();
  });

  it("rejects end_ts <= start_ts", async () => {
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const vaultAddress = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .createMarket(
          new anchor.BN(10),
          new anchor.BN(10),
          ZERO_ITEMS_HASH,
          2
        )
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
          market,
          vaultAuthority,
          vault: vaultAddress,
          tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("InvalidTimestamp");
    }
  });

  it("rejects item_count <= 1", async () => {
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const vaultAddress = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .createMarket(new anchor.BN(0), new anchor.BN(100), ZERO_ITEMS_HASH, 1)
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
          market,
          vaultAuthority,
          vault: vaultAddress,
          tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("InvalidItemIndex");
    }
  });

  it("rejects when protocol is paused", async () => {
    await program.methods
      .updateProtocol(300, admin.publicKey, true)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    const market = marketPda(program.programId, marketCount);
    const vaultAuthority = vaultAuthorityPda(program.programId, market);
    const vaultAddress = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .createMarket(new anchor.BN(0), new anchor.BN(100), ZERO_ITEMS_HASH, 2)
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
          market,
          vaultAuthority,
          vault: vaultAddress,
          tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("ProtocolPaused");
    }

    await program.methods
      .updateProtocol(300, admin.publicKey, false)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();
  });
});
