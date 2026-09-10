/**
 * Lifecycle and status contracts shared by services and long-lived components.
 *
 * Ports `ra.common.LifeCycle`, `ra.common.Status` and `ra.common.Client`.
 */
import type { Envelope } from "./envelope.js";

/** Coarse run state of a component. Ports `ra.common.Status`. */
export enum Status {
  Initialized = "Initialized",
  Starting = "Starting",
  Running = "Running",
  Paused = "Paused",
  Stopping = "Stopping",
  Stopped = "Stopped",
  Errored = "Errored",
}

/**
 * Start / pause / restart / shutdown contract. Ports `ra.common.LifeCycle`.
 *
 * Every method returns `true` on success, matching the Java API. `unpause` is
 * named as such (rather than `resume`) to mirror the Java note about the
 * `Thread.resume` clash.
 */
export interface LifeCycle {
  start(properties: Record<string, string>): boolean;
  pause?(): boolean;
  unpause?(): boolean;
  restart?(): boolean;
  shutdown(): boolean;
  gracefulShutdown?(): boolean;
}

/** A caller that a service can send a reply {@link Envelope} back to. */
export interface Client {
  reply(envelope: Envelope): void;
}
