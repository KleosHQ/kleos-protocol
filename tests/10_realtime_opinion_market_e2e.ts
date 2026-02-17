import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
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

const ITEM_COUNT = 4;
const PROTOCOL_FEE_BPS = 300; // 3%
const LAMPORTS_PER_USER = 500_000_000;
const TOKEN_DECIMALS = 6;
/** Devnet: create + open + fund users can take 30+ s; place must run before end_ts. Wait this long before close. */
const END_WINDOW_SEC = 120;

function itemsHashFromLabel(_label: string): number[] {
  return new Array(32).fill(0).map((_, i) => (i % 3)) as number[];
}

describe.only("realtime opinion market (E2E)", () => {
  let protocol: anchor.web3.PublicKey;
  let market: anchor.web3.PublicKey;
  let tokenMint: anchor.web3.PublicKey;
  let vaultAuthority: anchor.web3.PublicKey;
  let vaultAddress: anchor.web3.PublicKey;
  let treasuryAta: anchor.web3.PublicKey;

  const participants: {
    name: string;
    keypair: anchor.web3.Keypair;
    ata: anchor.web3.PublicKey;
    itemIndex: number;
    rawStake: number;
    effectiveStake: number;
  }[] = [];

  before(async () => {
    await delay(SUITE_DELAY_MS);
    protocol = protocolPda(program.programId);

    // Ensure protocol is live and not paused
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

    tokenMint = await createMint(
      connection,
      admin.payer,
      admin.publicKey,
      null,
      TOKEN_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Treasury ATA (protocol treasury = admin for tests)
    const treasuryAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      tokenMint,
      admin.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    treasuryAta = treasuryAtaAccount.address;

    const slot = await connection.getSlot();
    const blockTime = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    const startTs = blockTime - 60; // market already "started"
    const endTs = blockTime + END_WINDOW_SEC;

    const marketCount = proto.marketCount.toNumber();
    market = marketPda(program.programId, marketCount);
    vaultAuthority = vaultAuthorityPda(program.programId, market);
    vaultAddress = getAssociatedTokenAddressSync(
      tokenMint,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // ─── Create market (Draft) ─────────────────────────────────────────────────
    console.log("[E2E] Instruction: create_market");
    await program.methods
      .createMarket(
        new anchor.BN(startTs),
        new anchor.BN(endTs),
        itemsHashFromLabel("MVP 2025"),
        ITEM_COUNT
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

    // ─── Open market ───────────────────────────────────────────────────────────
    console.log("[E2E] Instruction: open_market");
    await program.methods
      .openMarket()
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
        market,
      }))
      .rpc();

    // Create 4 participants with SOL + tokens
    const names = ["Alice", "Bob", "Carol", "Dave"];
    const stakes: { raw: number; effective: number }[] = [
      { raw: 100_000, effective: 100_000 },
      { raw: 250_000, effective: 400_000 },
      { raw: 150_000, effective: 200_000 },
      { raw: 80_000, effective: 80_000 },
    ];
    const totalMint = stakes.reduce((s, x) => s + x.raw, 0) * 2; // extra buffer
    await mintTo(
      connection,
      admin.payer,
      tokenMint,
      treasuryAtaAccount.address,
      admin.publicKey,
      totalMint
    );

    for (let i = 0; i < 4; i++) {
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
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        admin.payer,
        tokenMint,
        keypair.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      await mintTo(
        connection,
        admin.payer,
        tokenMint,
        ata.address,
        admin.publicKey,
        stakes[i].raw + 50_000
      );
      participants.push({
        name: names[i],
        keypair,
        ata: ata.address,
        itemIndex: i,
        rawStake: stakes[i].raw,
        effectiveStake: stakes[i].effective,
      });
    }
  });

  it("runs full lifecycle: place positions → close → settle → claim proportional payouts", async () => {
    console.log("[E2E] Starting full lifecycle test (market is Open)");
    const marketBefore = await program.account.market.fetch(market);
    expect(marketBefore.status.open !== undefined).to.be.true;

    // Scenario: Alice (item 0), Bob (item 1), Carol (item 2), Dave (item 3) each stake
    // with different amounts; payouts are proportional to effective_stake / total_effective_stake.

    // ─── Phase 1: Everyone places positions ────────────────────────────────────
    for (const p of participants) {
      console.log(`[E2E] Instruction: place_position (${p.name}, item ${p.itemIndex}, raw=${p.rawStake}, effective=${p.effectiveStake})`);
      await program.methods
        .placePosition(
          p.itemIndex,
          new anchor.BN(p.rawStake),
          new anchor.BN(p.effectiveStake)
        )
        .accounts(accounts({
          user: p.keypair.publicKey,
          protocol,
          market,
          position: positionPda(program.programId, market, p.keypair.publicKey),
          userTokenAccount: p.ata,
          vault: vaultAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([p.keypair])
        .rpc();
    }

    let m = await program.account.market.fetch(market);
    const totalRawStake = m.totalRawStake.toNumber();
    const totalEffectiveStake = m.totalEffectiveStake.toNumber();
    expect(totalRawStake).to.equal(580_000);
    expect(totalEffectiveStake).to.equal(780_000);
    console.log(`[E2E] Market totals: totalRawStake=${totalRawStake}, totalEffectiveStake=${totalEffectiveStake}`);

    // ─── Phase 2: Close market (after end_ts) ───────────────────────────────────
    // Market end_ts = blockTime + 120s. Wait so chain time >= end_ts (devnet can be slow).
    const waitMs = (END_WINDOW_SEC + 15) * 1000;
    console.log(`[E2E] Waiting ${waitMs / 1000}s for market end_ts...`);
    await delay(waitMs);

    console.log("[E2E] Instruction: close_market");
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

    // ─── Phase 3: Settle market (protocol fee → treasury, set distributable_pool) ─
    console.log("[E2E] Instruction: settle_market");
    await program.methods
      .settleMarket()
      .accounts(accounts({
        signer: admin.publicKey,
        protocol,
        market,
        vaultAuthority,
        vault: vaultAddress,
        treasuryTokenAccount: treasuryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
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
    console.log(`[E2E] Settled: protocolFeeAmount=${protocolFeeAmount}, distributablePool=${distributablePool}`);

    // ─── Phase 4: Each participant claims their proportional share ───────────────
    // Payout = (position.effective_stake / market.total_effective_stake) * distributable_pool
    const balancesBefore: number[] = [];
    for (let i = 0; i < participants.length; i++) {
      const acc = await connection.getTokenAccountBalance(participants[i].ata);
      balancesBefore.push(Number(acc.value.amount));
    }

    for (const p of participants) {
      console.log(`[E2E] Instruction: claim_payout (${p.name})`);
      await program.methods
        .claimPayout()
        .accounts(accounts({
          user: p.keypair.publicKey,
          market,
          position: positionPda(program.programId, market, p.keypair.publicKey),
          vaultAuthority,
          vault: vaultAddress,
          userTokenAccount: p.ata,
          tokenProgram: TOKEN_PROGRAM_ID,
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
      const accAfter = await connection.getTokenAccountBalance(p.ata);
      const balanceAfter = Number(accAfter.value.amount);
      const received = balanceAfter - balancesBefore[i];
      expect(
        Math.abs(received - expectedPayout) <= 1,
        `${p.name} expected ~${expectedPayout}, received ${received}`
      ).to.be.true;
    }

    // Vault should be drained (allow tiny remainder from integer division rounding)
    const vaultAfter = await connection.getTokenAccountBalance(vaultAddress);
    const vaultRemainder = Number(vaultAfter.value.amount);
    console.log(`[E2E] Vault balance after all claims: ${vaultRemainder}`);
    expect(vaultRemainder <= 5, `vault remainder ${vaultRemainder} should be <= 5 (rounding dust)`).to.be.true;
  });
});
