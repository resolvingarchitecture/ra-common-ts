/** Identity types. Ports the `ra.common.identity` package. */
import { Hash, HashAlgorithm } from "./crypto.js";

// ---- Signature -------------------------------------------------

export interface SignatureFields {
  valueSigned?: string;
  algorithm?: string;
  signedDate?: Date;
  signedByUsername?: string;
  signedByFingerprint?: string;
  signedByAddress?: string;
}

/**
 * A detached signature over some value. This package does not sign or verify;
 * `Signature` is a metadata record carried inside {@link PublicKey}. Equality is
 * on `signedByAddress`.
 *
 * The Java `toMap`/`fromMap` were empty stubs; this port (de)serializes fully.
 */
export class Signature implements SignatureFields {
  valueSigned?: string;
  algorithm?: string;
  signedDate?: Date;
  signedByUsername?: string;
  signedByFingerprint?: string;
  signedByAddress?: string;

  constructor(fields: SignatureFields = {}) {
    Object.assign(this, fields);
  }

  equals(other: Signature): boolean {
    return this.signedByAddress !== undefined && this.signedByAddress === other.signedByAddress;
  }

  toJSON(): Record<string, unknown> {
    return compact({
      value_signed: this.valueSigned,
      algorithm: this.algorithm,
      signed_date: this.signedDate?.toISOString(),
      signed_by_username: this.signedByUsername,
      signed_by_fingerprint: this.signedByFingerprint,
      signed_by_address: this.signedByAddress,
    });
  }

  static fromJSON(data: Record<string, unknown>): Signature {
    return new Signature({
      valueSigned: data["value_signed"] as string | undefined,
      algorithm: data["algorithm"] as string | undefined,
      signedDate: data["signed_date"] ? new Date(data["signed_date"] as string) : undefined,
      signedByUsername: data["signed_by_username"] as string | undefined,
      signedByFingerprint: data["signed_by_fingerprint"] as string | undefined,
      signedByAddress: data["signed_by_address"] as string | undefined,
    });
  }
}

// ---- PublicKey -----------------------------------------------

export class PublicKey {
  alias?: string;
  fingerprint?: string;
  address?: string;
  keyType?: string;
  isIdentityKey = false;
  isEncryptionKey = false;
  isBase64Encoded = false;
  isBase58Encoded = false;
  isPem = false;
  isHex = false;
  attributes: Record<string, unknown> = {};
  signedAttributes: Record<string, Signature[]> = {};

  static fromAddress(address: string): PublicKey {
    const pk = new PublicKey();
    pk.address = address;
    return pk;
  }

  addAttribute(name: string, value: unknown): void {
    this.attributes[name] = value;
  }

  attribute(name: string): unknown {
    return this.attributes[name];
  }

  addSignedAttribute(name: string, signature: Signature): void {
    (this.signedAttributes[name] ??= []).push(signature);
  }

  removeSignature(name: string, signedByAddress: string): void {
    const sigs = this.signedAttributes[name];
    if (sigs) {
      this.signedAttributes[name] = sigs.filter((s) => s.signedByAddress !== signedByAddress);
    }
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = compact({
      alias: this.alias,
      fingerprint: this.fingerprint,
      address: this.address,
      type: this.keyType,
    });
    for (const [flag, key] of [
      [this.isIdentityKey, "is_identity_key"],
      [this.isEncryptionKey, "is_encryption_key"],
      [this.isBase64Encoded, "is_base64_encoded"],
      [this.isBase58Encoded, "is_base58_encoded"],
      [this.isPem, "is_pem"],
      [this.isHex, "is_hex"],
    ] as const) {
      if (flag) out[key] = true;
    }
    if (Object.keys(this.attributes).length > 0) out["attributes"] = this.attributes;
    if (Object.keys(this.signedAttributes).length > 0) {
      out["signed_attributes"] = Object.fromEntries(
        Object.entries(this.signedAttributes).map(([k, v]) => [k, v.map((s) => s.toJSON())]),
      );
    }
    return out;
  }

