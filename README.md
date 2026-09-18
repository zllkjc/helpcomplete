# helpcomplete

Generic Bash/Zsh completion fallback: for CLIs that have no native shell completion, `helpcomplete` reads their `--help` / `-h` output and turns it into Tab completion — subcommands, flags, and simple file/directory/boolean value hints.

```bash
some-cli d<Tab>      # → deploy
some-cli deploy --<Tab>   # → --config  --prod
```

Native completion always wins. `helpcomplete` only steps in for commands that have no completion spec of their own (`git`, `kubectl`, etc. are untouched).

## Install

```bash
npm install -g helpcomplete
```

## Setup

Add **one** of these to your shell rc file, depending on your shell (`echo $SHELL` to check).

### Bash (needs bash >= 4.2)

```bash
# ~/.bashrc
eval "$(helpcomplete init bash)"
```

macOS ships bash 3.2 as `/bin/bash` (licensing, not Apple being lazy) and 3.2 can't do this. Either install a newer bash:

```bash
brew install bash
echo /opt/homebrew/bin/bash | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/bash
```

...or register specific commands instead of the automatic fallback (works on any bash version):

```bash
eval "$(helpcomplete init bash --commands mycli1,mycli2)"
```

Also note: on macOS, Terminal.app (and most terminal emulators) start bash as a **login shell**, which reads `~/.bash_profile`, not `~/.bashrc`. If your `.bash_profile` doesn't already source `.bashrc`, add:

```bash
# ~/.bash_profile
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
```

### Zsh

```bash
# ~/.zshrc
eval "$(helpcomplete init zsh)"
```

Works on any zsh version. If you want to scope it to specific commands instead of the automatic `-default-` fallback:

```bash
eval "$(helpcomplete init zsh --commands mycli1,mycli2)"
```

Then open a **new** terminal window (rc files are only read at shell startup).

## Commands

```bash
helpcomplete init bash [--commands <cmd1>,<cmd2>,...]
helpcomplete init zsh  [--commands <cmd1>,<cmd2>,...]
helpcomplete inspect <command>          # show what helpcomplete parses from --help
helpcomplete debug <command> [args...]  # show which help command ran + parse counts
helpcomplete cache clear [command]      # clear the local cache (all, or one CLI)
```

## Configuration

Environment variables, all optional:

| Variable                     | Default                  | Meaning                                   |
| ----------------------------- | ------------------------- | ------------------------------------------ |
| `HELPCOMPLETE_ENABLED`        | `1`                        | Set to `0` to disable completion entirely |
| `HELPCOMPLETE_CACHE_TTL`      | `86400` (24h)              | Cache lifetime in seconds                 |
| `HELPCOMPLETE_TIMEOUT_MS`     | `1000`                     | Timeout for each `--help`/`-h` probe      |
| `HELPCOMPLETE_CACHE_DIR`      | `~/.cache/helpcomplete`    | Where parsed results are cached           |
| `HELPCOMPLETE_DEBUG`          | unset                      | Set to `1` for stderr diagnostics         |
| `HELPCOMPLETE_DENYLIST`       | unset                      | Extra comma-separated commands to never probe (in addition to the built-in `rm,sudo,ssh,...` list) |

## How it works

1. On Tab, the shell calls `helpcomplete complete` with the current command line, bypassing native completion only if none is registered for that command.
2. `helpcomplete` walks the typed subcommand path and runs `<command path> --help` (falling back to `-h`), with a timeout, `stdin=/dev/null`, and a denylist for commands it should never auto-probe (`rm`, `sudo`, `ssh`, ...).
3. The help text is parsed for `Commands:`/`Options:`-style sections into subcommands and flags.
4. Results are cached under `~/.cache/helpcomplete/`, keyed by the executable's path + mtime, so repeat Tab presses don't re-spawn the target CLI.
5. Flag values hint at `<file>`/`<path>` → filename completion, `<dir>`/`<directory>` → directory completion, `<boolean>` → `true`/`false`. Anything else is left uncompleted rather than guessed.

Actually executing a command (`some-cli deploy`) never goes through `helpcomplete` — only Tab-triggered completion does.

## Scope

First release targets Bash and Zsh, and a generic `--help` text parser (no framework-specific parsers for commander/yargs/oclif yet, no AI-based fallback, no shell-history ranking). See `helpcomplete-requirements.md` in this repo for the full spec this was built against.

## License

MIT
