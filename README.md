# pi-host-context

A [Pi](https://pi.dev) extension that knows which app launched Pi — Rex, Orca, WezTerm, VS Code, tmux, or a plain terminal — and adapts to it:

1. **Host-specific instructions.** `hosts/<host>.md` is added to the system prompt right after your global `AGENTS.md`. Keep your normal rules in `AGENTS.md`, and put "in this app, use this skill/CLI" rules in a per-host file. The choice is static: the extension decides from the environment, not the model.
2. **Footer label.** The host is appended to the first footer line:

   ```
   ~/project (main) · Rex
   ```

3. **`/host` command.** Shows the detected host, how it was detected, and which instructions file is in use.

## Install

```sh
pi install npm:pi-host-context
```

Restart Pi or run `/reload`.

## Host instructions

For the detected host `<id>`, the first existing file wins:

1. `~/.pi/agent/hosts/<id>.md` — your own file (directory overridable with `PI_HOST_CONTEXT_DIR`)
2. `<package>/hosts/<id>.md` — built-in default

Built-in defaults ship for:

| Host | Default instructions |
| --- | --- |
| `rex` | Your Rex session and pane IDs; use the `rex` skill and CLI for panes, splits, and terminal output; don't use Orca tooling |
| `orca` | Your Orca worktree, tab, and pane IDs; use the `orca-cli` and `orchestration` skills; don't use Rex tooling |

To customize a host, create your own file; it replaces the default entirely. To turn a default off, create an empty file with that name. To cover another host, add a file named after its id: `wezterm.md`, `vscode.md`, `tmux.md`, or `terminal.md`.

Files may use `{{VAR}}` placeholders (uppercase environment variable names). They are expanded at session start; unset variables become `(unset)`:

```markdown
# Host: Rex

- Rex session: `{{REX_SESSION}}`
- Rex block (this terminal pane): `{{REX_BLOCK}}`

- Run long-lived dev servers in a split pane next to `{{REX_BLOCK}}`, not in your own shell.
```

Instructions are read at session start and on `/reload`. Edit a file, then `/reload` to apply it.

The Rex default refers to Rex's own agent skill. Install it once per machine with:

```sh
rex skill setup --agent pi
```

## Detection

Detection reads only environment variables. The first match wins:

| Host id | Signal |
| --- | --- |
| *(override)* | `PI_HOST=<id>`, e.g. `PI_HOST=orca` |
| `orca` | `ORCA_PANE_KEY`, `ORCA_TAB_ID`, `ORCA_WORKTREE_ID`, or `ORCA_AGENT_HOOK_PORT` |
| `rex` | `REX_SESSION`, `REX_BLOCK`, or `TERM_PROGRAM=rex` |
| `wezterm` | `TERM_PROGRAM=WezTerm` |
| `vscode` | `TERM_PROGRAM=vscode` |
| `tmux` | `TMUX` |
| `terminal` | anything else (the label shows `TERM_PROGRAM` when set) |

### SSH and WSL

Host variables do not cross SSH or `wsl.exe` boundaries by default, so Pi started on a remote machine or inside WSL from an Orca terminal shows `terminal`. Either:

- start Pi with an explicit host: `PI_HOST=orca pi`;
- forward the variables over `wsl.exe` with `WSLENV`, e.g. `WSLENV=ORCA_PANE_KEY:ORCA_TAB_ID:ORCA_WORKTREE_ID:TERM_PROGRAM`; or
- forward them over SSH with `SendEnv` on the client and `AcceptEnv` on the server.

## Configuration

| Variable | Effect |
| --- | --- |
| `PI_HOST` | Force the host id (`orca`, `rex`, `wezterm`, `vscode`, `tmux`, or any custom id) |
| `PI_HOST_CONTEXT_DIR` | Directory for your host files (default `~/.pi/agent/hosts`) |
| `PI_HOST_CONTEXT_FOOTER` | Set to `off`, `0`, or `false` to leave the footer untouched |

## Use from other extensions

The detector is a dependency-free module:

```ts
import { detectHost } from "pi-host-context/detect.ts";

const host = detectHost(); // { id: "rex", label: "Rex", evidence: "REX_SESSION" }
```

## How it works

- **Instructions** are inserted in `before_agent_start` into `event.systemPromptOptions.contextFiles`, so they render as a regular `<project_instructions>` entry right after the agent-directory `AGENTS.md` and before project `AGENTS.md` files. The content is identical on every run, so Pi patches the prompt once and keeps its cache afterwards. Non-interactive runs (`pi -p`, subagents) get the instructions too.
- **Footer.** Pi has no hook for extending the built-in footer's first line, and `ctx.ui.setFooter()` replaces the whole footer. The extension therefore wraps `FooterComponent.prototype.render` (a public export of `@earendil-works/pi-coding-agent`) and rewrites only that line, truncating the path rather than the label when space runs out. The wrapper is installed once per process, survives `/reload`, is removed on session shutdown, never throws into rendering, and falls back to a normal footer status entry if the component cannot be patched. If a future Pi release changes the footer internals, disable it with `PI_HOST_CONTEXT_FOOTER=off`.

## Development

```sh
npm test
```

Tests load the extension with the globally installed Pi's own TypeScript loader. If Pi is installed elsewhere, set `PI_PACKAGE_ROOT` to the `@earendil-works/pi-coding-agent` package directory.

## License

MIT
