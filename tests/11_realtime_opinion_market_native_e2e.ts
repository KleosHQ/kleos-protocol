import * as anchor from "@coral-xyz/anchor";
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

const ITEM_COUNT = 3;
const PROTOCOL_FEE_BPS = 300; // 3%
const LAMPORTS_PER_USER = 500_000_000;
/** Devnet: create + open + fund users can take 30+ s; place must run before end_ts. */
const END_WINDOW_SEC = 120;

function itemsHashFromLabel(_label: string): number[] {
  return new Array(32).fill(0).map((_, i) => (i % 3)) as number[];
}

describe("realtime opinion market native SOL (E2E)", () => {
  let protocol: anchor.web3.PublicKey;
  let market: anchor.web3.PublicKey;
  let vaultAuthority: anchor.web3.PublicKey;
  let vaultAddress: anchor.web3.PublicKey;

  const participants: {
    name: string;
    keypair: anchor.web3.Keypair;
    itemIndex: number;
    rawStake: number;
    effectiveStake: number;
  }[] = [];

  before(async () => {
    await delay(SUITE_DELAY_MS);
    protocol = protocolPda(program.programId);

    const proto = await program.account.protocol.fetch(protocol);
    if (proto.paused) {
      await program.methods
        .updateProtocol(proto.protocolFeeBps, proto.treasury, false)
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
    }

    const slot = await connection.getSlot();
    const blockTime = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    const startTs = blockTime - 60;
    const endTs = blockTime + END_WINDOW_SEC;

    const marketCount = proto.marketCount.toNumber();
    market = marketPda(program.programId, marketCount);
    vaultAuthority = vaultAuthorityPda(program.programId, market);
    vaultAddress = vaultAuthority;

    console.log("[E2E Native] Instruction: create_market_native");
    await program.methods
      .createMarketNative(
        new anchor.BN(startTs),
        new anchor.BN(endTs),
        itemsHashFromLabel("Native MVP"),
        ITEM_COUNT
      )
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
        vaultAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    const m = await program.account.market.fetch(market);
    expect(m.isNative).to.be.true;

    console.log("[E2E Native] Instruction: open_market");
    await program.methods
      .openMarket()
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
      }))
      .rpc();

    const names = ["Alice", "Bob", "Carol"];
    const stakes: { raw: number; effective: number }[] = [
      { raw: 100_000_000, effective: 100_000_000 },
      { raw: 200_000_000, effective: 300_000_000 },
      { raw: 50_000_000, effective: 50_000_000 },
    ];

    for (let i = 0; i < 3; i++) {
      const keypair = anchor.web3.Keypair.generate();
      await program.provider.sendAndConfirm(
        new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: keypair.publicKey,
            lamports: LAMPORTS_PER_USER,
          })
        )
      );
      participants.push({
        name: names[i],
        keypair,
        itemIndex: i,
        rawStake: stakes[i].raw,
        effectiveStake: stakes[i].effective,
      });
    }
  });

  it("runs full lifecycle with native SOL: place → close → settle → claim", async () => {
    console.log("[E2E Native] Starting full lifecycle test");

    for (const p of participants) {
      console.log(
        `[E2E Native] Instruction: place_position_native (${p.name}, item ${p.itemIndex}, raw=${p.rawStake} lamports)`
      );
      await program.methods
        .placePositionNative(
          p.itemIndex,
          new anchor.BN(p.rawStake),
          new anchor.BN(p.effectiveStake)
        )
        .accounts(accounts({
          user: p.keypair.publicKey,
          protocol,
          market,
          position: positionPda(program.programId, market, p.keypair.publicKey),
          vault: vaultAddress,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([p.keypair])
        .rpc();
    }

    let m = await program.account.market.fetch(market);
    const totalRawStake = m.totalRawStake.toNumber();
    const totalEffectiveStake = m.totalEffectiveStake.toNumber();
    expect(totalRawStake).to.equal(350_000_000);
    expect(totalEffectiveStake).to.equal(450_000_000);

    const waitMs = (END_WINDOW_SEC + 15) * 1000;
    console.log(`[E2E Native] Waiting ${waitMs / 1000}s for market end_ts...`);
    await delay(waitMs);

    console.log("[E2E Native] Instruction: close_market");
    await program.methods
      .closeMarket()
      .accounts(accounts({
        signer: admin.publicKey,
        market,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    m = await program.account.market.fetch(market);
    expect(m.status.closed !== undefined).to.be.true;

    console.log("[E2E Native] Instruction: settle_market_native");
    await program.methods
      .settleMarketNative()
      .accounts(accounts({
        signer: admin.publicKey,
        protocol,
        market,
        vault: vaultAddress,
        treasury: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    m = await program.account.market.fetch(market);
    expect(m.status.settled !== undefined).to.be.true;

    const protocolFeeAmount = m.protocolFeeAmount.toNumber();
    const distributablePool = m.distributablePool.toNumber();
    const expectedFee = Math.floor((totalRawStake * PROTOCOL_FEE_BPS) / 10_000);
    expect(protocolFeeAmount).to.equal(expectedFee);
    expect(distributablePool).to.equal(totalRawStake - expectedFee);

    const balancesBefore: number[] = [];
    for (let i = 0; i < participants.length; i++) {
      const bal = await connection.getBalance(participants[i].keypair.publicKey);
      balancesBefore.push(bal);
    }

    for (const p of participants) {
      console.log(`[E2E Native] Instruction: claim_payout_native (${p.name})`);
      await program.methods
        .claimPayoutNative()
        .accounts(accounts({
          user: p.keypair.publicKey,
          market,
          position: positionPda(program.programId, market, p.keypair.publicKey),
          vault: vaultAddress,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([p.keypair])
        .rpc();
    }

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const pos = await program.account.position.fetch(
        positionPda(program.programId, market, p.keypair.publicKey)
      );
      expect(pos.claimed).to.be.true;

      const expectedPayout = Math.floor(
        (Number(p.effectiveStake) * distributablePool) / totalEffectiveStake
      );
      const balanceAfter = await connection.getBalance(p.keypair.publicKey);
      const received = balanceAfter - balancesBefore[i];
      expect(
        Math.abs(received - expectedPayout) <= 5000,
        `${p.name} expected ~${expectedPayout}, received ${received}`
      ).to.be.true;
    }

    const vaultAfter = await connection.getBalance(vaultAddress);
    expect(vaultAfter <= 5000, `vault remainder ${vaultAfter} should be <= 5000`).to.be.true;
  });
});
