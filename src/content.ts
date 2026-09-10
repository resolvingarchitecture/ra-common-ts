/**
 * Typed content submitted to the network for dissemination.
 *
 * Ports `ra.common.content.Content` and its subclasses (`Text`, `HTML`, `JSON`,
 * `Binary`, `Image`, `Audio`, `Video`). The Java class hierarchy collapses into
 * one {@link Content} class tagged with a {@link ContentKind}.
 */
import {
  EncryptionAlgorithm,
  generateFingerprint,
  generateHash,
  Hash,
  HashAlgorithm,
  hashAlgorithmJcaName,
} from "./crypto.js";
import { RaError } from "./errors.js";
import { compact } from "./identity.js";
import { randomAlphanumeric } from "./util.js";

export enum ContentKind {
  Text = "Text",
  Html = "Html",
  Json = "Json",
  Image = "Image",
  Audio = "Audio",
  Video = "Video",
  Binary = "Binary",
}

export function contentKindForType(contentType: string): ContentKind | undefined {
  if (contentType.startsWith("text/plain")) return ContentKind.Text;
  if (contentType.startsWith("text/html")) return ContentKind.Html;
  if (contentType.startsWith("application/json")) return ContentKind.Json;
  if (contentType.startsWith("image/")) return ContentKind.Image;
  if (contentType.startsWith("audio/")) return ContentKind.Audio;
  if (contentType.startsWith("video/")) return ContentKind.Video;
  return undefined;
}

export function contentKindIsText(kind: ContentKind): boolean {
  return kind === ContentKind.Text || kind === ContentKind.Html || kind === ContentKind.Json;
}

export class Content {
  kind: ContentKind;
  contentType: string;
  version = 0;
  id?: string;
  label?: string;
  name?: string;
  location?: string;
  size = 0;
  authorAlias?: string;
  authorAddress?: string;
  body?: Uint8Array;
  bodyEncoding?: string;
  bodyBase64Encoded = false;
  createdAt?: number;
  hash?: Hash;
  hashAlgorithm: HashAlgorithm = HashAlgorithm.Sha256;
  fingerprint?: Hash;
  fingerprintAlgorithm: HashAlgorithm = HashAlgorithm.Sha1;
  children: Content[] = [];
  encrypted = false;
  encryptionAlgorithm?: EncryptionAlgorithm;
  encryptionPassphrase?: string;
  encryptionPassphraseEncrypted = false;
  encryptionPassphraseAlgorithm?: EncryptionAlgorithm;
  base64EncodedIv?: string;
  keywords: string[] = [];
  readable = false;
  writeable = false;

  constructor(kind: ContentKind, contentType: string) {
    this.kind = kind;
    this.contentType = contentType;
  }

  static build(
    body: Uint8Array,
    contentType: string,
    opts: {
      label?: string;
      name?: string;
      generateHash?: boolean;
      generateFingerprint?: boolean;
    } = {},
  ): Content {
    const kind = contentKindForType(contentType);
    if (kind === undefined) throw RaError.invalid(`unsupported content type: ${contentType}`);
    const c = new Content(kind, contentType);
    c.label = opts.label;
    c.name = opts.name;
    if (contentType.includes("charset:")) {
      c.bodyEncoding = contentType.split("charset:")[1];
    }
    c.setBody(body, opts.generateHash ?? false, opts.generateFingerprint ?? false);
    c.createdAt = Date.now();
    c.id = randomAlphanumeric(32);
    return c;
  }

  setBody(body: Uint8Array, generateHashFlag = false, generateFingerprintFlag = false): void {
    this.size = body.length;
    if (generateHashFlag) {
      this.hash = new Hash(generateHash(body, this.hashAlgorithm), this.hashAlgorithm);
    }
    if (generateFingerprintFlag && this.hash !== undefined) {
      const fp = generateFingerprint(
        new TextEncoder().encode(this.hash.hash),
        this.fingerprintAlgorithm,
      );
      this.fingerprint = new Hash(fp, this.fingerprintAlgorithm);
    }
    this.body = body;
    this.version += 1;
  }

  metaOnly(): boolean {
    return this.body === undefined;
  }

  addKeyword(keyword: string): void {
    this.keywords.push(keyword);
  }

  addChild(child: Content): void {
    this.children.push(child);
  }

