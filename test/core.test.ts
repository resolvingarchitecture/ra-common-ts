import assert from "node:assert/strict";
import { test } from "node:test";

import {
  base32Decode,
  base32Encode,
  base58Decode,
  base58Encode,
  Command,
  CommandMessage,
  Content,
  ContentKind,
  Did,
  DocumentMessage,
  DidStatus,
  DynamicRoutingSlip,
  Envelope,
  HashAlgorithm,
  HashCash,
  Hash,
  leadingZeroBitsForTest,
  Multihash,
  MultihashType,
  Network,
  NetworkPeer,
  Nonce,
  PublicKey,
  RunnerStatus,
  Service,
  ServiceCore,
  ServiceStatus,
  Signature,
  SimpleRoute,
  TaskRunner,
  UniqueId,
  capitalize,
  generateHash,
  generatePasswordHash,
  messageFromJSON,
  packBigEndian,
  routeFromJSON,
  taskConfigOnce,
  taskConfigPeriodic,
  unpackBigEndian,
  verifyHash,
  verifyPasswordHash,
  versionCompare,
} from "../src/index.js";

test("messaging tagged round trip", () => {
  for (const msg of [
    new DocumentMessage(),
    new CommandMessage(Command.Start),
    new CommandMessage(Command.GracefullyShutdown),
  ]) {
    const data = msg.toJSON();
    assert.ok("kind" in data);
    assert.equal(messageFromJSON(data).constructor, msg.constructor);
  }
  assert.equal(new CommandMessage(Command.GracefullyShutdown).toJSON()["command"], "GracefullyShutdown");
});

test("route slip LIFO + round trip", () => {
  const slip = new DynamicRoutingSlip();
  slip.addRoute(SimpleRoute.of("a", "op"));
  slip.addRoute(SimpleRoute.of("b", "op"));
  slip.addRoute(SimpleRoute.of("c", "op"));
  assert.equal(slip.numberRemainingRoutes(), 3);
  assert.equal(slip.nextRoute()?.service, "c");
  assert.equal(slip.nextRoute()?.service, "b");
  assert.equal(slip.peekAtNextRoute()?.service, "a");
  const back = DynamicRoutingSlip.fromJSON(JSON.parse(JSON.stringify(slip.toJSON())));
  assert.equal(back.numberRemainingRoutes(), 1);
  assert.ok(routeFromJSON(slip.toJSON()) instanceof DynamicRoutingSlip);
});

test("crypto hash + password + hashcash + multihash", () => {
  assert.ok(new Hash("abc", HashAlgorithm.Sha256).equals(new Hash("abc", HashAlgorithm.Sha1)));

  const h = generateHash(new TextEncoder().encode("Alice"), HashAlgorithm.Sha256);
  assert.ok(verifyHash(new TextEncoder().encode("Alice"), h, HashAlgorithm.Sha256));
  assert.ok(!verifyHash(new TextEncoder().encode("Bob"), h, HashAlgorithm.Sha256));

  const pw = generatePasswordHash("hunter2");
  assert.ok(pw.startsWith("1000_"));
  assert.ok(verifyPasswordHash("hunter2", pw));
  assert.ok(!verifyPasswordHash("hunter3", pw));

  const m = new Multihash(MultihashType.Sha2_256, new Uint8Array(32).fill(0xab));
  assert.ok(Multihash.fromBytes(m.toBytes()).equals(m));
  assert.ok(Multihash.fromHex(m.toHex()).equals(m));
  assert.ok(Multihash.fromBase58(m.toBase58()).equals(m));

  const hc = HashCash.mint("brian@resolvingarchitecture.io", 10);
  assert.ok(hc.computedBits() >= 10);
  assert.ok(hc.isValidFor("brian@resolvingarchitecture.io", 10));
  assert.ok(!hc.isValidFor("nope", 10));
  assert.equal(HashCash.parse(hc.token).resource, hc.resource);

  assert.equal(leadingZeroBitsForTest(new Uint8Array([0, 0, 0x0f])), 20);
  assert.equal(leadingZeroBitsForTest(new Uint8Array([0xff])), 0);
});

test("identity did + signature + public key", () => {
  const d = Did.withUsername("alice");
  d.passphrase = "secret";
  d.authenticated = true;
  d.clearSensitive();
  assert.equal(d.username, "");
  assert.equal(d.status, DidStatus.Private);

  const bob = Did.withUsername("bob");
  bob.publicKey = PublicKey.fromAddress("addr");
  bob.passphraseHash = new Hash("deadbeef", HashAlgorithm.Sha256);
  const back = Did.fromJSON(bob.toJSON());
  assert.equal(back.username, "bob");
  assert.equal(back.publicKey.address, "addr");
  assert.equal(back.passphraseHash?.hash, "deadbeef");

  const a = new Signature();
  const b = new Signature();
  assert.ok(!a.equals(b));
  a.signedByAddress = "x";
  b.signedByAddress = "x";
  assert.ok(a.equals(b));

  const pk = PublicKey.fromAddress("B32");
  pk.addSignedAttribute("email", new Signature({ signedByAddress: "signer" }));
  assert.equal(pk.signedAttributes["email"]!.length, 1);
  pk.removeSignature("email", "signer");
  assert.equal(pk.signedAttributes["email"]!.length, 0);
});

