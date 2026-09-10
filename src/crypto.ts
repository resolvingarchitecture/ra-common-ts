/**
 * Hashing, fingerprints, multihashes and proof-of-work.
 *
 * Ports the `ra.common.crypto` package plus `ra.common.HashUtil` and
 * `ra.common.HashCash`. Formats produced here mirror the Java layout but are
 * **this package's own format** - they are not required to interoperate.
 */
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { base58Decode, base58Encode } from "./encoding.js";
import { RaError } from "./errors.js";

// ---- HashAlgorithm ----------------------------------------------------

export enum HashAlgorithm {
  Sha1 = "Sha1",
  Sha256 = "Sha256",
  Sha512 = "Sha512",
  Pbkdf2HmacSha1 = "Pbkdf2HmacSha1",
}

const JCA_NAMES: Record<HashAlgorithm, string> = {
  [HashAlgorithm.Sha1]: "SHA-1",
  [HashAlgorithm.Sha256]: "SHA-256",
  [HashAlgorithm.Sha512]: "SHA-512",
  [HashAlgorithm.Pbkdf2HmacSha1]: "PBKDF2WithHmacSHA1",
};

export function hashAlgorithmJcaName(a: HashAlgorithm): string {
  return JCA_NAMES[a];
}

export function parseHashAlgorithm(text: string): HashAlgorithm {
  switch (text) {
    case "SHA-1":
    case "SHA1":
    case "Sha1":
      return HashAlgorithm.Sha1;
    case "SHA-256":
    case "SHA256":
    case "Sha256":
      return HashAlgorithm.Sha256;
    case "SHA-512":
    case "SHA512":
    case "Sha512":
      return HashAlgorithm.Sha512;
    case "PBKDF2WithHmacSHA1":
    case "Pbkdf2HmacSha1":
      return HashAlgorithm.Pbkdf2HmacSha1;
    default:
      throw RaError.invalid(`unknown hash algorithm: ${text}`);
  }
}

// ---- Hash ---------------------------------------------------------

/** A hash string with the algorithm used. Equality is on the hash string alone. */
export class Hash {
  constructor(
    public hash: string,
    public algorithm: HashAlgorithm = HashAlgorithm.Sha256,
  ) {}

  equals(other: Hash): boolean {
    return this.hash === other.hash;
  }

  toString(): string {
    return this.hash;
  }

  toJSON(): { hash: string; algorithm: HashAlgorithm } {
    return { hash: this.hash, algorithm: this.algorithm };
  }

  static fromJSON(data: { hash: string; algorithm: string }): Hash {
    return new Hash(data.hash, data.algorithm as HashAlgorithm);
  }
}

// ---- HashUtil ---------------------------------------------------

const NODE_DIGESTS: Partial<Record<HashAlgorithm, string>> = {
  [HashAlgorithm.Sha1]: "sha1",
  [HashAlgorithm.Sha256]: "sha256",
  [HashAlgorithm.Sha512]: "sha512",
};

const PBKDF2_ITERATIONS = 1000;
const PBKDF2_KEY_LEN = 64;
const SALT_LEN = 16;

export function salt(): Uint8Array {
  return new Uint8Array(randomBytes(SALT_LEN));
}

export function digest(data: Uint8Array, algorithm: HashAlgorithm): Uint8Array {
  const name = NODE_DIGESTS[algorithm];
  if (name === undefined) throw RaError.crypto("PBKDF2 is not a plain digest");
  return new Uint8Array(createHash(name).update(data).digest());
}

/** Uppercase hex of `data`, grouped into blocks of four chars separated by `:`. */
export function toHex(data: Uint8Array): string {
  const hex = Buffer.from(data).toString("hex").toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 4) groups.push(hex.slice(i, i + 4));
  return groups.join(":");
}

export function fromHex(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text.replaceAll(":", ""), "hex"));
}

export function generateFingerprint(data: Uint8Array, algorithm: HashAlgorithm): string {
  return toHex(digest(data, algorithm));
}

function b64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function unb64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function generatePasswordHash(password: string): string {
  return generatePasswordHashWithSalt(password, salt());
}

function generatePasswordHashWithSalt(password: string, s: Uint8Array): string {
  const out = pbkdf2Sync(password, Buffer.from(s), PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, "sha1");
  return `${PBKDF2_ITERATIONS}_${b64(s)}_${b64(new Uint8Array(out))}`;
}

export function verifyPasswordHash(password: string, hashToVerify: string): boolean {
  const parts = hashToVerify.split("_");
  if (parts.length !== 3) return false;
  const iterations = Number(parts[0]);
  if (!Number.isInteger(iterations)) return false;
  let s: Uint8Array;
  let expected: Uint8Array;
  try {
    s = unb64(parts[1]!);
    expected = unb64(parts[2]!);
  } catch {
    return false;
  }
  const out = new Uint8Array(pbkdf2Sync(password, Buffer.from(s), iterations, expected.length, "sha1"));
  return eq(out, expected);
}

