import { Parser } from './types';
import { genericParser } from './generic';

// MVP only ships the generic parser. Framework-specific parsers
// (commander/yargs/oclif/...) can be added here later and tried in order,
// falling back to genericParser last.
const parsers: Parser[] = [genericParser];

export function selectParser(text: string): Parser {
  for (const p of parsers) {
    if (p.canParse(text)) return p;
  }
  return genericParser;
}

export { genericParser };
export * from './types';
