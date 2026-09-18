import { Parser, ParseResult, ParsedCommand, ParsedOption, ParsedOptionValue } from './types';

const COMMAND_HEADERS = ['commands', 'command', 'available commands', 'subcommands'];
const OPTION_HEADERS = ['options', 'flags', 'global options'];

function normalizeHeader(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z \-]*):?$/);
  if (!match) return null;
  return match[1].trim().toLowerCase();
}

function isSectionHeader(line: string, headers: string[]): boolean {
  const normalized = normalizeHeader(line);
  if (!normalized) return false;
  return headers.includes(normalized);
}

function looksLikeUnrelatedHeader(line: string): boolean {
  if (/^\s/.test(line)) return false; // headers are unindented
  const trimmed = line.trim();
  return /^[A-Za-z][A-Za-z \-]*:$/.test(trimmed);
}

function indentWidth(line: string): number {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function parseCommandLine(line: string): ParsedCommand | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('-')) return null;

  const parts = trimmed.split(/\s{2,}/);
  const namePart = parts[0];
  const description = parts.slice(1).join(' ').trim() || undefined;
  const name = namePart.split(/[\s,[]+/)[0];

  if (!/^[A-Za-z][\w-]*$/.test(name)) return null;
  return { name, description };
}

function parseValueSpec(raw: string): ParsedOptionValue {
  const trimmed = raw.trim();
  if (/^<.*>$/.test(trimmed)) {
    return { required: true, name: trimmed.slice(1, -1) };
  }
  if (/^\[.*]$/.test(trimmed)) {
    return { required: false, name: trimmed.slice(1, -1) };
  }
  return { required: true, name: trimmed };
}

function parseOptionLine(line: string): ParsedOption | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('-')) return null;

  // Description is conventionally separated from the flag list by 2+ spaces.
  const splitMatch = trimmed.match(/^(.*?)(?:\s{2,}(.*))?$/s);
  const flagPart = splitMatch ? splitMatch[1] : trimmed;
  const description = splitMatch && splitMatch[2] ? splitMatch[2].trim() : undefined;

  const tokens = flagPart
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  let short: string | undefined;
  let long: string | undefined;
  let value: ParsedOptionValue | undefined;

  for (const token of tokens) {
    const m = token.match(/^(--?[A-Za-z][\w-]*)(?:[=\s]+(.+))?$/);
    if (!m) continue;
    const flag = m[1];
    const valueSpec = m[2];

    if (flag.startsWith('--')) {
      long = flag;
    } else {
      short = flag;
    }
    if (valueSpec) {
      value = parseValueSpec(valueSpec);
    }
  }

  if (!short && !long) return null;
  return { short, long, description, value };
}

function dedupeCommands(commands: ParsedCommand[]): ParsedCommand[] {
  const map = new Map<string, ParsedCommand>();
  for (const c of commands) {
    if (!map.has(c.name)) map.set(c.name, c);
  }
  return Array.from(map.values());
}

function dedupeOptions(options: ParsedOption[]): ParsedOption[] {
  const map = new Map<string, ParsedOption>();
  for (const o of options) {
    const key = `${o.long || ''}|${o.short || ''}`;
    if (!map.has(key)) map.set(key, o);
  }
  return Array.from(map.values());
}

type Mode = 'none' | 'commands' | 'options';

export const genericParser: Parser = {
  name: 'generic',

  canParse(): boolean {
    // Always applicable — this is the catch-all fallback parser.
    return true;
  },

  parse(text: string): ParseResult {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, '    '));
    const commands: ParsedCommand[] = [];
    const options: ParsedOption[] = [];
    let mode: Mode = 'none';
    // Entries in a section start at a consistent indent; help formatters
    // (commander, argparse, click, ...) indent *wrapped description text*
    // deeper than that, aligned under the description column. Tracking the
    // first entry's indent per section lets us tell "new entry" from
    // "continuation of the previous line's description" apart.
    let baseIndent: number | null = null;

    for (const line of lines) {
      if (line.trim() === '') continue;

      if (isSectionHeader(line, COMMAND_HEADERS)) {
        mode = 'commands';
        baseIndent = null;
        continue;
      }
      if (isSectionHeader(line, OPTION_HEADERS)) {
        mode = 'options';
        baseIndent = null;
        continue;
      }
      if (looksLikeUnrelatedHeader(line)) {
        mode = 'none';
        baseIndent = null;
        continue;
      }

      const isIndented = /^\s/.test(line);
      if (!isIndented) continue;
      if (mode === 'none') continue;

      const indent = indentWidth(line);
      if (baseIndent === null) baseIndent = indent;
      if (indent > baseIndent) continue; // wrapped continuation of the previous entry's description

      if (mode === 'commands') {
        const parsed = parseCommandLine(line);
        if (parsed) commands.push(parsed);
      } else if (mode === 'options') {
        const parsed = parseOptionLine(line);
        if (parsed) options.push(parsed);
      }
    }

    return { commands: dedupeCommands(commands), options: dedupeOptions(options) };
  },
};
