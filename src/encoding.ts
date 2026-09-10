/**
 * Base32 and Base58 string codecs.
 *
 * Ports `ra.common.Base32` and `ra.common.Base58`. Since this port is not
 * wire-compatible we use standard implementations:
 * - **base32**: RFC 4648, uppercase `A-Z2-7`, no padding.
 * - **base58**: the Bitcoin alphabet.
 */
import { RaError } from "./errors.js";

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B32_INDEX = new Map([...B32_ALPHABET].map((c, i) => [c, i] as const));

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_INDEX = new Map([...B58_ALPHABET].map((c, i) => [c, i] as const));

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const idx = B32_INDEX.get(ch);
    if (idx === undefined) throw RaError.decode(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export function base58Encode(data: Uint8Array): string {
  let n = 0n;
  for (const byte of data) n = (n << 8n) | BigInt(byte);
  let out = "";
  while (n > 0n) {
    const rem = Number(n % 58n);
    n /= 58n;
    out = B58_ALPHABET[rem] + out;
  }
  let pad = 0;
  for (const byte of data) {
    if (byte === 0) pad++;
    else break;
  }
  return B58_ALPHABET[0]!.repeat(pad) + out;
}

export function base58Decode(text: string): Uint8Array {
  let n = 0n;
  for (const ch of text) {
    const idx = B58_INDEX.get(ch);
    if (idx === undefined) throw RaError.decode(`invalid base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  let pad = 0;
  for (const ch of text) {
    if (ch === B58_ALPHABET[0]) pad++;
    else break;
  }
  return Uint8Array.from([...new Array(pad).fill(0), ...bytes]);
}
