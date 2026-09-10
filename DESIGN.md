# ra-common-ts — design notes

A TypeScript port of [`ra-common-java`](https://github.com/resolvingarchitecture/ra-common-java),
tracking the same Phase 1 scope as [`ra-common-rust`](https://github.com/resolvingarchitecture/ra-common-rust)
and [`ra-common-python`](https://github.com/resolvingarchitecture/ra-common-python).

## Decisions

- **No wire compatibility with the Java JSON.** Java's `toMap`/`fromMap` +
  hand-rolled `JSONParser` + reflective `Class.forName` polymorphism are dropped.
  Every serializable type has `toJSON()` / `static fromJSON()`; `Envelope` adds
  `toJson` / `fromJson` string helpers. Polymorphic types (`Message`, `Route`)
  carry a string tag on the wire (`kind` / `type`) and are rebuilt by
  `messageFromJSON` / `routeFromJSON`.
- **No third-party dependencies.** `node:crypto` covers hashing / PBKDF2 /
  `randomUUID`; base58 and base32 are implemented in `encoding.ts`.
- **Module layout** is one file per Java sub-package (`crypto.ts`, `identity.ts`,
  `messaging.ts`, `route.ts`, `service.ts`, `tasks.ts`, ...) plus leaf modules
  `serviceStatus.ts` (so `Envelope` can import `ServiceLevel` without the full
  service framework) and `errors.ts` / `lifecycle.ts`.
- **`bigint` for `routeId`** — Java's `long` correlation id. Serialized as a
  decimal string.
- **`TaskRunner`** is async (`setInterval` poll + per-task async chain) rather
  than thread-based; `shutdown()` returns a `Promise`.

## Idiom mapping

| Java | TypeScript |
|---|---|
| `JSONSerializable` | `toJSON()` / `static fromJSON()` |
| abstract base + `Class.forName("type")` | abstract class + a `*FromJSON` dispatcher on a `type`/`kind` tag |
| abstract base w/ shared fields (`BaseRoute`) | a `RouteMeta` object held by each route |
| abstract class w/ behaviour (`BaseService`) | abstract class methods + a `ServiceCore` the impl holds |
| static utility class (`HashUtil`) | a module of exported functions |
| `enum X { A("a") }` + `value()` | string enum with the wire string as the value |
| checked `*Exception` | `RaError` with a `kind` discriminant |
| `Stack<T>` / `DequeStack` | array (`unshift` / `shift`) for LIFO |
| `Properties` | `Record<string, string>` |

## Bugs fixed during the port (from the Java original)

- `Signature` (de)serialization was an empty stub — implemented fully.
- `BaseRoute.fromMap` read the key `"routedId"` instead of `"routeId"` — corrected.
- `Nonce` prune computed `max * (pct / 100)` → 0 — now `floor(max * pct / 100)`,
  with an O(1) `Set` membership check plus an array for eviction order.
- `DID.getPassphraseHashAlgorithm()` could NPE — `effectivePassphraseHashAlgorithm()`
  falls back to the stored field.
- `Multihash.toHex` was not zero-padded — uses `Buffer.toString("hex")`.

## Phase 2 (deferred)

`currency/*`, `locale/*`, `Scrubber`, `RegExGen`, the full network service layer,
`Protocol` (multiaddr), `ShellCommand`, `BrowserUtil`, `FileUtil`, `InfoVault*`,
`social/*`. `DLC` is folded into `Envelope` methods (not ported as a class).
