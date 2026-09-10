/**
 * Routing: routes, routing slips and external/relayed routes.
 *
 * Ports the `ra.common.route` package. The Java abstract base + reflective
 * `Class.forName` polymorphism becomes a small class hierarchy with a `type` tag
 * on the wire (`simple`, `routing_slip`, `simple_external`, `relayed_external`).
 */
import { compact } from "./identity.js";
import { NetworkPeer } from "./network.js";
import { nextLong } from "./util.js";

export interface RouteMeta {
  service?: string;
  operation?: string;
  routed: boolean;
  routeId: bigint;
}

export function newRouteMeta(service?: string, operation?: string): RouteMeta {
  return { service, operation, routed: false, routeId: nextLong() };
}

function routeMetaToJSON(m: RouteMeta): Record<string, unknown> {
  return {
    ...compact({ service: m.service, operation: m.operation }),
    routed: m.routed,
    route_id: m.routeId.toString(),
  };
}

function routeMetaFromJSON(data: Record<string, unknown> | undefined): RouteMeta {
  const d = data ?? {};
  return {
    service: d["service"] as string | undefined,
    operation: d["operation"] as string | undefined,
    routed: Boolean(d["routed"]),
    routeId: BigInt((d["route_id"] as string | number | undefined) ?? 0),
  };
}

/** Any route variant. */
export abstract class Route {
  abstract readonly type: string;
  abstract get meta(): RouteMeta;

  get service(): string | undefined {
    return this.meta.service;
  }
  get operation(): string | undefined {
    return this.meta.operation;
  }
  get routed(): boolean {
    return this.meta.routed;
  }
  set routed(value: boolean) {
    this.meta.routed = value;
  }
  get routeId(): bigint {
    return this.meta.routeId;
  }
  set routeId(value: bigint) {
    this.meta.routeId = value;
  }

  abstract toJSON(): Record<string, unknown>;
}

export class SimpleRoute extends Route {
  readonly type = "simple";
  meta: RouteMeta;

  constructor(meta: RouteMeta = newRouteMeta()) {
    super();
    this.meta = meta;
  }

  static of(service: string, operation: string): SimpleRoute {
    return new SimpleRoute(newRouteMeta(service, operation));
  }

  override toJSON(): Record<string, unknown> {
    return { type: this.type, meta: routeMetaToJSON(this.meta) };
  }

  static fromJSON(data: Record<string, unknown>): SimpleRoute {
    return new SimpleRoute(routeMetaFromJSON(data["meta"] as Record<string, unknown>));
  }
}

export class SimpleExternalRoute extends Route {
  readonly type = "simple_external";
  meta: RouteMeta;
  origination?: NetworkPeer;
  destination?: NetworkPeer;
  sendContentOnly = false;
  statusCode = 0;

  constructor(meta: RouteMeta = newRouteMeta()) {
    super();
    this.meta = meta;
  }

  static of(service: string, operation: string): SimpleExternalRoute {
    const r = new SimpleExternalRoute(newRouteMeta(service, operation));
    r.sendContentOnly = true;
    return r;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      meta: routeMetaToJSON(this.meta),
      ...compact({
        origination: this.origination?.toJSON(),
        destination: this.destination?.toJSON(),
      }),
      send_content_only: this.sendContentOnly,
      status_code: this.statusCode,
    };
  }

  static fromJSON(data: Record<string, unknown>): SimpleExternalRoute {
    const r = new SimpleExternalRoute(routeMetaFromJSON(data["meta"] as Record<string, unknown>));
    r.origination = data["origination"]
      ? NetworkPeer.fromJSON(data["origination"] as Record<string, unknown>)
      : undefined;
    r.destination = data["destination"]
      ? NetworkPeer.fromJSON(data["destination"] as Record<string, unknown>)
      : undefined;
    r.sendContentOnly = Boolean(data["send_content_only"]);
    r.statusCode = (data["status_code"] as number) ?? 0;
    return r;
  }
}

export class RelayedExternalRoute extends Route {
  readonly type = "relayed_external";
  base: SimpleExternalRoute;
  fromPeer?: NetworkPeer;
  toPeer?: NetworkPeer;
  delayed = false;
  minDelay = 0;
  maxDelay = 0;
  copy = false;
  minCopies = 0;
  maxCopies = 0;
  sensitivity = 0;

