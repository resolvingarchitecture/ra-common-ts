/**
 * The service framework: the `Service` contract and `ServiceCore` shared state.
 *
 * Ports `ra.common.service.{Service, BaseService}` (except `ServiceDaemon`,
 * deferred). Status enums / report shape live in {@link ./serviceStatus.js}.
 */
import { Envelope } from "./envelope.js";
import type { LifeCycle } from "./lifecycle.js";
import {
  Command,
  CommandMessage,
  DocumentMessage,
  EventMessage,
  EventType,
  type MessageProducer,
} from "./messaging.js";
import {
  serviceReportToJSON,
  ServiceStatus,
  type ServiceReport,
  type ServiceStatusObserver,
} from "./serviceStatus.js";

export {
  NO_ERROR,
  REQUEST_REQUIRED,
  ServiceLevel,
  ServiceStatus,
  serviceReportToJSON,
  serviceStatusIsRunning,
  type ServiceMessage,
  type ServiceReport,
  type ServiceStatusObserver,
} from "./serviceStatus.js";

export const RA_SERVICE_IMPL = "ra.service.impl";

/** State shared by every service (ports the `BaseService` fields). */
export class ServiceCore {
  status: ServiceStatus = ServiceStatus.NotInitialized;
  registered = false;
  version?: string;
  servicesDependentUpon: string[] = [];
  config: Record<string, string> = {};
  producer?: MessageProducer;
  observer?: ServiceStatusObserver;

  constructor(readonly serviceClassName: string) {}

  addDependentService(name: string): void {
    this.servicesDependentUpon.push(name);
  }

  send(envelope: Envelope): boolean {
    return this.producer?.send(envelope) ?? false;
  }

  report(): ServiceReport {
    return {
      serviceClassName: this.serviceClassName,
      serviceStatus: this.status,
      registered: this.registered,
      running: this.status === ServiceStatus.Running,
      version: this.version,
      servicesDependentUpon: [...this.servicesDependentUpon],
    };
  }

  updateStatus(status: ServiceStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.observer?.serviceStatusChanged(this.serviceClassName, status);
    if (this.producer !== undefined) {
      const ev = EventMessage.of(EventType.ServiceStatus);
      ev.message = serviceReportToJSON(this.report());
      const e = Envelope.event(EventType.ServiceStatus);
      e.message = ev;
      e.addRoute("ra.notification.NotificationService", "PUBLISH");
      e.ratchet();
      this.send(e);
    }
  }
}

/**
 * A message-driven service. Ports `ra.common.service.Service` + the reusable
 * parts of `BaseService`. Concrete services hold a {@link ServiceCore}.
 */
export abstract class Service implements LifeCycle {
  abstract core: ServiceCore;

  abstract start(properties: Record<string, string>): boolean;
  abstract shutdown(): boolean;
  pause(): boolean {
    return false;
  }
  unpause(): boolean {
    return false;
  }
  restart(): boolean {
    return false;
  }
  gracefulShutdown(): boolean {
    return this.shutdown();
  }

  handleDocument(_envelope: Envelope): void {}
  handleEvent(_envelope: Envelope): void {}
  handleCommand(envelope: Envelope): void {
    const command = envelope.message?.asCommand()?.command;
    if (command === undefined) return;
    const config = { ...this.core.config };
    switch (command) {
      case Command.Start:
        this.start(config);
        break;
      case Command.Pause:
        this.pause();
        break;
      case Command.Unpause:
        this.unpause();
        break;
      case Command.Restart:
        this.restart();
        break;
      case Command.Shutdown:
        this.shutdown();
        break;
      case Command.GracefullyShutdown:
        this.gracefulShutdown();
        break;
      case Command.Report:
        envelope.setHeader("result", serviceReportToJSON(this.report()));
        break;
      default:
        break;
    }
  }
  handleHeaders(_envelope: Envelope): void {}

  serviceStatus(): ServiceStatus {
    return this.core.status;
  }

  report(): ServiceReport {
    return this.core.report();
  }

  handle(envelope: Envelope): Envelope {
    const msg = envelope.message;
    if (msg instanceof DocumentMessage) this.handleDocument(envelope);
    else if (msg instanceof EventMessage) this.handleEvent(envelope);
    else if (msg instanceof CommandMessage) this.handleCommand(envelope);
    else this.handleHeaders(envelope);
    return envelope;
  }
}
