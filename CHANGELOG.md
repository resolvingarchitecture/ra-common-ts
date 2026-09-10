# Changelog

## 0.1.0 — unreleased

Initial port of `ra-common-java` Phase 1 to TypeScript / Node.

- `Envelope` + `MessageType` / `Action`, factories, routing-slip walk, document
  content/entity/exception/NVP accessors, headers, markers, JSON round-trip.
- `messaging`: `Message` hierarchy, `Email`, `Command` / `EventType` enums,
  `MessageProducer` / `MessageConsumer` / `MessageChannel` / `MessageBus` contracts.
- `route`: `RouteMeta`, `SimpleRoute`, `DynamicRoutingSlip` (LIFO),
  `SimpleExternalRoute`, `RelayedExternalRoute`.
- `service`: `Service` + `ServiceCore`, `ServiceStatus` (19 states),
  `ServiceLevel`, `ServiceReport`, `ServiceStatusObserver`.
- `identity`: `Did` (+ `DidStatus` / `DidType`), `PublicKey`, `Signature`.
- `crypto`: `Hash` / `HashAlgorithm`, digests / fingerprints / salted + PBKDF2
  password hashing, `Multihash`, `HashCash` (v0/v1), `EncryptionAlgorithm`.
- `content`: `Content` / `ContentKind`, `build`, magnet links.
- `tasks`: `Task` / `TaskConfig` / `TaskStatus`, `setInterval`-driven `TaskRunner`.
- `config`: `.properties` / args / env loading, `SystemSettings` (XDG dirs).
- `network`: `Network`, `NetworkStatus`, `NetworkPeer` (minimal slice).
- `file`: `Multipart`.
- `util`: byte packing, `capitalize*`, `versionCompare`, random helpers,
  `UniqueId`, `Nonce`.
- `encoding`: base32 (RFC 4648, unpadded), base58 (Bitcoin alphabet).