  constructor(base: SimpleExternalRoute = new SimpleExternalRoute()) {
    super();
    this.base = base;
  }

  override get meta(): RouteMeta {
    return this.base.meta;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      base: this.base.toJSON(),
      ...compact({ from_peer: this.fromPeer?.toJSON(), to_peer: this.toPeer?.toJSON() }),
      delayed: this.delayed,
      min_delay: this.minDelay,
      max_delay: this.maxDelay,
      copy: this.copy,
      min_copies: this.minCopies,
      max_copies: this.maxCopies,
      sensitivity: this.sensitivity,
    };
  }

  static fromJSON(data: Record<string, unknown>): RelayedExternalRoute {
    const r = new RelayedExternalRoute(
      SimpleExternalRoute.fromJSON((data["base"] as Record<string, unknown>) ?? {}),
    );
    r.fromPeer = data["from_peer"]
      ? NetworkPeer.fromJSON(data["from_peer"] as Record<string, unknown>)
      : undefined;
    r.toPeer = data["to_peer"]
      ? NetworkPeer.fromJSON(data["to_peer"] as Record<string, unknown>)
      : undefined;
    r.delayed = Boolean(data["delayed"]);
    r.minDelay = (data["min_delay"] as number) ?? 0;
    r.maxDelay = (data["max_delay"] as number) ?? 0;
    r.copy = Boolean(data["copy"]);
    r.minCopies = (data["min_copies"] as number) ?? 0;
    r.maxCopies = (data["max_copies"] as number) ?? 0;
    r.sensitivity = (data["sensitivity"] as number) ?? 0;
    return r;
  }
}

/** A LIFO stack of routes walked one hop at a time. */
export class DynamicRoutingSlip extends Route {
  readonly type = "routing_slip";
  meta: RouteMeta;
  private routes: Route[];
  private current?: Route;

  constructor(meta: RouteMeta = newRouteMeta(), routes: Route[] = [], current?: Route) {
    super();
    this.meta = meta;
    this.routes = routes;
    this.current = current;
  }

  /** Push `route` onto the stack, stamping it with this slip's `routeId`. */
  addRoute(route: Route): void {
    route.routeId = this.meta.routeId;
    this.routes.unshift(route);
  }

  numberRemainingRoutes(): number {
    return this.routes.length;
  }

  currentRoute(): Route | undefined {
    if (this.current === undefined) this.nextRoute();
    return this.current;
  }

  nextRoute(): Route | undefined {
    this.current = this.routes.shift();
    return this.current;
  }

  peekAtNextRoute(): Route | undefined {
    return this.routes[0];
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      meta: routeMetaToJSON(this.meta),
      routes: this.routes.map((r) => r.toJSON()),
      ...(this.current ? { current_route: this.current.toJSON() } : {}),
    };
  }

  static fromJSON(data: Record<string, unknown>): DynamicRoutingSlip {
    const rawCurrent = data["current_route"] as Record<string, unknown> | undefined;
    return new DynamicRoutingSlip(
      routeMetaFromJSON(data["meta"] as Record<string, unknown>),
      ((data["routes"] as Record<string, unknown>[]) ?? []).map(routeFromJSON),
      rawCurrent ? routeFromJSON(rawCurrent) : undefined,
    );
  }
}

export function routeFromJSON(data: Record<string, unknown>): Route {
  switch (data["type"]) {
    case "simple":
      return SimpleRoute.fromJSON(data);
    case "routing_slip":
      return DynamicRoutingSlip.fromJSON(data);
    case "simple_external":
      return SimpleExternalRoute.fromJSON(data);
    case "relayed_external":
      return RelayedExternalRoute.fromJSON(data);
    default:
      throw new Error(`unknown route type: ${String(data["type"])}`);
  }
}

export const externalStatus = {
  DESTINATION_PEER_REQUIRED: 2,
  DESTINATION_PEER_WRONG_NETWORK: 3,
  DESTINATION_PEER_NOT_FOUND: 4,
  NO_SERVICE: 7,
  NO_OPERATION: 8,
  NO_ADDRESS: 9,
  NO_FINGERPRINT: 10,
  NO_PORT: 11,
} as const;