  magnetLink(): string | undefined {
    const parts: string[] = [];
    if (this.body !== undefined) parts.push(`xl=${this.body.length}`);
    if (this.hash !== undefined) {
      parts.push(`xt=urn:${hashAlgorithmJcaName(this.hash.algorithm).toLowerCase()}:${this.hash.hash}`);
    }
    if (this.keywords.length > 0) parts.push(`kt=${this.keywords.join("+")}`);
    return parts.length > 0 ? `magnet:?${parts.join("&")}` : undefined;
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      type: this.kind,
      content_type: this.contentType,
      version: this.version,
      ...compact({
        id: this.id,
        label: this.label,
        name: this.name,
        location: this.location,
        author_alias: this.authorAlias,
        author_address: this.authorAddress,
        body: this.body ? Buffer.from(this.body).toString("base64") : undefined,
        body_encoding: this.bodyEncoding,
        created_at: this.createdAt,
        hash: this.hash?.toJSON(),
        fingerprint: this.fingerprint?.toJSON(),
        encryption_algorithm: this.encryptionAlgorithm,
        encryption_passphrase: this.encryptionPassphrase,
        encryption_passphrase_algorithm: this.encryptionPassphraseAlgorithm,
        base64_encoded_iv: this.base64EncodedIv,
      }),
      size: this.size,
      body_base64_encoded: this.bodyBase64Encoded,
      hash_algorithm: this.hashAlgorithm,
      fingerprint_algorithm: this.fingerprintAlgorithm,
      encrypted: this.encrypted,
      encryption_passphrase_encrypted: this.encryptionPassphraseEncrypted,
      readable: this.readable,
      writeable: this.writeable,
    };
    if (this.children.length > 0) out["children"] = this.children.map((c) => c.toJSON());
    if (this.keywords.length > 0) out["keywords"] = [...this.keywords];
    return out;
  }

  static fromJSON(data: Record<string, unknown>): Content {
    const c = new Content(data["type"] as ContentKind, data["content_type"] as string);
    c.version = (data["version"] as number) ?? 0;
    c.id = data["id"] as string | undefined;
    c.label = data["label"] as string | undefined;
    c.name = data["name"] as string | undefined;
    c.location = data["location"] as string | undefined;
    c.size = (data["size"] as number) ?? 0;
    c.authorAlias = data["author_alias"] as string | undefined;
    c.authorAddress = data["author_address"] as string | undefined;
    c.body = data["body"] ? new Uint8Array(Buffer.from(data["body"] as string, "base64")) : undefined;
    c.bodyEncoding = data["body_encoding"] as string | undefined;
    c.bodyBase64Encoded = Boolean(data["body_base64_encoded"]);
    c.createdAt = data["created_at"] as number | undefined;
    c.hash = data["hash"]
      ? Hash.fromJSON(data["hash"] as { hash: string; algorithm: string })
      : undefined;
    c.hashAlgorithm = (data["hash_algorithm"] as HashAlgorithm) ?? HashAlgorithm.Sha256;
    c.fingerprint = data["fingerprint"]
      ? Hash.fromJSON(data["fingerprint"] as { hash: string; algorithm: string })
      : undefined;
    c.fingerprintAlgorithm = (data["fingerprint_algorithm"] as HashAlgorithm) ?? HashAlgorithm.Sha1;
    c.children = ((data["children"] as Record<string, unknown>[]) ?? []).map((x) =>
      Content.fromJSON(x),
    );
    c.encrypted = Boolean(data["encrypted"]);
    c.encryptionAlgorithm = data["encryption_algorithm"] as EncryptionAlgorithm | undefined;
    c.encryptionPassphrase = data["encryption_passphrase"] as string | undefined;
    c.encryptionPassphraseEncrypted = Boolean(data["encryption_passphrase_encrypted"]);
    c.encryptionPassphraseAlgorithm = data["encryption_passphrase_algorithm"] as
      | EncryptionAlgorithm
      | undefined;
    c.base64EncodedIv = data["base64_encoded_iv"] as string | undefined;
    c.keywords = [...((data["keywords"] as string[]) ?? [])];
    c.readable = Boolean(data["readable"]);
    c.writeable = Boolean(data["writeable"]);
    return c;
  }
}
