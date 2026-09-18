import * as path from 'path';
import { Config } from './config';
import { resolveExecutable, fetchHelp } from './helpFetcher';
import { selectParser } from './parsers';
import { ParseResult, ParsedOption } from './parsers/types';
import { inferValueType } from './valueType';
import { readCache, writeCache } from './cache';
import { detectNpmMeta } from './npmMeta';

export interface CompletionContext {
  words: string[]; // COMP_WORDS
  cword: number; // COMP_CWORD
}

export interface CompletionOutcome {
  candidates: string[];
  // When set, the bash side should run `compgen -f`/`compgen -d` itself
  // instead of using `candidates` (see src/templates/init.bash.tpl).
  directive?: 'file' | 'directory';
  execPath?: string;
  subcommandPath?: string[];
  cacheHit?: boolean;
  helpCommand?: string;
  parsed?: ParseResult;
  reason?: string;
}

function deriveSubcommandPath(words: string[], cword: number): string[] {
  const result: string[] = [];
  for (let i = 1; i < cword; i++) {
    const w = words[i];
    if (w === undefined || w.startsWith('-')) break;
    result.push(w);
  }
  return result;
}

function findValueOwner(options: ParsedOption[], token: string): ParsedOption | undefined {
  return options.find((o) => o.long === token || o.short === token);
}

export function computeCompletion(config: Config, ctx: CompletionContext): CompletionOutcome {
  const { words, cword } = ctx;
  if (words.length === 0 || cword < 0) return { candidates: [] };

  const commandName = words[0];
  const execPath = resolveExecutable(commandName);
  if (!execPath) return { candidates: [], reason: 'executable-not-found' };

  const execBasename = path.basename(execPath);
  const subcommandPath = deriveSubcommandPath(words, cword);
  const currentToken = words[cword] ?? '';
  const previousToken = cword > 0 ? words[cword - 1] : undefined;

  const npmMeta = detectNpmMeta(execPath);

  let parsed = readCache(config, execPath, execBasename, subcommandPath, npmMeta.version);
  const cacheHit = !!parsed;
  let helpCommand: string | undefined;

  if (!parsed) {
    const helpResult = fetchHelp(execPath, subcommandPath, config.timeoutMs);
    if (!helpResult.ok || !helpResult.text) {
      return { candidates: [], execPath, subcommandPath, cacheHit: false, reason: helpResult.reason };
    }
    helpCommand = helpResult.triedCommand;
    parsed = selectParser(helpResult.text).parse(helpResult.text);
    writeCache(config, execPath, execBasename, subcommandPath, parsed, npmMeta.version);
  }

  // foo deploy --v<Tab>  →  completing a flag name. Checked before the
  // "completing a previous flag's value" case below: if the token being
  // completed already looks like a flag, the user is typing a new flag,
  // not a value for whatever came before it (e.g. an optional-value flag
  // like `--resume [id]` immediately followed by `--danger-xxx`).
  if (currentToken.startsWith('-')) {
    const flagStrings: string[] = [];
    for (const o of parsed.options) {
      if (o.long) flagStrings.push(o.long);
      if (o.short) flagStrings.push(o.short);
    }
    const candidates = Array.from(new Set(flagStrings)).filter((f) => f.startsWith(currentToken));
    return { candidates, execPath, subcommandPath, cacheHit, helpCommand, parsed };
  }

  // foo --config <Tab>  →  previous token is a flag that takes a value.
  if (previousToken && previousToken.startsWith('-')) {
    const owner = findValueOwner(parsed.options, previousToken);
    if (owner && owner.value) {
      const type = inferValueType(owner.value.name);
      if (type === 'file') {
        return { candidates: [], directive: 'file', execPath, subcommandPath, cacheHit, helpCommand, parsed };
      }
      if (type === 'directory') {
        return { candidates: [], directive: 'directory', execPath, subcommandPath, cacheHit, helpCommand, parsed };
      }
      if (type === 'boolean') {
        return {
          candidates: ['true', 'false'].filter((v) => v.startsWith(currentToken)),
          execPath,
          subcommandPath,
          cacheHit,
          helpCommand,
          parsed,
        };
      }
      // Unknown enum-like value (e.g. <mode>) — deliberately offer nothing.
      return { candidates: [], execPath, subcommandPath, cacheHit, helpCommand, parsed, reason: 'unknown-value-type' };
    }
  }

  // foo dep<Tab>  →  completing a subcommand name.
  const candidates = parsed.commands.map((c) => c.name).filter((n) => n.startsWith(currentToken));
  return { candidates, execPath, subcommandPath, cacheHit, helpCommand, parsed };
}
