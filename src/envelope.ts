/**
 * The universal message wrapper passed between services.
 *
 * Ports `ra.common.Envelope` (and folds in the useful parts of the deprecated
 * `ra.common.DLC` static helpers as methods).
 */
import { randomUUID } from "node:crypto";

import { Multipart } from "./file.js";
import { compact, Did } from "./identity.js";
import {
  CommandMessage,
  CONTENT,
  DocumentMessage,
  ENTITY,
  EventMessage,
  EXCEPTIONS,
  EventType,
  Message,
  messageFromJSON,
  TextMessage,
} from "./messaging.js";
import {
  DynamicRoutingSlip,
  Route,
  routeFromJSON,
  SimpleExternalRoute,
  SimpleRoute,
} from "./route.js";
import { ServiceLevel } from "./serviceStatus.js";

export const HEADER_AUTHORIZATION = "Authorization";
export const HEADER_CONTENT_DISPOSITION = "Content-Disposition";
export const HEADER_CONTENT_TRANSFER_ENCODING = "Content-Transfer-Encoding";
export const HEADER_CONTENT_TYPE = "Content-Type";
export const HEADER_CONTENT_TYPE_JSON = "application/json";
export const HEADER_USER_AGENT = "User-Agent";

export enum MessageType {
  Document = "Document",
  Text = "Text",
  Event = "Event",
  Command = "Command",
  None = "None",
}

export enum Action {
  Post = "Post",
  Put = "Put",
  Delete = "Delete",
  Get = "Get",
}

/**
 * Wraps everything passed around the application so there is always a place for
 * header/routing metadata. Equality is by `id`.
 */
export class Envelope {
  id: string;
  dynamicRoutingSlip = new DynamicRoutingSlip();
  route?: Route;
  markers: string[] = [];
  did = new Did();
  client?: string;
  replyToClient = false;
  clientReplyAction?: string;
  url?: string;
  multipart?: Multipart;
  action?: Action;
  commandPath?: string;
  headers: Record<string, unknown> = {};
  message?: Message;
  sensitivity = 1;
  delayed = false;
  minDelay = 0;
  maxDelay = 0;
  copy = false;
  maxCopies = 0;
  minCopies = 0;
  serviceLevel: ServiceLevel = ServiceLevel.AtLeastOnce;

  constructor(id?: string, message?: Message) {
    this.id = id ?? randomUUID();
    this.message = message;
  }

  static command(): Envelope {
    return new Envelope(undefined, new CommandMessage());
  }
  static document(): Envelope {
    return new Envelope(undefined, new DocumentMessage());
  }
  static documentWithId(id: string): Envelope {
    return new Envelope(id, new DocumentMessage());
  }
  static headersOnly(): Envelope {
    return new Envelope();
  }
  static event(eventType: EventType): Envelope {
    return new Envelope(undefined, EventMessage.of(eventType));
  }
  static text(): Envelope {
    return new Envelope(undefined, new TextMessage());
  }

  // ---- headers -------------------------------------------------

  setHeader(name: string, value: unknown): void {
    this.headers[name] = value;
  }
  headerExists(name: string): boolean {
    return name in this.headers;
  }
  removeHeader(name: string): void {
    delete this.headers[name];
  }
  header(name: string): unknown {
    return this.headers[name];
  }
  contentType(): string | undefined {
    const value = this.headers[HEADER_CONTENT_TYPE];
    return typeof value === "string" ? value : undefined;
  }
  setContentType(contentType: string): void {
    this.headers[HEADER_CONTENT_TYPE] = contentType;
  }

  // ---- routing -----------------------------------------------

  getRoute(): Route | undefined {
    if (this.route === undefined) {
      const current = this.dynamicRoutingSlip.currentRoute();
      if (current !== undefined) this.route = current;
    }
    return this.route;
  }

  ratchet(): void {
    this.route = this.dynamicRoutingSlip.nextRoute();
  }

  addRoute(service: string, operation: string): void {
    this.dynamicRoutingSlip.addRoute(SimpleRoute.of(service, operation));
  }

  addExternalRoute(service: string, operation: string): void {
    this.dynamicRoutingSlip.addRoute(SimpleExternalRoute.of(service, operation));
  }

  // ---- document payload accessors --------------------------

  private doc(): DocumentMessage | undefined {
    return this.message instanceof DocumentMessage ? this.message : undefined;
  }