test("service command drives lifecycle", () => {
  class Toy extends Service {
    core = new ServiceCore("ra.test.Toy");
    started = false;
    start(): boolean {
      this.started = true;
      this.core.updateStatus(ServiceStatus.Running);
      return true;
    }
    shutdown(): boolean {
      this.started = false;
      return true;
    }
  }
  const toy = new Toy();
  const e = Envelope.command();
  e.message = new CommandMessage(Command.Start);
  toy.handle(e);
  assert.ok(toy.started);
  assert.equal(toy.serviceStatus(), ServiceStatus.Running);

  const r = Envelope.command();
  r.message = new CommandMessage(Command.Report);
  toy.handle(r);
  assert.ok(r.header("result") !== undefined);
});

test("task runner one-shot + periodic", async () => {
  const runner = new TaskRunner(20);
  let runs = 0;
  runner.addTask({ config: () => taskConfigOnce("c"), execute: () => (runs++, true) });
  runner.start();
  for (let i = 0; i < 100 && (runs < 1 || runner.taskCount() > 0); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(runs, 1);
  await runner.shutdown();
  assert.equal(runner.status(), RunnerStatus.Shutdown);

  const r2 = new TaskRunner(10);
  let n = 0;
  r2.addTask({ config: () => taskConfigPeriodic("p", 10), execute: () => (n++, true) });
  r2.start();
  await new Promise((r) => setTimeout(r, 150));
  await r2.shutdown();
  assert.ok(n >= 2, `expected >= 2 runs, got ${n}`);
});

test("util: bytes, strings, version, nonce, unique id", () => {
  for (const v of [0, 1, -1, 42, -(2 ** 31), 2 ** 31 - 1]) {
    assert.equal(packBigEndian(unpackBigEndian(v)), v);
  }
  assert.equal(capitalize("one two three"), "One Two Three");
  assert.equal(versionCompare("1.8", "1.11"), -1);
  assert.equal(versionCompare("2.0", "2.0.0"), -1);
  assert.equal(versionCompare("8ea", "8"), 0);
  assert.equal(versionCompare("8-ea", "8"), 1);

  const nonce = new Nonce();
  assert.ok(nonce.continueOn(1));
  assert.ok(!nonce.continueOn(1));

  const uid = UniqueId.random();
  assert.equal(uid.toBase64().length, 44);
  assert.ok(UniqueId.fromBase64(uid.toBase64()).compare(uid) === 0);
});

test("encoding round trips", () => {
  const data = new TextEncoder().encode("resolving architecture");
  assert.deepEqual(base32Decode(base32Encode(data)), data);
  assert.equal(base58Encode(new TextEncoder().encode("Hello World!")), "2NEpo7TZRRrLZSi2U");
  assert.deepEqual(base58Decode("2NEpo7TZRRrLZSi2U"), new TextEncoder().encode("Hello World!"));
});

test("content build + magnet", () => {
  const c = Content.build(new TextEncoder().encode("hello"), "text/plain", {
    name: "greeting",
    generateHash: true,
    generateFingerprint: true,
  });
  assert.equal(c.kind, ContentKind.Text);
  assert.equal(c.size, 5);
  assert.ok(c.id && c.hash && c.fingerprint);
  const back = Content.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
  assert.equal(back.kind, ContentKind.Text);
  assert.deepEqual(back.body, new TextEncoder().encode("hello"));

  const b = new Content(ContentKind.Binary, "application/octet-stream");
  b.setBody(new Uint8Array([1, 2, 3, 4]), true);
  b.addKeyword("alpha");
  b.addKeyword("beta");
  assert.ok(b.magnetLink()?.startsWith("magnet:?xl=4"));
  assert.ok(b.magnetLink()?.includes("kt=alpha+beta"));
});

test("network peer equality", () => {
  const a = new NetworkPeer(Network.Tor);
  const b = new NetworkPeer(Network.Tor);
  assert.ok(!a.equals(b));
  for (const p of [a, b]) {
    p.did.publicKey.address = "addr";
    p.did.publicKey.fingerprint = "fp";
  }
  assert.ok(a.equals(b));
  assert.equal(NetworkPeer.fromJSON(a.toJSON()).network, Network.Tor);
});
