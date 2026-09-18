import * as os from 'os';
import * as path from 'path';

export interface Config {
  enabled: boolean;
  cacheTtlSeconds: number;
  timeoutMs: number;
  cacheDir: string;
  debug: boolean;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(): Config {
  return {
    enabled: process.env.HELPCOMPLETE_ENABLED !== '0',
    cacheTtlSeconds: envInt('HELPCOMPLETE_CACHE_TTL', 24 * 60 * 60),
    timeoutMs: envInt('HELPCOMPLETE_TIMEOUT_MS', 1000),
    cacheDir: process.env.HELPCOMPLETE_CACHE_DIR || path.join(os.homedir(), '.cache', 'helpcomplete'),
    debug: process.env.HELPCOMPLETE_DEBUG === '1',
  };
}
