import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { isDenied } from './denylist';

export interface HelpFetchResult {
  ok: boolean;
  text?: string;
  triedCommand?: string;
  reason?: string;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function resolveExecutable(name: string): string | null {
  if (name.includes('/')) {
    const resolved = path.resolve(name);
    return isExecutable(resolved) ? resolved : null;
  }
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

// Only ever run recognized "safe" help flags (spec 7.1). Never guess at
// arbitrary business flags, never feed stdin (7.4), always bound by a
// timeout (7.3), and always ask for plain-text output (7.5).
export function fetchHelp(executablePath: string, subcommandArgs: string[], timeoutMs: number): HelpFetchResult {
  const basename = path.basename(executablePath);
  if (isDenied(basename)) {
    return { ok: false, reason: 'denylisted' };
  }

  const attempts: string[][] = [
    [...subcommandArgs, '--help'],
    [...subcommandArgs, '-h'],
  ];

  for (const args of attempts) {
    try {
      const result = spawnSync(executablePath, args, {
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '1',
          NO_COLOR: '1',
          TERM: 'dumb',
        },
      });

      if (result.error || result.signal) {
        // Execution failed or was killed (e.g. timeout) — try next variant.
        continue;
      }

      const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
      if (output.length > 0) {
        return { ok: true, text: output, triedCommand: `${basename} ${args.join(' ')}`.trim() };
      }
    } catch {
      continue;
    }
  }

  return { ok: false, reason: 'no-output' };
}
