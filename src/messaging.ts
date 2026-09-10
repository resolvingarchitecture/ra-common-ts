/**
 * Messages carried inside an {@link Envelope}.
 *
 * Ports the `ra.common.messaging` package. The Java `Message` interface +
 * `BaseMessage` + concrete subclasses become a small class hierarchy tagged with
 * `kind` on the wire.
 */
import { randomUUID } from "node:crypto";

import type { Client, LifeCycle } from "./lifecycle.js";
import { Did } from "./identity.js";

export const CONTENT = "CONTENT";
export const ENTITY = "ENTITY";
export const EXCEPTIONS = "EXCEPTIONS";

// ---- Message hierarchy ---------------------------------------------

export abstract class Message {
  abstract readonly kind: string;
  errorMessages: string[] = [];

  addErrorMessage(msg: string): void {
    this.errorMessages.push(msg);
  }

  clearErrorMessages(): void {
    this.errorMessages.length = 0;
  }

  asDocument(): DocumentMessage | undefined {
    return this instanceof DocumentMessage ? this : undefined;
  }
  asCommand(): CommandMessage | undefined {
    return this instanceof CommandMessage ? this : undefined;
  }
  asEvent(): EventMessage | undefined {
    return this instanceof EventMessage ? this : undefined;
  }
  asText(): TextMessage | undefined {
    return this instanceof TextMessage ? this : undefined;
  }

  abstract toJSON(): Record<string, unknown>;
}

function withErrors(out: Record<string, unknown>, errors: string[]): Record<string, unknown> {
  if (errors.length > 0) out["error_messages"] = [...errors];
  return out;
}

export class DocumentMessage extends Message {
  readonly kind = "document";
  data: Record<string, unknown>[];

  constructor(data: Record<string, unknown>[] = [{}]) {
    super();
    this.data = data;
  }

  primary(): Record<string, unknown> {
    if (this.data.length === 0) this.data.push({});
    return this.data[0]!;
  }

  get(key: string): unknown {
    return this.data[0]?.[key];
  }

  put(key: string, value: unknown): void {
    this.primary()[key] = value;
  }

  override toJSON(): Record<string, unknown> {
    return withErrors({ kind: this.kind, data: this.data }, this.errorMessages);
  }

  static fromJSON(data: Record<string, unknown>): DocumentMessage {
    const m = new DocumentMessage((data["data"] as Record<string, unknown>[]) ?? [{}]);
    m.errorMessages = [...((data["error_messages"] as string[]) ?? [])];
    return m;
  }
}

export enum Command {
  Start = "Start",
  Shutdown = "Shutdown",
  GracefullyShutdown = "GracefullyShutdown",
  Restart = "Restart",
  Pause = "Pause",
  Unpause = "Unpause",
  NetState = "NetState",
  Report = "Report",
  RegisterStateChangeListener = "RegisterStateChangeListener",
  UnregisterStateChangeListener = "UnregisterStateChangeListener",
}

export class CommandMessage extends Message {
  readonly kind = "command";
  command?: Command;

  constructor(command?: Command) {
    super();
    this.command = command;
  }

  override toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { kind: this.kind };
    if (this.command !== undefined) out["command"] = this.command;
    return withErrors(out, this.errorMessages);
  }

  static fromJSON(data: Record<string, unknown>): CommandMessage {
    const m = new CommandMessage(data["command"] as Command | undefined);
    m.errorMessages = [...((data["error_messages"] as string[]) ?? [])];
    return m;
  }
}

export enum EventType {
  Error = "ERROR",
  Exception = "EXCEPTION",
  BusStatus = "BUS_STATUS",
  PeerStatus = "PEER_STATUS",
  ServiceStatus = "SERVICE_STATUS",
  DidStatus = "DID_STATUS",
  NetworkStateUpdate = "NETWORK_STATE_UPDATE",
  PriceChange = "PRICE_CHANGE",
}

