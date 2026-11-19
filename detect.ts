/**
 * Detect which host application launched this Pi process.
 *
 * Detection relies only on environment variables the host injects into the
 * terminal it spawns, so it is synchronous and side-effect free.
 */

export type HostId = "orca" | "rex" | "wezterm" | "vscode" | "tmux" | "terminal";

export interface HostInfo {
  /** Stable identifier for programmatic use (e.g. selecting instructions). */
  id: HostId;
  /** Short human-readable label for the footer. */
  label: string;
  /** Environment variable that decided the result, for debugging. */
  evidence?: string;
}

type Env = Record<string, string | undefined>;

// Variables injected by Orca into every agent terminal it launches.
const ORCA_MARKERS = [
  "ORCA_PANE_KEY",
  "ORCA_TAB_ID",
  "ORCA_WORKTREE_ID",
  "ORCA_AGENT_HOOK_PORT",
] as const;

// Variables injected by Rex into its terminal blocks.
const REX_MARKERS = ["REX_SESSION", "REX_BLOCK"] as const;

function firstPresent(env: Env, names: readonly string[]): string | undefined {
  return names.find((name) => Boolean(env[name]));
}

const LABELS: Record<Exclude<HostId, "terminal">, string> = {
  orca: "Orca",
  rex: "Rex",
  wezterm: "WezTerm",
  vscode: "VS Code",
  tmux: "tmux",
};

/** Environment variable that forces the host, e.g. across SSH or WSL boundaries. */
export const HOST_OVERRIDE_ENV = "PI_HOST";

export function detectHost(env: Env = process.env): HostInfo {
  // Explicit override wins: hosts' own variables do not survive SSH or wsl.exe.
  const forced = env[HOST_OVERRIDE_ENV]?.trim().toLowerCase();
  if (forced) {
    const label = forced in LABELS ? LABELS[forced as keyof typeof LABELS] : undefined;
    return label
      ? { id: forced as HostId, label, evidence: HOST_OVERRIDE_ENV }
      : { id: "terminal", label: forced, evidence: HOST_OVERRIDE_ENV };
  }

  // Orca first: it is the most specific signal and governs agent workflow.
  const orca = firstPresent(env, ORCA_MARKERS);
  if (orca) return { id: "orca", label: "Orca", evidence: orca };

  const rex = firstPresent(env, REX_MARKERS);
  if (rex) return { id: "rex", label: "Rex", evidence: rex };

  const program = env.TERM_PROGRAM?.trim();
  const lower = program?.toLowerCase();
  if (lower === "rex") return { id: "rex", label: "Rex", evidence: "TERM_PROGRAM" };
  if (lower === "wezterm") return { id: "wezterm", label: "WezTerm", evidence: "TERM_PROGRAM" };
  if (lower === "vscode") return { id: "vscode", label: "VS Code", evidence: "TERM_PROGRAM" };
  if (env.TMUX) return { id: "tmux", label: "tmux", evidence: "TMUX" };

  return {
    id: "terminal",
    label: program || "terminal",
    evidence: program ? "TERM_PROGRAM" : undefined,
  };
}