export function generateHash(content: Uint8Array, algorithm: HashAlgorithm): string {
  if (algorithm === HashAlgorithm.Pbkdf2HmacSha1) {
    return generatePasswordHash(Buffer.from(content).toString("utf-8"));
  }
  const s = salt();
  const h = digest(concat(s, content), algorithm);
  return `${b64(h)}_${b64(s)}`;
}

export function verifyHash(
  content: Uint8Array,
  hashToVerify: string,
  algorithm: HashAlgorithm,
): boolean {
  if (algorithm === HashAlgorithm.Pbkdf2HmacSha1) {
    return verifyPasswordHash(Buffer.from(content).toString("utf-8"), hashToVerify);
  }
  const [hB64, sB64] = hashToVerify.split("_", 2);
  if (hB64 === undefined || sB64 === undefined) throw RaError.invalid("malformed hash");
  const expected = unb64(hB64);
  const s = unb64(sB64);
  return eq(digest(concat(s, content), algorithm), expected);
}

// ---- Multihash -------------------------------------------------

export enum MultihashType {
  Sha1 = "Sha1",
  Sha2_256 = "Sha2_256",
  Sha2_512 = "Sha2_512",
  Sha3 = "Sha3",
  Blake2b = "Blake2b",
  Blake2s = "Blake2s",
}

const MULTIHASH_CODES: Record<MultihashType, [number, number]> = {
  [MultihashType.Sha1]: [0x11, 20],
  [MultihashType.Sha2_256]: [0x12, 32],
  [MultihashType.Sha2_512]: [0x13, 64],
  [MultihashType.Sha3]: [0x14, 64],
  [MultihashType.Blake2b]: [0x40, 64],
  [MultihashType.Blake2s]: [0x41, 32],
};

export function multihashCode(t: MultihashType): number {
  return MULTIHASH_CODES[t][0];
}

export function multihashLength(t: MultihashType): number {
  return MULTIHASH_CODES[t][1];
}

export function multihashTypeFromCode(code: number): MultihashType {
  for (const [name, [c]] of Object.entries(MULTIHASH_CODES)) {
    if (c === code) return name as MultihashType;
  }
  throw RaError.invalid(`unknown multihash type: 0x${code.toString(16)}`);
}

export class Multihash {
  readonly kind: MultihashType;
  readonly digest: Uint8Array;

  constructor(kind: MultihashType, digestBytes: Uint8Array) {
    if (digestBytes.length > 127) throw RaError.invalid(`unsupported hash size: ${digestBytes.length}`);
    if (digestBytes.length !== multihashLength(kind)) {
      throw RaError.invalid(
        `incorrect hash length: ${digestBytes.length} != ${multihashLength(kind)}`,
      );
    }
    this.kind = kind;
    this.digest = digestBytes;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from([multihashCode(this.kind), this.digest.length, ...this.digest]);
  }

  static fromBytes(data: Uint8Array): Multihash {
    if (data.length < 2) throw RaError.invalid("multihash too short");
    const kind = multihashTypeFromCode(data[0]!);
    const length = data[1]!;
    if (data.length < 2 + length) throw RaError.invalid("multihash truncated");
    return new Multihash(kind, data.slice(2, 2 + length));
  }

  toHex(): string {
    return Buffer.from(this.toBytes()).toString("hex");
  }

  static fromHex(text: string): Multihash {
    return Multihash.fromBytes(new Uint8Array(Buffer.from(text, "hex")));
  }

  toBase58(): string {
    return base58Encode(this.toBytes());
  }

  static fromBase58(text: string): Multihash {
    return Multihash.fromBytes(base58Decode(text));
  }

  equals(other: Multihash): boolean {
    return this.toHex() === other.toHex();
  }

  toString(): string {
    return this.toBase58();
  }

  toJSON(): { type: MultihashType; hash: number[] } {
    return { type: this.kind, hash: [...this.digest] };
  }

  static fromJSON(data: { type: string; hash: number[] }): Multihash {
    return new Multihash(data.type as MultihashType, Uint8Array.from(data.hash));
  }
}

// ---- HashCash -------------------------------------------------

const HASH_BITS = 160;

function leadingZeroBits(data: Uint8Array): number {
  let total = 0;
  for (const byte of data) {
    if (byte === 0) {
      total += 8;
    } else {
      total += 8 - byte.toString(2).length;
      break;
    }
  }
  return total;
}

function sha1Bits(token: string): number {
  return leadingZeroBits(new Uint8Array(createHash("sha1").update(token).digest()));
}