  addContent(content: unknown): boolean {
    const d = this.doc();
    if (d === undefined) return false;
    d.put(CONTENT, content);
    return true;
  }
  content(): unknown {
    return this.doc()?.get(CONTENT);
  }
  addEntity(entity: unknown): boolean {
    const d = this.doc();
    if (d === undefined) return false;
    d.put(ENTITY, entity);
    return true;
  }
  entity(): unknown {
    return this.doc()?.get(ENTITY);
  }
  addException(message: string): boolean {
    const d = this.doc();
    if (d === undefined) return false;
    const bucket = d.primary();
    const existing = bucket[EXCEPTIONS];
    if (Array.isArray(existing)) existing.push(message);
    else bucket[EXCEPTIONS] = [message];
    return true;
  }
  exceptions(): string[] {
    const value = this.doc()?.get(EXCEPTIONS);
    return Array.isArray(value) ? [...(value as string[])] : [];
  }
  addErrorMessage(message: string): void {
    this.message?.addErrorMessage(message);
  }
  errorMessages(): string[] {
    return this.message ? [...this.message.errorMessages] : [];
  }
  addNvp(name: string, value: unknown): boolean {
    const d = this.doc();
    if (d === undefined) return false;
    d.put(name, value);
    return true;
  }
  value(name: string): unknown {
    return this.doc()?.get(name);
  }
  values(): Record<string, unknown> | undefined {
    return this.doc()?.data[0];
  }

  // ---- markers ---------------------------------------------

  markerPresent(marker: string): boolean {
    return this.markers.includes(marker);
  }
  mark(marker: string): void {
    this.markers.push(marker);
  }

  // ---- serialization ------------------------------------

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      dynamic_routing_slip: this.dynamicRoutingSlip.toJSON(),
      markers: [...this.markers],
      did: this.did.toJSON(),
      reply_to_client: this.replyToClient,
      headers: this.headers,
      sensitivity: this.sensitivity,
      delayed: this.delayed,
      min_delay: this.minDelay,
      max_delay: this.maxDelay,
      copy: this.copy,
      max_copies: this.maxCopies,
      min_copies: this.minCopies,
      service_level: this.serviceLevel,
      ...compact({
        route: this.route?.toJSON(),
        client: this.client,
        client_reply_action: this.clientReplyAction,
        url: this.url,
        multipart: this.multipart?.toJSON(),
        action: this.action,
        command_path: this.commandPath,
        message: this.message?.toJSON(),
      }),
    };
  }

  static fromJSON(data: Record<string, unknown>): Envelope {
    const env = new Envelope(data["id"] as string | undefined);
    if (data["dynamic_routing_slip"]) {
      env.dynamicRoutingSlip = DynamicRoutingSlip.fromJSON(
        data["dynamic_routing_slip"] as Record<string, unknown>,
      );
    }
    env.route = data["route"] ? routeFromJSON(data["route"] as Record<string, unknown>) : undefined;
    env.markers = [...((data["markers"] as string[]) ?? [])];
    if (data["did"]) env.did = Did.fromJSON(data["did"] as Record<string, unknown>);
    env.client = data["client"] as string | undefined;
    env.replyToClient = Boolean(data["reply_to_client"]);
    env.clientReplyAction = data["client_reply_action"] as string | undefined;
    env.url = data["url"] as string | undefined;
    env.multipart = data["multipart"]
      ? Multipart.fromJSON(data["multipart"] as Record<string, unknown>)
      : undefined;
    env.action = data["action"] as Action | undefined;
    env.commandPath = data["command_path"] as string | undefined;
    env.headers = { ...((data["headers"] as Record<string, unknown>) ?? {}) };
    env.message = data["message"]
      ? messageFromJSON(data["message"] as Record<string, unknown>)
      : undefined;
    env.sensitivity = (data["sensitivity"] as number) ?? 1;
    env.delayed = Boolean(data["delayed"]);
    env.minDelay = (data["min_delay"] as number) ?? 0;
    env.maxDelay = (data["max_delay"] as number) ?? 0;
    env.copy = Boolean(data["copy"]);
    env.maxCopies = (data["max_copies"] as number) ?? 0;
    env.minCopies = (data["min_copies"] as number) ?? 0;
    env.serviceLevel = (data["service_level"] as ServiceLevel) ?? ServiceLevel.AtLeastOnce;
    return env;
  }

  toJson(indent = 2): string {
    return JSON.stringify(this.toJSON(), null, indent);
  }

  static fromJson(text: string): Envelope {
    return Envelope.fromJSON(JSON.parse(text) as Record<string, unknown>);
  }

  equals(other: Envelope): boolean {
    return this.id === other.id;
  }
}
