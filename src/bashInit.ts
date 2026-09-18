import * as fs from 'fs';
import * as path from 'path';

export interface BashInitOptions {
  binPath: string;
  // When set, register per-command with `complete -F` instead of the
  // version-gated `complete -D` default handler. Works on any bash version
  // (including macOS's stock bash 3.2), at the cost of not being fully
  // automatic — each command must be listed explicitly.
  commands?: string[];
}

function buildDefaultRegisterBlock(): string {
  return [
    '# `complete -D` (default completion handler) needs bash >= 4.2. macOS',
    '# ships bash 3.2 as /bin/bash for licensing reasons, so this is a common miss.',
    'if (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 2) )); then',
    '  {',
    '    echo "helpcomplete: needs bash >= 4.2 for the automatic complete -D fallback"',
    '    echo "(found $BASH_VERSION)."',
    '    echo "Upgrade bash (macOS: brew install bash; add it to /etc/shells;"',
    '    echo "chsh -s /opt/homebrew/bin/bash), or re-run:"',
    '    echo "  helpcomplete init bash --commands <cmd1>,<cmd2>,..."',
    '    echo "to enable completion for specific commands on this bash version."',
    '  } >&2',
    'else',
    '  # `-D` only fires for commands with no completion spec of their own, so',
    '  # any native `complete -F ...` (git, kubectl, etc.) keeps priority.',
    '  # `-o bashdefault -o default` falls back to normal filename completion',
    '  # whenever we produce no candidates (errors, timeouts, unknown values).',
    '  complete -D -F _helpcomplete_complete -o bashdefault -o default',
    'fi',
  ].join('\n');
}

function buildPerCommandRegisterBlock(commands: string[]): string {
  const cmdList = commands.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(' ');
  return [
    '# Per-command mode: works on any bash version (no `complete -D` needed),',
    '# but only completes the commands listed here, and it overwrites any',
    '# native completion already registered for them when this line runs.',
    '# Only list commands you know have no native Bash completion of their own.',
    `complete -F _helpcomplete_complete ${cmdList}`,
  ].join('\n');
}

export function generateBashInit(opts: BashInitOptions): string {
  const templatePath = path.join(__dirname, 'templates', 'init.bash.tpl');
  const template = fs.readFileSync(templatePath, 'utf8');
  const escapedBin = opts.binPath.replace(/"/g, '\\"');

  const registerBlock =
    opts.commands && opts.commands.length > 0
      ? buildPerCommandRegisterBlock(opts.commands)
      : buildDefaultRegisterBlock();

  return template.replace('__HELPCOMPLETE_BIN__', escapedBin).replace('__HELPCOMPLETE_REGISTER__', registerBlock);
}
