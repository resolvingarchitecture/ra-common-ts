/**
 * Configuration loading and cross-platform directory resolution.
 *
 * Ports `ra.common.Config` and `ra.common.SystemSettings`. Environment variables
 * and a `.properties` / `.config` file are the sources.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { RaError } from "./errors.js";

export function loadFromArgs(args: string[], delimiter = "="): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of args) {
    const idx = arg.indexOf(delimiter);
    if (idx > 0) out[arg.slice(0, idx)] = arg.slice(idx + delimiter.length);
  }
  return out;
}

export function loadFromEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return out;
}

export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    for (const sep of ["=", ":"]) {
      const idx = line.indexOf(sep);
      if (idx >= 0) {
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        break;
      }
    }
  }
  return out;
}

export function loadFromFile(path: string): Record<string, string> {
  return parseProperties(readFileSync(path, "utf-8"));
}

export function loadAll(
  clientProps: Record<string, string>,
  configPath?: string,
): Record<string, string> {
  const config = loadFromEnv();
  if (configPath !== undefined) Object.assign(config, loadFromFile(configPath));
  Object.assign(config, clientProps);
  return config;
}

export const SystemSettings = {
  userHomeDir(): string | undefined {
    return process.env["HOME"] ?? process.env["USERPROFILE"] ?? (homedir() || undefined);
  },

  xdgDir(envKey: string, defaultSuffix: string): string | undefined {
    const value = process.env[envKey];
    if (value) return value;
    const home = this.userHomeDir();
    return home ? join(home, defaultSuffix) : undefined;
  },

  userDataDir(): string | undefined {
    return this.xdgDir("XDG_DATA_HOME", ".local/share");
  },
  userConfigDir(): string | undefined {
    return this.xdgDir("XDG_CONFIG_HOME", ".config");
  },
  userCacheDir(): string | undefined {
    return this.xdgDir("XDG_CACHE_HOME", ".cache");
  },

  appDir(base: string, group: string, app: string, create = false): string {
    const dir = join(base, group, app);
    if (create && !existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        throw new RaError("file-creation-failed", `${dir}: ${String(err)}`);
      }
    }
    return dir;
  },

  userAppDataDir(group: string, app: string, create = false): string {
    const base = this.userDataDir();
    if (base === undefined) throw new RaError("file-creation-failed", "no user data dir");
    return this.appDir(base, group, app, create);
  },
};
