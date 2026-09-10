# Resolving Architecture Common Library (TypeScript)

A TypeScript / Node port of
[`ra-common-java`](https://github.com/resolvingarchitecture/ra-common-java) —
the foundational types for the Resolving Architecture / 1M5 ecosystem.

This package provides:

- **`Envelope`** — the universal message wrapper passed between services.
- **`messaging`** — `Message` (`DocumentMessage` / `CommandMessage` /
  `EventMessage` / `TextMessage`), producer/consumer/channel/bus contracts.
- **`route`** — routing slips (`DynamicRoutingSlip`) and external/relayed routes.
- **`service`** — the `Service` / `LifeCycle` contract and `ServiceCore` shared state.
- **`identity`** — `Did`, `PublicKey`, `Signature`.
- **`crypto`** — `Hash`, `Multihash`, `HashCash`, password hashing (`node:crypto`).
- **`content`** — typed content (text / html / json / image / audio / video / binary).
- **`tasks`** — `Task` + a `setInterval`-driven `TaskRunner`.
- **`config`** — `.properties` loading + XDG directory resolution.
- utilities: base32/58, version comparison, replay `Nonce`, `UniqueId`, byte packing.

Serialization is JSON-based and **not** wire-compatible with the Java version
(the Java library used a hand-rolled JSON layer and reflective polymorphism).

## Install

```bash
npm install @resolvingarchitecture/ra-common
```

Requires Node 20+. The only runtime surface is `node:crypto` / `node:fs` /
`node:os` / `node:path` — **no third-party dependencies**.

## Usage

```ts
import { Envelope } from "@resolvingarchitecture/ra-common";

const e = Envelope.document();
e.addRoute("ra.http.HttpService", "SEND");
e.addContent({ hello: "world" });
e.ratchet();

console.assert(e.getRoute()?.service === "ra.http.HttpService");
console.assert((e.content() as { hello: string }).hello === "world");

const back = Envelope.fromJson(e.toJson());
console.assert(back.equals(e));
```

## Scripts

| script | what |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `node --test` over `test/*.test.ts` |
| `npm run build` | emit `dist/` (ESM + `.d.ts`) |

## Status

Phase 1 (core). Deferred: currency, locale/i18n, the full network service layer,
`Protocol`, shell/file/browser utilities, `InfoVault`. See `TODO.md`.

## License

MIT — see `LICENSE`.
