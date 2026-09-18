import * as fs from 'fs';
import * as path from 'path';

export interface ZshInitOptions {
  binPath: string;
  // When set, register per-command with `compdef` instead of the `-default-`
  // fallback target. Useful if you only want specific commands covered.
  commands?: string[];
}

function buildDefaultRegisterBlock(): string {
  return [
    '# `-default-` is zsh\'s fallback target: it only fires for commands with',
    '# no completer of their own, so native `compdef`-registered completions',
    '# (git, kubectl, etc. via their own _git/_kubectl functions) keep priority.',
    'compdef _helpcomplete_complete -default-',
  ].join('\n');
}

function buildPerCommandRegisterBlock(commands: string[]): string {
  const cmdList = commands.map((c) => c.replace(/\s+/g, '')).filter(Boolean).join(' ');
  return [
    '# Per-command mode: only completes the commands listed here, and it',
    '# overwrites any native completion already registered for them when this',
    '# line runs. Only list commands you know have no native completion.',
    `compdef _helpcomplete_complete ${cmdList}`,
  ].join('\n');
}

export function generateZshInit(opts: ZshInitOptions): string {
  const templatePath = path.join(__dirname, 'templates', 'init.zsh.tpl');
  const template = fs.readFileSync(templatePath, 'utf8');
  const escapedBin = opts.binPath.replace(/"/g, '\\"');

  const registerBlock =
    opts.commands && opts.commands.length > 0
      ? buildPerCommandRegisterBlock(opts.commands)
      : buildDefaultRegisterBlock();

  return template.replace('__HELPCOMPLETE_BIN__', escapedBin).replace('__HELPCOMPLETE_REGISTER__', registerBlock);
}
