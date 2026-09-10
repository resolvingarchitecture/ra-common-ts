/** Small, dependency-light utilities ported from the `ra.common` root package. */
import { randomBytes } from "node:crypto";

import { RaError } from "./errors.js";

// ---- BytesUtil -----------------------------------------------------------

function toSigned32(value: number): number {
  return value | 0;
}

/** Interpret the first four bytes of `b` as a big-endian signed 32-bit int. */
export function packBigEndian(b: Uint8Array): number {
  return toSigned32((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!);
}

/** Encode `x` as four big-endian bytes. */
export function unpackBigEndian(x: number): Uint8Array {
  return Uint8Array.from([(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff]);
}

/** Interpret the first four bytes of `b` as a little-endian signed 32-bit int. */
export function packLittleEndian(b: Uint8Array): number {
  return toSigned32((b[3]! << 24) | (b[2]! << 16) | (b[1]! << 8) | b[0]!);
}

/** Encode `x` as four little-endian bytes. */
export function unpackLittleEndian(x: number): Uint8Array {
  return Uint8Array.from([x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff]);
}

// ---- StringUtil ---------------------------------------------------------

/** Uppercase the first character, leave the rest untouched. */
export function capitalizeFirst(text: string): string {
  return text.length === 0 ? "" : text[0]!.toUpperCase() + text.slice(1);
}

/** Uppercase the first character and every character following a space. */
export function capitalize(text: string): string {
  let out = "";
  let capitalizeNext = true;
  for (const ch of text) {
    if (capitalizeNext && ch !== " ") {
      out += ch.toUpperCase();
      capitalizeNext = false;
    } else {
      out += ch;
      capitalizeNext = ch === " ";
    }
  }
  return out;
}

// ---- VersionComparator -----------------------------------------------

const SEPARATORS = new Set([".", "-", "_"]);

function nextSeparator(s: string, start: number): number {
  let i = start;
  while (i < s.length) {
    if (SEPARATORS.has(s[i]!)) return i;
    i++;
  }
  return i;
}

function parseLong(s: string, start: number, end: number): number {
  let rv = 0;
  let parsedAny = false;
  for (let i = start; i < end && rv >= 0; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      parsedAny = true;
      rv = rv * 10 + (c - 48);
    }
  }
  return parsedAny ? rv : -1;
}

/** Compare two version strings loosely. Returns -1 / 0 / 1. */
export function versionCompare(left: string, right: string): number {
  if (left === right) return 0;
  const ll = left.length;
  const rl = right.length;
  let il = 0;
  let ir = 0;

  for (;;) {
    if (il >= ll) return ir >= rl ? 0 : -1;
    if (ir >= rl) return 1;

    let lv = -1;
    while (lv === -1 && il < ll) {
      const nl = nextSeparator(left, il);
      lv = parseLong(left, il, nl);
      il = nl + 1;
    }
    let rv = -1;
    while (rv === -1 && ir < rl) {
      const nr = nextSeparator(right, ir);
      rv = parseLong(right, ir, nr);
      ir = nr + 1;
    }
    if (lv < rv) return -1;
    if (lv > rv) return 1;
  }
}

// ---- RandomUtil -----------------------------------------------------

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHANUMERIC[bytes[i]! % ALPHANUMERIC.length];
  return out;
}

export function randomBytesOf(count: number): Uint8Array {
  return new Uint8Array(randomBytes(count));
}

/** A random signed 32-bit int in `[lower, upper)`. */
export function nextIntIn(lower: number, upper: number): number {
  return lower + Math.floor(Math.random() * (upper - lower));
}

/** A random BigInt correlation id (used for routing-slip `routeId`). */
export function nextLong(): bigint {
  const buf = randomBytes(8);
  let n = 0n;
  for (const byte of buf) n = (n << 8n) | BigInt(byte);
  return BigInt.asIntN(64, n);
}

// ---- UniqueId -----------------------------------------------------

const UNIQUE_ID_LENGTH = 32;

/** A fixed 32-byte identifier, rendered as standard padded base64 (44 chars). */
export class UniqueId {
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== UNIQUE_ID_LENGTH) {
      throw RaError.invalid(`UniqueId must be ${UNIQUE_ID_LENGTH} bytes, got ${bytes.length}`);
    }
    this.bytes = bytes;
  }

  static random(): UniqueId {
    return new UniqueId(new Uint8Array(randomBytes(UNIQUE_ID_LENGTH)));
  }

  static fromSlice(src: Uint8Array, offset = 0): UniqueId {
    const end = offset + UNIQUE_ID_LENGTH;
    if (src.length < end) throw RaError.invalid("not enough bytes for UniqueId");
    return new UniqueId(src.slice(offset, end));
  }

  static fromBase64(text: string): UniqueId {
    const raw = Buffer.from(text, "base64");
    if (raw.length !== UNIQUE_ID_LENGTH) throw RaError.decode("UniqueId must be 32 bytes");
    return new UniqueId(new Uint8Array(raw));
  }

  toBase64(): string {
    return Buffer.from(this.bytes).toString("base64");
  }

  toString(): string {
    return this.toBase64();
  }

  compare(other: UniqueId): number {
    for (let i = 0; i < UNIQUE_ID_LENGTH; i++) {
      if (this.bytes[i]! !== other.bytes[i]!) return this.bytes[i]! - other.bytes[i]!;
    }
    return 0;
  }
}

// ---- Nonce -------------------------------------------------------

/** Tracks recently-seen ids and rejects duplicates. Ports `ra.common.Nonce`. */
export class Nonce {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];
  private readonly maxSize: number;
  private readonly prunePercent: number;

  constructor(maxSize = 1_000_000, prunePercent = 10) {
    this.maxSize = maxSize;
    this.prunePercent = Math.min(100, Math.max(0, prunePercent));
  }

  /** Register `id`. Returns `true` if new, `false` if a replay. */
  continueOn(id: string | number | bigint): boolean {
    const key = String(id);
    this.prune();
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.order.push(key);
    return true;
  }

  get size(): number {
    return this.order.length;
  }

  private prune(): void {
    if (this.order.length <= this.maxSize) return;
    if (this.prunePercent === 100) {
      this.seen.clear();
      this.order.length = 0;
      return;
    }
    const toPrune = Math.floor((this.maxSize * this.prunePercent) / 100);
    for (let i = 0; i < toPrune && this.order.length > 0; i++) {
      this.seen.delete(this.order.shift()!);
    }
  }
}
