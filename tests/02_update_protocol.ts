import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  accounts,
  admin,
  BPS_MAX,
  delay,
  program,
  protocolPda,
  SUITE_DELAY_MS,
} from "./helpers";

describe("update_protocol", () => {
  before(async () => await delay(SUITE_DELAY_MS));
  it("updates fee, treasury, and paused", async () => {
    const protocol = protocolPda(program.programId);
    const newTreasury = anchor.web3.Keypair.generate().publicKey;
    await program.methods
      .updateProtocol(500, newTreasury, true)
      .accounts(accounts({
        adminAuthority: admin.publicKey,
        protocol,
      }))
      .rpc();

    const data = await program.account.protocol.fetch(protocol);
    expect(data.protocolFeeBps).to.equal(500);
    expect(data.treasury.equals(newTreasury)).to.be.true;
    expect(data.paused).to.be.true;
  });

  it("rejects non-admin signer", async () => {
    const protocol = protocolPda(program.programId);
    const other = anchor.web3.Keypair.generate();
    // No airdrop: provider wallet pays tx fee; we only need other to sign so program rejects Unauthorized.

    try {
      await program.methods
        .updateProtocol(100, admin.publicKey, false)
        .accounts(accounts({
          adminAuthority: other.publicKey,
          protocol,
        }))
        .signers([other])
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("Unauthorized");
    }
  });

  it("rejects fee > 10000", async () => {
    const protocol = protocolPda(program.programId);
    try {
      await program.methods
        .updateProtocol(BPS_MAX + 1, admin.publicKey, false)
        .accounts(accounts({
          adminAuthority: admin.publicKey,
          protocol,
        }))
        .rpc();
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const err = e as { message?: string };
      expect(err.message || err).to.include("InvalidProtocolFeeBps");
    }
  });
});
