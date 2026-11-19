# Host: Orca

Pi was launched from an Orca terminal. These instructions are loaded only for Orca sessions by the `pi-host-context` extension.

## Your location

- Orca worktree: `{{ORCA_WORKTREE_ID}}`
- Orca tab: `{{ORCA_TAB_ID}}`
- Orca pane: `{{ORCA_PANE_KEY}}`

## Tools

- For Orca operations (worktrees, terminals, browser, task graph), load and follow the `orca-cli` skill if it is available. For supervised multi-agent work, load the `orchestration` skill if it is available.
- Never guess Orca subcommands or flags; follow the installed CLI's own guide and prefer `--json` output.
- Rex is not the host: do not use the `rex` CLI or skill to manage panes here.
