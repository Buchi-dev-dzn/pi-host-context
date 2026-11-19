/**
 * Host-specific instructions: a static overlay on top of the global AGENTS.md.
 *
 * For host `<id>`, the first existing file wins:
 *   1. `<user-dir>/<id>.md`  (default `<agent-dir>/hosts`, or $PI_HOST_CONTEXT_DIR)
 *   2. `<package>/hosts/<id>.md`  (built-in defaults)
 *
 * An empty user file disables the built-in default for that host. The file is
 * added to Pi's context files right after the agent-directory AGENTS.md, so
 * the same host always yields the same instructions.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ContextFile {
  path: string;
  content: string;
}

type Env = Record<string, string | undefined>;

/** Environment variable that overrides the user instructions directory. */
export const HOSTS_DIR_ENV = "PI_HOST_CONTEXT_DIR";

const PLACEHOLDER = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

/** Replace `{{VAR}}` placeholders with environment values, or `(unset)`. */
export function expandPlaceholders(text: string, env: Env = process.env): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => env[name] || "(unset)");
}

/** Directory holding the user's host instruction files. */
export function userHostsDir(agentDir: string, env: Env = process.env): string {
  const override = env[HOSTS_DIR_ENV]?.trim();
  return override ? path.resolve(override) : path.join(agentDir, "hosts");
}

/** Candidate files for a host, in priority order. */
export function hostInstructionCandidates(dirs: string[], hostId: string): string[] {
  return dirs.map((dir) => path.join(dir, `${hostId}.md`));
}

export interface LoadResult {
  /** The file that was selected, if any (may be empty, which disables instructions). */
  file?: string;
  /** Instructions to inject, or undefined when none apply. */
  instructions?: ContextFile;
}

/** Load and expand the first existing instructions file among `dirs`. */
export function loadHostInstructions(dirs: string[], hostId: string, env: Env = process.env): LoadResult {
  for (const file of hostInstructionCandidates(dirs, hostId)) {
    if (!existsSync(file)) continue;
    const content = expandPlaceholders(readFileSync(file, "utf8").trim(), env);
    return { file, instructions: content ? { path: file, content } : undefined };
  }
  return {};
}

/**
 * Insert `extra` into `files` in place: after the last context file located
 * directly in `agentDir` (the global AGENTS.md), otherwise first. Idempotent.
 */
export function insertContextFile(files: ContextFile[], extra: ContextFile, agentDir: string): void {
  if (files.some((file) => file.path === extra.path)) return;
  const root = path.resolve(agentDir);
  let index = -1;
  files.forEach((file, i) => {
    if (path.dirname(path.resolve(file.path)) === root) index = i;
  });
  files.splice(index + 1, 0, extra);
}
