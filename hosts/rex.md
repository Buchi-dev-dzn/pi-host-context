# Host: Rex

Pi was launched from a Rex terminal. These instructions are loaded only for Rex sessions by the `pi-host-context` extension.

## Your location

- Rex session: `{{REX_SESSION}}`
- Rex block (this terminal pane): `{{REX_BLOCK}}`

These IDs were inherited at startup. If a target cannot be found, run `rex whoami --json`.

## Tools

- For any Rex operation (sessions, windows, panes/blocks, splits, running or watching commands in other panes, capturing terminal output, waiting for a block), load and follow the `rex` skill if it is available, and use the `rex` CLI. Do not script Rex's UI or talk to its socket directly.
- "Here" or "beside you" means the session and block above; otherwise follow the `rex` skill's rules for choosing a target.
- Do not terminate Rex processes or restart the Rex server unless the user asks.
- Orca is not the host: do not use Orca's CLI or orchestration features to manage this terminal.
