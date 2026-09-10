/**
 * ra-common: foundational types for the Resolving Architecture / 1M5 ecosystem.
 *
 * A TypeScript port of
 * [`ra-common-java`](https://github.com/resolvingarchitecture/ra-common-java).
 * Serialization is JSON-based and **not** wire-compatible with the Java library.
 *
 * @packageDocumentation
 */
export * from "./errors.js";
export * from "./lifecycle.js";
export * from "./encoding.js";
export * from "./util.js";
export * from "./crypto.js";
export * from "./identity.js";
export * from "./network.js";
export * from "./route.js";
export * from "./messaging.js";
export * from "./serviceStatus.js";
export { RA_SERVICE_IMPL, Service, ServiceCore } from "./service.js";
export * from "./content.js";
export * from "./file.js";
export * from "./tasks.js";
export * from "./config.js";
export * from "./envelope.js";

export const version = "0.1.0";
