/**
 * Service status / level enums and report shape. A leaf module so
 * {@link Envelope} can depend on `ServiceLevel` without pulling in the full
 * {@link Service} framework (which depends on `Envelope`).
 *
 * Ports `ra.common.service.{ServiceStatus, ServiceLevel, ServiceReport,
 * ServiceMessage, ServiceStatusObserver}`.
 */
import { compact } from "./identity.js";

export enum ServiceLevel {
  AtMostOnce = "AtMostOnce",
  AtLeastOnce = "AtLeastOnce",
  ExactlyOnce = "ExactlyOnce",
}

export enum ServiceStatus {
  NotInitialized = "NotInitialized",
  Initializing = "Initializing",
  Waiting = "Waiting",
  Starting = "Starting",
  Running = "Running",
  Verified = "Verified",
  PartiallyRunning = "PartiallyRunning",
  DegradedRunning = "DegradedRunning",
  Unstable = "Unstable",
  Pausing = "Pausing",
  Paused = "Paused",
  Unpausing = "Unpausing",
  ShuttingDown = "ShuttingDown",
  GracefullyShuttingDown = "GracefullyShuttingDown",
  Shutdown = "Shutdown",
  GracefullyShutdown = "GracefullyShutdown",
  Restarting = "Restarting",
  Unavailable = "Unavailable",
  Error = "Error",
}

const RUNNING_STATES = new Set<ServiceStatus>([
  ServiceStatus.Running,
  ServiceStatus.Verified,
  ServiceStatus.PartiallyRunning,
  ServiceStatus.DegradedRunning,
]);

export function serviceStatusIsRunning(status: ServiceStatus): boolean {
  return RUNNING_STATES.has(status);
}

export const NO_ERROR = -1;
export const REQUEST_REQUIRED = 0;

export interface ServiceMessage {
  statusCode: number;
  errorMessage?: string;
  exception?: string;
  type?: string;
}

export interface ServiceReport {
  serviceClassName: string;
  serviceStatus: ServiceStatus;
  registered: boolean;
  running: boolean;
  version?: string;
  servicesDependentUpon: string[];
}

export function serviceReportToJSON(r: ServiceReport): Record<string, unknown> {
  return {
    service_class_name: r.serviceClassName,
    service_status: r.serviceStatus,
    registered: r.registered,
    running: r.running,
    ...compact({ version: r.version }),
    ...(r.servicesDependentUpon.length > 0
      ? { services_dependent_upon: [...r.servicesDependentUpon] }
      : {}),
  };
}

export interface ServiceStatusObserver {
  serviceStatusChanged(serviceFullName: string, status: ServiceStatus): void;
}
