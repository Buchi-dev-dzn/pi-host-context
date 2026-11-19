# Changelog

## 0.1.0

- Detect the host application that launched Pi from environment variables: Orca, Rex, WezTerm, VS Code, tmux, or the `TERM_PROGRAM` value. `PI_HOST` overrides detection.
- Load `hosts/<host>.md` instructions after the global `AGENTS.md`, from `~/.pi/agent/hosts/` (or `PI_HOST_CONTEXT_DIR`) with built-in defaults for Rex and Orca. `{{VAR}}` placeholders expand from the environment; an empty user file disables a default.
- Append the host to the first footer line (`~/project (main) · Rex`); disable with `PI_HOST_CONTEXT_FOOTER=off`.
- Add the `/host` command to show the detected host and the instructions file in use.