function serializeExtensions(ext: Record<string, string[]>): string {
  const keys = Object.keys(ext);
  if (keys.length === 0) return "";
  return keys
    .map((key) => {
      if (/[:;=]/.test(key)) throw RaError.invalid(`illegal char in extension key: ${key}`);
      const values = ext[key]!;
      if (values.length === 0) return key;
      for (const v of values) {
        if (/[:;,]/.test(v)) throw RaError.invalid(`illegal char in extension value: ${v}`);
      }
      return `${key}=${values.join(",")}`;
    })
    .join(";");
}

function deserializeExtensions(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (text === "") return out;
  for (const item of text.split(";")) {
    const eq = item.indexOf("=");
    if (eq === -1) out[item] = [];
    else out[item.slice(0, eq)] = item.slice(eq + 1).split(",");
  }
  return out;
}

function fmtYYMMDD(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function parseYYMMDD(s: string): Date {
  if (!/^\d{6}$/.test(s)) throw RaError.invalid(`bad hashcash date: ${s}`);
  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  const year = 2000 + yy;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    throw RaError.invalid(`bad hashcash date: ${s}`);
  }
  return date;
}

export class HashCash {
  private constructor(
    readonly token: string,
    readonly value: number,
    readonly resource: string,
    readonly date: Date,
    readonly version: number,
    readonly extensions: Record<string, string[]>,
  ) {}

  static mint(resource: string, bits: number): HashCash {
    return HashCash.mintWith(resource, {}, new Date(), bits, 1);
  }

  static mintWith(
    resource: string,
    extensions: Record<string, string[]>,
    date: Date,
    bits: number,
    version: number,
  ): HashCash {
    if (version > 1) throw RaError.invalid("only hashcash versions 0 and 1 are supported");
    if (bits > HASH_BITS) throw RaError.invalid("value must be between 0 and 160");
    if (resource.includes(":")) throw RaError.invalid("resource may not contain a colon");
    const extStr = serializeExtensions(extensions);
    const dateStr = fmtYYMMDD(date);
    const prefix =
      version === 0
        ? `0:${dateStr}:${resource}:${extStr}:`
        : `1:${bits}:${dateStr}:${resource}:${extStr}:`;
    const token = HashCash.generate(prefix, bits);
    const value = version === 0 ? sha1Bits(token) : bits;
    return new HashCash(token, value, resource, date, version, { ...extensions });
  }

  private static generate(prefix: string, bits: number): string {
    const rnd = randomBytes(8).toString("hex");
    let counter = BigInt(`0x${randomBytes(8).toString("hex")}`);
    const stem = `${prefix}${rnd}:`;
    for (;;) {
      counter += 1n;
      const candidate = `${stem}${counter.toString(16)}`;
      if (sha1Bits(candidate) >= bits) return candidate;
    }
  }

  static parse(token: string): HashCash {
    const parts = token.split(":");
    const version = Number(parts[0]);
    if (!Number.isInteger(version)) throw RaError.invalid("bad hashcash version");
    const expected = version === 0 ? 6 : version === 1 ? 7 : -1;
    if (expected === -1) throw RaError.invalid("only hashcash versions 0 and 1 are supported");
    if (parts.length !== expected) throw RaError.invalid("improperly formed hashcash");
    let idx = 1;
    let claimedBits = 0;
    if (version === 1) {
      claimedBits = Number(parts[idx]);
      if (!Number.isInteger(claimedBits)) throw RaError.invalid("bad hashcash bits");
      idx++;
    }
    const date = parseYYMMDD(parts[idx]!);
    idx++;
    const resource = parts[idx]!;
    idx++;
    const extensions = deserializeExtensions(parts[idx]!);
    const actual = sha1Bits(token);
    const value = version === 0 ? actual : Math.min(actual, claimedBits);
    return new HashCash(token, value, resource, date, version, extensions);
  }

  computedBits(): number {
    return sha1Bits(this.token);
  }

  isValidFor(resource: string, minBits: number): boolean {
    return this.resource === resource && this.computedBits() >= minBits;
  }

  toString(): string {
    return this.token;
  }
}

export const leadingZeroBitsForTest = leadingZeroBits;

// ---- EncryptionAlgorithm -------------------------------------

export enum EncryptionAlgorithm {
  Cast5 = "Cast5",
  Aes256 = "Aes256",
  Aes512 = "Aes512",
}

const ENCRYPTION_NAMES: Record<EncryptionAlgorithm, string> = {
  [EncryptionAlgorithm.Cast5]: "CAST-5",
  [EncryptionAlgorithm.Aes256]: "AES-256",
  [EncryptionAlgorithm.Aes512]: "AES-512",
};

export function encryptionAlgorithmName(a: EncryptionAlgorithm): string {
  return ENCRYPTION_NAMES[a];
}

// ---- Addressable --------------------------------------------

export interface Addressable {
  fingerprint?: string;
  address?: string;
}
