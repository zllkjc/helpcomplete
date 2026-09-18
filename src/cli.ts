#!/usr/bin/env node
import * as fs from 'fs';
import { loadConfig } from './config';
import { generateBashInit } from './bashInit';
import { generateZshInit } from './zshInit';
import { computeCompletion } from './completion';
import { resolveExecutable, fetchHelp } from './helpFetcher';
import { selectParser } from './parsers';
import { clearCache } from './cache';

const DIRECTIVE_PREFIX = '\x01HELPCOMPLETE_DIRECTIVE\x01';

function printUsage(): void {
  process.stderr.write(`helpcomplete - generic bash --help completion fallback

Usage:
  helpcomplete init bash [--commands <cmd1>,<cmd2>,...]
  helpcomplete init zsh [--commands <cmd1>,<cmd2>,...]
  helpcomplete complete <cword> -- <word0> [word1 ...]
  helpcomplete inspect <command>
  helpcomplete debug <command> [args...]
  helpcomplete cache clear [command]

  --commands  Register per-command instead of the default fallback handler
              (bash: \`complete -F\`; zsh: \`compdef\`). Use this on bash < 4.2
              (e.g. macOS's stock /bin/bash), which has no \`complete -D\`.
`);
}

function resolveBinPath(): string {
  let binPath = process.argv[1];
  try {
    binPath = fs.realpathSync(binPath);
  } catch {
    // keep the raw argv[1] if it can't be resolved
  }
  return binPath;
}

function parseCommandsFlag(rest: string[]): string[] | undefined {
  const flagIndex = rest.indexOf('--commands');
  if (flagIndex === -1 || !rest[flagIndex + 1]) return undefined;
  return rest[flagIndex + 1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function cmdInitBash(rest: string[]): void {
  const binPath = resolveBinPath();
  const commands = parseCommandsFlag(rest);
  process.stdout.write(generateBashInit({ binPath, commands }));
}

function cmdInitZsh(rest: string[]): void {
  const binPath = resolveBinPath();
  const commands = parseCommandsFlag(rest);
  process.stdout.write(generateZshInit({ binPath, commands }));
}

function cmdComplete(args: string[]): void {
  try {
    const config = loadConfig();
    if (!config.enabled) return;

    const cwordStr = args[0];
    const sepIndex = args.indexOf('--');
    if (cwordStr === undefined || sepIndex === -1) return;

    const cword = parseInt(cwordStr, 10);
    const words = args.slice(sepIndex + 1);
    if (!Number.isFinite(cword) || words.length === 0) return;

    const outcome = computeCompletion(config, { words, cword });

    if (config.debug) {
      process.stderr.write(
        `[helpcomplete] exec=${outcome.execPath ?? ''} sub=${(outcome.subcommandPath || []).join(' ')} ` +
          `cacheHit=${!!outcome.cacheHit} reason=${outcome.reason ?? ''}\n`
      );
    }

    if (outcome.directive) {
      process.stdout.write(`${DIRECTIVE_PREFIX}${outcome.directive}\n`);
      return;
    }

    for (const candidate of outcome.candidates) {
      process.stdout.write(`${candidate}\n`);
    }
  } catch (err) {
    // Never let an unexpected exception surface to bash (spec 20).
    if (process.env.HELPCOMPLETE_DEBUG === '1') {
      process.stderr.write(`[helpcomplete] error: ${(err as Error).message}\n`);
    }
  }
}

function cmdInspect(commandName: string): void {
  const config = loadConfig();
  const execPath = resolveExecutable(commandName);
  if (!execPath) {
    console.log('Executable: not found');
    return;
  }
  console.log(`Executable: ${execPath}`);

  const helpResult = fetchHelp(execPath, [], config.timeoutMs);
  if (!helpResult.ok || !helpResult.text) {
    console.log(`Cache: n/a (help fetch failed: ${helpResult.reason ?? 'unknown'})`);
    return;
  }

  const parsed = selectParser(helpResult.text).parse(helpResult.text);

  console.log('Cache: n/a (inspect always re-fetches)');
  console.log('Detected commands:');
  for (const c of parsed.commands) {
    console.log(`  ${c.name}${c.description ? '  ' + c.description : ''}`);
  }
  console.log('Detected flags:');
  for (const o of parsed.options) {
    const flags = [o.short, o.long].filter(Boolean).join(', ');
    console.log(`  ${flags}${o.description ? '  ' + o.description : ''}`);
  }
}

function cmdDebug(commandName: string, subArgs: string[]): void {
  const config = loadConfig();
  const execPath = resolveExecutable(commandName);
  if (!execPath) {
    console.log(`Executable not found: ${commandName}`);
    return;
  }

  const helpResult = fetchHelp(execPath, subArgs, config.timeoutMs);
  console.log('Help command:');
  console.log(`  ${helpResult.triedCommand || '(none succeeded)'}`);

  if (!helpResult.ok || !helpResult.text) {
    console.log(`Result: failed (${helpResult.reason ?? 'unknown'})`);
    return;
  }

  const parser = selectParser(helpResult.text);
  const parsed = parser.parse(helpResult.text);

  console.log('');
  console.log('Parser:');
  console.log(`  ${parser.name}`);
  console.log('');
  console.log('Parsed:');
  console.log(`  commands: ${parsed.commands.length}`);
  console.log(`  flags: ${parsed.options.length}`);
}

function cmdCacheClear(name?: string): void {
  const config = loadConfig();
  clearCache(config, name);
  console.log(name ? `Cache cleared for: ${name}` : 'Cache cleared.');
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'init':
      if (rest[0] === 'bash') {
        cmdInitBash(rest.slice(1));
        return;
      }
      if (rest[0] === 'zsh') {
        cmdInitZsh(rest.slice(1));
        return;
      }
      printUsage();
      process.exitCode = 1;
      return;

    case 'complete':
      cmdComplete(rest);
      return;

    case 'inspect':
      if (!rest[0]) {
        printUsage();
        process.exitCode = 1;
        return;
      }
      cmdInspect(rest[0]);
      return;

    case 'debug':
      if (!rest[0]) {
        printUsage();
        process.exitCode = 1;
        return;
      }
      cmdDebug(rest[0], rest.slice(1));
      return;

    case 'cache':
      if (rest[0] === 'clear') {
        cmdCacheClear(rest[1]);
        return;
      }
      printUsage();
      process.exitCode = 1;
      return;

    default:
      printUsage();
      process.exitCode = cmd ? 1 : 0;
  }
}

main();
