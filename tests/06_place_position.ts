import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
  MAX_MULTIPLIER,
  positionPda,
  program,
  protocolPda,
  SUITE_DELAY_MS,
} from "./helpers";

describe("place_position", () => {
  let protocol: anchor.web3.PublicKey;
  let market: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;
  let user: anchor.web3.Keypair;
  let userAta: anchor.web3.PublicKey;
  /** Separate user for "rejects" tests so we create a new position each time (program checks run before init). */
  let rejectUser: anchor.web3.Keypair;
  let rejectUserAta: anchor.web3.PublicKey;

  before(async () => {
    await delay(SUITE_DELAY_MS);
    protocol = protocolPda(program.programId);
    const marketCount = (await program.account.protocol.fetch(protocol)).marketCount.toNumber();
    market = marketPda(program.programId, marketCount - 2);
    const m = await program.account.market.fetch(market);
    vault = m.vault;

    user = anchor.web3.Keypair.generate();
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: program.provider.publicKey,
        toPubkey: user.publicKey,
        lamports: 100_000_000,
      })
    );
    await program.provider.sendAndConfirm(tx);

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      m.tokenMint,
      user.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    userAta = ata.address;
    await mintTo(connection, admin.payer, m.tokenMint, userAta, admin.publicKey, 1e9);

    rejectUser = anchor.web3.Keypair.generate();
    await program.provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: program.provider.publicKey,
          toPubkey: rejectUser.publicKey,
          lamports: 100_000_000,
        })
      )
    );
    const rejectAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      m.tokenMint,
      rejectUser.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    rejectUserAta = rejectAta.address;
    await mintTo(connection, admin.payer, m.tokenMint, rejectUserAta, admin.publicKey, 1e9);
  });

  it("places position and updates market totals", async () => {
    const position = positionPda(program.programId, market, user.publicKey);
    const rawStake = 100_000;
    const effectiveStake = 100_000;

    await program.methods
      .placePosition(
        0,
        new anchor.BN(rawStake),
        new anchor.BN(effectiveStake)
      )
      .accounts(accounts({
        user: user.publicKey,
        protocol,
        market,
        position,
        userTokenAccount: userAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .signers([user])
      .rpc();

    const pos = await program.account.position.fetch(position);
    expect(pos.market.equals(market)).to.be.true;
    expect(pos.user.equals(user.publicKey)).to.be.true;
    expect(pos.selectedItemIndex).to.equal(0);
    expect(pos.rawStake.toNumber()).to.equal(rawStake);
    expect(pos.claimed).to.be.false;

    const m = await program.account.market.fetch(market);
    expect(m.totalRawStake.toNumber()).to.equal(rawStake);
  });

  it("rejects raw_stake 0", async () => {
    const position = positionPda(program.programId, market, rejectUser.publicKey);
    try {
      await program.methods
        .placePosition(0, new anchor.BN(0), new anchor.BN(100))
        .accounts(accounts({
          user: rejectUser.publicKey,
          protocol,
          market,
          position,
          userTokenAccount: rejectUserAta,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([rejectUser])
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        error?: { errorCode?: { code?: string; number?: number } };
        logs?: string[];
        transactionMessage?: string;
        transactionLogs?: string[];
      };
      const code = err?.error?.errorCode?.code ?? "";
      const num = String(err?.error?.errorCode?.number ?? "");
      const logs = (err?.logs ?? err?.transactionLogs ?? [])?.join(" ") ?? "";
      const txMsg = err?.transactionMessage ?? "";
      const msg = (err?.message ?? String(e)) + code + num + logs + txMsg;
      expect(msg).to.match(/InvalidStakeAmount|6006|1776|stake amount/i);
    }
  });

  it("rejects invalid item index", async () => {
    const position = positionPda(program.programId, market, rejectUser.publicKey);
    const m = await program.account.market.fetch(market);
    try {
      await program.methods
        .placePosition(
          m.itemCount,
          new anchor.BN(1000),
          new anchor.BN(1000)
        )
        .accounts(accounts({
          user: rejectUser.publicKey,
          protocol,
          market,
          position,
          userTokenAccount: rejectUserAta,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([rejectUser])
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        error?: { errorCode?: { code?: string; number?: number } };
        logs?: string[];
        transactionMessage?: string;
        transactionLogs?: string[];
      };
      const code = err?.error?.errorCode?.code ?? "";
      const num = String(err?.error?.errorCode?.number ?? "");
      const logs = (err?.logs ?? err?.transactionLogs ?? [])?.join(" ") ?? "";
      const txMsg = err?.transactionMessage ?? "";
      const msg = (err?.message ?? String(e)) + code + num + logs + txMsg;
      expect(msg).to.match(/InvalidItemIndex|6005|1775|item index/i);
    }
  });

  it("rejects effective_stake > raw_stake * MAX_MULTIPLIER", async () => {
    const position = positionPda(program.programId, market, rejectUser.publicKey);
    const raw = 1000;
    const effective = raw * MAX_MULTIPLIER + 1;
    try {
      await program.methods
        .placePosition(1, new anchor.BN(raw), new anchor.BN(effective))
        .accounts(accounts({
          user: rejectUser.publicKey,
          protocol,
          market,
          position,
          userTokenAccount: rejectUserAta,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .signers([rejectUser])
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        error?: { errorCode?: { code?: string; number?: number } };
        logs?: string[];
        transactionMessage?: string;
        transactionLogs?: string[];
      };
      const code = err?.error?.errorCode?.code ?? "";
      const num = String(err?.error?.errorCode?.number ?? "");
      const logs = (err?.logs ?? err?.transactionLogs ?? [])?.join(" ") ?? "";
      const txMsg = err?.transactionMessage ?? "";
      const msg = (err?.message ?? String(e)) + code + num + logs + txMsg;
      expect(msg).to.match(/EffectiveStakeTooLarge|6007|1777|multiplier/i);
    }
  });
});
