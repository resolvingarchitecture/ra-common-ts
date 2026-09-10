import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandMessage,
  DocumentMessage,
  Envelope,
  EventMessage,
  EventType,
  HEADER_CONTENT_TYPE_JSON,
} from "../src/index.js";

test("factories set message kind", () => {
  assert.ok(Envelope.document().message instanceof DocumentMessage);
  assert.ok(Envelope.command().message instanceof CommandMessage);
  assert.ok(Envelope.event(EventType.BusStatus).message instanceof EventMessage);
  assert.equal(Envelope.headersOnly().message, undefined);
});

test("content round-trips through a document", () => {
  const e = Envelope.document();
  assert.ok(e.addContent("hello"));
  assert.equal(e.content(), "hello");
  assert.ok(!Envelope.command().addContent(null));
});

test("exceptions accumulate", () => {
  const e = Envelope.document();
  e.addException("first");
  e.addException("second");
  assert.deepEqual(e.exceptions(), ["first", "second"]);
});

test("ratchet walks the slip LIFO", () => {
  const e = Envelope.document();
  e.addRoute("ra.a.ServiceA", "OP");
  e.addRoute("ra.b.ServiceB", "OP");
  e.ratchet();
  assert.equal(e.route?.service, "ra.b.ServiceB");
  e.ratchet();
  assert.equal(e.route?.service, "ra.a.ServiceA");
});

test("json round trip", () => {
  const e = Envelope.document();
  e.setContentType(HEADER_CONTENT_TYPE_JSON);
  e.addContent(42);
  e.addRoute("ra.x.Svc", "DO");
  e.mark("seen");
  const back = Envelope.fromJson(e.toJson());
  assert.equal(back.id, e.id);
  assert.equal(back.contentType(), HEADER_CONTENT_TYPE_JSON);
  assert.equal(back.content(), 42);
  assert.ok(back.markerPresent("seen"));
  assert.equal(back.dynamicRoutingSlip.numberRemainingRoutes(), 1);
});

test("equality is by id", () => {
  assert.ok(Envelope.documentWithId("same").equals(Envelope.documentWithId("same")));
});
