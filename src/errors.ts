/**
 * Package-wide error type. Replaces the family of checked `*Exception` classes
 * in `ra-common-java`.
 */

export type RaErrorKind =
  | "decode"
  | "crypto"
  | "invalid"
  | "service-not-found"
  | "service-not-accessible"
  | "service-not-supported"
  | "service-already-registered"
  | "file-creation-failed"
  | "io";

export class RaError extends Error {
  readonly kind: RaErrorKind;

  constructor(kind: RaErrorKind, message: string) {
    super(`${kind}: ${message}`);
    this.name = "RaError";
    this.kind = kind;
  }

  static decode(message: string): RaError {
    return new RaError("decode", message);
  }
  static crypto(message: string): RaError {
    return new RaError("crypto", message);
  }
  static invalid(message: string): RaError {
    return new RaError("invalid", message);
  }
}