export class EventMessage extends Message {
  readonly kind = "event";
  id: string;
  eventType: string;
  name?: string;
  message?: unknown;

  constructor(eventType: string, id?: string) {
    super();
    this.eventType = eventType;
    this.id = id ?? randomUUID();
  }

  static of(eventType: EventType): EventMessage {
    return new EventMessage(eventType);
  }

  override toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { kind: this.kind, id: this.id, event_type: this.eventType };
    if (this.name !== undefined) out["name"] = this.name;
    if (this.message !== undefined) out["message"] = this.message;
    return withErrors(out, this.errorMessages);
  }

  static fromJSON(data: Record<string, unknown>): EventMessage {
    const m = new EventMessage(data["event_type"] as string, data["id"] as string | undefined);
    m.name = data["name"] as string | undefined;
    m.message = data["message"];
    m.errorMessages = [...((data["error_messages"] as string[]) ?? [])];
    return m;
  }
}

export class TextMessage extends Message {
  readonly kind = "text";
  to?: Did;
  from?: Did;
  text?: string;

  override toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { kind: this.kind };
    if (this.to) out["to"] = this.to.toJSON();
    if (this.from) out["from"] = this.from.toJSON();
    if (this.text !== undefined) out["text"] = this.text;
    return withErrors(out, this.errorMessages);
  }

  static fromJSON(data: Record<string, unknown>): TextMessage {
    const m = new TextMessage();
    m.to = data["to"] ? Did.fromJSON(data["to"] as Record<string, unknown>) : undefined;
    m.from = data["from"] ? Did.fromJSON(data["from"] as Record<string, unknown>) : undefined;
    m.text = data["text"] as string | undefined;
    m.errorMessages = [...((data["error_messages"] as string[]) ?? [])];
    return m;
  }
}

export function messageFromJSON(data: Record<string, unknown>): Message {
  switch (data["kind"]) {
    case "document":
      return DocumentMessage.fromJSON(data);
    case "command":
      return CommandMessage.fromJSON(data);
    case "event":
      return EventMessage.fromJSON(data);
    case "text":
      return TextMessage.fromJSON(data);
    default:
      throw new Error(`unknown message kind: ${String(data["kind"])}`);
  }
}

// ---- Email ---------------------------------------------------

export const MIMETYPE_TEXT_PLAIN = "text/plain";

export interface EmailFields {
  to?: string;
  from?: string;
  subject?: string;
  message?: string;
  id?: number;
  messageType?: string;
  flag?: number;
}

export class Email {
  to?: string;
  from?: string;
  subject?: string;
  message?: string;
  id?: number;
  messageType = MIMETYPE_TEXT_PLAIN;
  flag = 0;

  constructor(fields: EmailFields = {}) {
    Object.assign(this, fields);
  }

  static anonymous(to: string, subject: string, message: string): Email {
    return new Email({ to, subject, message });
  }
}

// ---- Producer / Consumer / Channel / Bus contracts ---------

export interface MessageProducer {
  send(envelope: import("./envelope.js").Envelope): boolean;
  sendWithCallback?(envelope: import("./envelope.js").Envelope, callback: Client): boolean;
  deadLetter?(envelope: import("./envelope.js").Envelope): boolean;
}

export interface MessageConsumer {
  receive(envelope: import("./envelope.js").Envelope): boolean;
}

export interface MessageChannel extends MessageProducer, LifeCycle {
  name(): string;
  isPubSub(): boolean;
  queued(): number;
  ack(envelope: import("./envelope.js").Envelope): void;
}

export interface MessageBus extends LifeCycle {
  registerChannel(name: string, serviceLevel?: string): boolean;
  publish(envelope: import("./envelope.js").Envelope): boolean;
  publishWithCallback?(envelope: import("./envelope.js").Envelope, callback: Client): boolean;
  completed(envelope: import("./envelope.js").Envelope): boolean;
}
