import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  accounts,
  admin,
  BPS_MAX,
  program,
  protocolPda,
} from "./helpers";

describe("initialize_protocol", () => {
  it.skip("initializes protocol with valid fee (3%)", async () => {
    const protocol = protocolPda(program.programId);
    await program.methods
      .initializeProtocol(300)
      .accounts(accounts({
        admin: admin.publicKey,
        protocol,
        systemProgram: anchor.web3.SystemProgram.programId,
      }))
      .rpc();

    const data = await program.account.protocol.fetch(protocol);
    expect(data.adminAuthority.equals(admin.publicKey)).to.be.true;
    expect(data.treasury.equals(admin.publicKey)).to.be.true;
    expect(data.protocolFeeBps).to.equal(300);
    expect(data.marketCount.toNumber()).to.equal(0);
    expect(data.paused).to.be.false;
  });

  it("fails when protocol account already exists", async () => {
    const protocol = protocolPda(program.programId);
    try {
      await program.methods
        .initializeProtocol(100)
        .accounts(accounts({
          admin: admin.publicKey,
          protocol,
          systemProgram: anchor.web3.SystemProgram.programId,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err.message ?? String(e);
      expect(
        msg.includes("already in use") ||
        msg.includes("custom program error") ||
        msg.includes("0x0")
      ).to.be.true;
    }
  });

  it("allows fee 0 and 10000 (edge) via update", async () => {
    const protocol = protocolPda(program.programId);
    await program.methods
      .updateProtocol(0, admin.publicKey, false)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
      }))
      .rpc();
    let data = await program.account.protocol.fetch(protocol);
    expect(data.protocolFeeBps).to.equal(0);

    await program.methods
      .updateProtocol(BPS_MAX, admin.publicKey, false)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
      }))
      .rpc();
    data = await program.account.protocol.fetch(protocol);
    expect(data.protocolFeeBps).to.equal(BPS_MAX);
  });
});
