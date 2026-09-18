import * as fs from 'fs';
import * as path from 'path';
import { ParseResult } from './parsers/types';
import { Config } from './config';

interface CacheEntry {
  execPath: string;
  mtimeMs: number;
  version?: string;
  cachedAt: number;
  ttlSeconds: number;
  parsed: ParseResult;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_') || '_';
}

function cliDir(cacheDir: string, execBasename: string): string {
  return path.join(cacheDir, sanitize(execBasename));
}

function entryPath(cacheDir: string, execBasename: string, subcommandPath: string[]): string {
  const dir = cliDir(cacheDir, execBasename);
  const fileBase = subcommandPath.length === 0 ? 'root' : subcommandPath.map(sanitize).join('__');
  return path.join(dir, `${fileBase}.json`);
}

export function readCache(
  config: Config,
  execPath: string,
  execBasename: string,
  subcommandPath: string[],
  version?: string
): ParseResult | null {
  const file = entryPath(config.cacheDir, execBasename, subcommandPath);
  try {
    const entry: CacheEntry = JSON.parse(fs.readFileSync(file, 'utf8'));

    const mtimeMs = fs.statSync(execPath).mtimeMs;
    if (entry.execPath !== execPath) return null;
    if (entry.mtimeMs !== mtimeMs) return null;
    if (version && entry.version && entry.version !== version) return null;

    const ageSeconds = (Date.now() - entry.cachedAt) / 1000;
    if (ageSeconds > entry.ttlSeconds) return null;

    return entry.parsed;
  } catch {
    // Missing file, corrupt JSON, stale mtime, expired TTL — all treated as
    // a plain cache miss (spec 20: cache corruption must never break bash).
    return null;
  }
}

export function writeCache(
  config: Config,
  execPath: string,
  execBasename: string,
  subcommandPath: string[],
  parsed: ParseResult,
  version?: string
): void {
  try {
    const dir = cliDir(config.cacheDir, execBasename);
    fs.mkdirSync(dir, { recursive: true });

    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(execPath).mtimeMs;
    } catch {
      // leave at 0 — worst case this entry never hits on read
    }

    const entry: CacheEntry = {
      execPath,
      mtimeMs,
      version,
      cachedAt: Date.now(),
      ttlSeconds: config.cacheTtlSeconds,
      parsed,
    };
    fs.writeFileSync(entryPath(config.cacheDir, execBasename, subcommandPath), JSON.stringify(entry), 'utf8');
  } catch {
    // Silent fail — a completion must never error out because the cache
    // directory is read-only or full.
  }
}

export function clearCache(config: Config, cliName?: string): void {
  try {
    if (!cliName) {
      fs.rmSync(config.cacheDir, { recursive: true, force: true });
      return;
    }
    fs.rmSync(cliDir(config.cacheDir, cliName), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