  static fromJSON(data: Record<string, unknown>): PublicKey {
    const pk = new PublicKey();
    pk.alias = data["alias"] as string | undefined;
    pk.fingerprint = data["fingerprint"] as string | undefined;
    pk.address = data["address"] as string | undefined;
    pk.keyType = data["type"] as string | undefined;
    pk.isIdentityKey = Boolean(data["is_identity_key"]);
    pk.isEncryptionKey = Boolean(data["is_encryption_key"]);
    pk.isBase64Encoded = Boolean(data["is_base64_encoded"]);
    pk.isBase58Encoded = Boolean(data["is_base58_encoded"]);
    pk.isPem = Boolean(data["is_pem"]);
    pk.isHex = Boolean(data["is_hex"]);
    pk.attributes = { ...((data["attributes"] as Record<string, unknown>) ?? {}) };
    pk.signedAttributes = Object.fromEntries(
      Object.entries((data["signed_attributes"] as Record<string, Record<string, unknown>[]>) ?? {}).map(
        ([k, v]) => [k, v.map((s) => Signature.fromJSON(s))],
      ),
    );
    return pk;
  }
}

// ---- DID -------------------------------------------------

export enum DidStatus {
  Inactive = "Inactive",
  Active = "Active",
  Suspended = "Suspended",
  Private = "Private",
}

export enum DidType {
  Contact = "Contact",
  Identity = "Identity",
  Node = "Node",
}

/** Anything carrying personally-identifiable information that can be scrubbed. */
export interface PiiClearable {
  clearSensitive(): void;
}

export class Did implements PiiClearable {
  username = "Anon";
  passphrase?: string;
  passphrase2?: string;
  passphraseHash?: Hash;
  passphraseHashAlgorithm: HashAlgorithm = HashAlgorithm.Pbkdf2HmacSha1;
  description = "";
  status: DidStatus = DidStatus.Inactive;
  didType: DidType = DidType.Identity;
  verified = false;
  authenticated = false;
  publicKey: PublicKey = new PublicKey();

  static withUsername(username: string): Did {
    const d = new Did();
    d.username = username;
    return d;
  }

  effectivePassphraseHashAlgorithm(): HashAlgorithm {
    return this.passphraseHash?.algorithm ?? this.passphraseHashAlgorithm;
  }

  clearSensitive(): void {
    this.username = "";
    this.passphrase = undefined;
    this.passphrase2 = undefined;
    this.description = "";
    this.status = DidStatus.Private;
    this.verified = false;
    this.authenticated = false;
  }

  toJSON(): Record<string, unknown> {
    return {
      username: this.username,
      ...compact({
        passphrase: this.passphrase,
        passphrase2: this.passphrase2,
        passphrase_hash: this.passphraseHash?.toJSON(),
      }),
      passphrase_hash_algorithm: this.passphraseHashAlgorithm,
      description: this.description,
      status: this.status,
      did_type: this.didType,
      verified: this.verified,
      authenticated: this.authenticated,
      public_key: this.publicKey.toJSON(),
    };
  }

  static fromJSON(data: Record<string, unknown>): Did {
    const d = new Did();
    d.username = (data["username"] as string) ?? "Anon";
    d.passphrase = data["passphrase"] as string | undefined;
    d.passphrase2 = data["passphrase2"] as string | undefined;
    d.passphraseHash = data["passphrase_hash"]
      ? Hash.fromJSON(data["passphrase_hash"] as { hash: string; algorithm: string })
      : undefined;
    d.passphraseHashAlgorithm =
      (data["passphrase_hash_algorithm"] as HashAlgorithm) ?? HashAlgorithm.Pbkdf2HmacSha1;
    d.description = (data["description"] as string) ?? "";
    d.status = (data["status"] as DidStatus) ?? DidStatus.Inactive;
    d.didType = (data["did_type"] as DidType) ?? DidType.Identity;
    d.verified = Boolean(data["verified"]);
    d.authenticated = Boolean(data["authenticated"]);
    d.publicKey = PublicKey.fromJSON((data["public_key"] as Record<string, unknown>) ?? {});
    return d;
  }
}

// ---- shared helper ---------------------------------------

export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}
