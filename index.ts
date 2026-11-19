/**
 * pi-host-context: detect which host application (Rex, Orca, ...) launched Pi,
 * load host-specific instructions, and show the host in the footer.
 */

import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FooterComponent, getAgentDir } from "@earendil-works/pi-coding-agent";
import { detectHost, type HostInfo } from "./detect.ts";
import { installFooterPatch, removeFooterPatch } from "./footer.ts";
import {
  type ContextFile,
  hostInstructionCandidates,
  insertContextFile,
  loadHostInstructions,
  userHostsDir,
} from "./instructions.ts";

export { detectHost, HOST_OVERRIDE_ENV } from "./detect.ts";
export type { HostId, HostInfo } from "./detect.ts";
export { appendToFooterLine, installFooterPatch, removeFooterPatch } from "./footer.ts";
export {
  expandPlaceholders,
  HOSTS_DIR_ENV,
  insertContextFile,
  loadHostInstructions,
  userHostsDir,
} from "./instructions.ts";

/** Set to `off`, `0`, or `false` to keep the built-in footer untouched. */
export const FOOTER_ENV = "PI_HOST_CONTEXT_FOOTER";

const STATUS_KEY = "host-context";
const SEPARATOR = " · ";
const BUILTIN_HOSTS_DIR = fileURLToPath(new URL("./hosts/", import.meta.url));

function footerEnabled(env = process.env): boolean {
  const value = env[FOOTER_ENV]?.trim().toLowerCase();
  return !(value === "off" || value === "0" || value === "false");
}

export default function hostContext(pi: ExtensionAPI) {
  const host: HostInfo = detectHost();
  const agentDir = getAgentDir();
  const dirs = [userHostsDir(agentDir), BUILTIN_HOSTS_DIR];
  let selectedFile: string | undefined;
  let instructions: ContextFile | undefined;

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    // Read once per session (and on /reload); keeps the prompt stable per run.
    try {
      ({ file: selectedFile, instructions } = loadHostInstructions(dirs, host.id));
    } catch (error) {
      selectedFile = undefined;
      instructions = undefined;
      if (ctx.hasUI) ctx.ui.notify(`pi-host-context: failed to read host instructions: ${String(error)}`, "warning");
    }

    if (!ctx.hasUI || !footerEnabled()) return;
    const dim = (text: string) => ctx.ui.theme?.fg?.("dim", text) ?? text;
    const patched = installFooterPatch(FooterComponent as never, () => dim(`${SEPARATOR}${host.label}`));
    if (!patched) ctx.ui.setStatus(STATUS_KEY, dim(host.label));
  });

  pi.on("session_shutdown", async (_event, ctx: ExtensionContext) => {
    // The next session_start (including after /reload) installs a fresh patch.
    removeFooterPatch(FooterComponent as never);
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.on("before_agent_start", async (event) => {
    if (!instructions) return;
    insertContextFile(event.systemPromptOptions.contextFiles, instructions, agentDir);
  });

  pi.registerCommand("host", {
    description: "Show the detected host app and its instructions file",
    handler: async (_args, ctx) => {
      const source = host.evidence ? ` (via ${host.evidence})` : "";
      let status: string;
      if (instructions) status = `Instructions: ${selectedFile}`;
      else if (selectedFile) status = `Instructions disabled by empty file: ${selectedFile}`;
      else status = `No instructions. Looked for:\n${hostInstructionCandidates(dirs, host.id).join("\n")}`;
      ctx.ui.notify(`Host: ${host.label} [${host.id}]${source}\n${status}`, "info");
    },
  });
}
