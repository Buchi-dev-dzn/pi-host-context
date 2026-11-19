import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Load the extension with the installed host's own TS loader, like Pi does.
const root = process.env.PI_PACKAGE_ROOT ?? path.join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  "@earendil-works/pi-coding-agent",
);
const { createJiti } = await import(pathToFileURL(path.join(root, "dist/core/extensions/jiti-loader.js")));
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: {
    "@earendil-works/pi-tui": path.join(root, "node_modules/@earendil-works/pi-tui/dist/index.js"),
    "@earendil-works/pi-coding-agent": path.join(root, "dist/index.js"),
  },
});
const mod = await jiti.import(fileURLToPath(new URL("./index.ts", import.meta.url)));
const {
  detectHost,
  appendToFooterLine,
  installFooterPatch,
  removeFooterPatch,
  expandPlaceholders,
  loadHostInstructions,
  insertContextFile,
  userHostsDir,
} = mod;

const builtinDir = fileURLToPath(new URL("./hosts/", import.meta.url));

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "pi-host-context-"));
}

// --- detection -------------------------------------------------------------

test("detects Orca before Rex", () => {
  const host = detectHost({ ORCA_PANE_KEY: "p", REX_SESSION: "s", TERM_PROGRAM: "rex" });
  assert.equal(host.id, "orca");
  assert.equal(host.evidence, "ORCA_PANE_KEY");
});

test("detects Rex from its session or TERM_PROGRAM", () => {
  assert.equal(detectHost({ REX_SESSION: "session:1" }).id, "rex");
  assert.equal(detectHost({ TERM_PROGRAM: "rex" }).label, "Rex");
});

test("ignores ORCA_PI_STATUS_OWNED, which is set inside Pi itself", () => {
  assert.equal(detectHost({ ORCA_PI_STATUS_OWNED: "123", TERM_PROGRAM: "rex" }).id, "rex");
});

test("falls back to known terminals, tmux, then TERM_PROGRAM", () => {
  assert.equal(detectHost({ TERM_PROGRAM: "WezTerm" }).id, "wezterm");
  assert.equal(detectHost({ TERM_PROGRAM: "vscode" }).id, "vscode");
  assert.equal(detectHost({ TMUX: "/tmp/tmux" }).id, "tmux");
  assert.deepEqual(detectHost({ TERM_PROGRAM: "Ghostty" }), { id: "terminal", label: "Ghostty", evidence: "TERM_PROGRAM" });
  assert.equal(detectHost({}).label, "terminal");
});

test("PI_HOST overrides detection", () => {
  assert.deepEqual(detectHost({ PI_HOST: "Orca", REX_SESSION: "s" }), { id: "orca", label: "Orca", evidence: "PI_HOST" });
  assert.deepEqual(detectHost({ PI_HOST: "ghostty" }), { id: "terminal", label: "ghostty", evidence: "PI_HOST" });
});

// --- instructions ----------------------------------------------------------

test("expands {{VAR}} placeholders from the environment", () => {
  assert.equal(expandPlaceholders("s={{ REX_SESSION }} b={{REX_BLOCK}}", { REX_SESSION: "session:1" }), "s=session:1 b=(unset)");
  assert.equal(expandPlaceholders("{{lower}} stays", {}), "{{lower}} stays");
});

test("user hosts dir defaults to <agent-dir>/hosts and honors PI_HOST_CONTEXT_DIR", () => {
  assert.equal(userHostsDir("/a/agent", {}), path.join("/a/agent", "hosts"));
  assert.equal(userHostsDir("/a/agent", { PI_HOST_CONTEXT_DIR: "/custom" }), path.resolve("/custom"));
});

test("user files override built-in defaults; empty user files disable them", () => {
  const userDir = tempDir();
  const builtin = tempDir();
  writeFileSync(path.join(builtin, "rex.md"), "builtin {{REX_BLOCK}}\n");
  writeFileSync(path.join(builtin, "orca.md"), "builtin orca\n");
  writeFileSync(path.join(userDir, "rex.md"), "# Mine\nblock {{REX_BLOCK}}\n\n");
  writeFileSync(path.join(userDir, "orca.md"), "  \n");
  const dirs = [userDir, builtin];

  assert.deepEqual(loadHostInstructions(dirs, "rex", { REX_BLOCK: "block:9" }), {
    file: path.join(userDir, "rex.md"),
    instructions: { path: path.join(userDir, "rex.md"), content: "# Mine\nblock block:9" },
  });
  assert.deepEqual(loadHostInstructions(dirs, "orca", {}), { file: path.join(userDir, "orca.md"), instructions: undefined });
  assert.deepEqual(loadHostInstructions(dirs, "wezterm", {}), {});
  assert.equal(loadHostInstructions([tempDir(), builtin], "rex", {}).instructions.content, "builtin (unset)");
});

test("inserts host instructions right after the global AGENTS.md, once", () => {
  const agentDir = "/home/u/.pi/agent";
  const extra = { path: `${agentDir}/hosts/rex.md`, content: "rex" };
  const files = [
    { path: `${agentDir}/AGENTS.md`, content: "global" },
    { path: "/repo/AGENTS.md", content: "project" },
  ];
  insertContextFile(files, extra, agentDir);
  insertContextFile(files, extra, agentDir);
  assert.deepEqual(files.map((f) => f.content), ["global", "rex", "project"]);

  const noGlobal = [{ path: "/repo/AGENTS.md", content: "project" }];
  insertContextFile(noGlobal, extra, agentDir);
  assert.deepEqual(noGlobal.map((f) => f.content), ["rex", "project"]);
});

test("built-in host files exist and only use their host's placeholders", () => {
  for (const id of ["rex", "orca"]) {
    const text = readFileSync(path.join(builtinDir, `${id}.md`), "utf8");
    assert.match(text, /^# Host: /);
    for (const [, name] of text.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) {
      assert.ok(name.startsWith(`${id.toUpperCase()}_`), `${id}.md uses unexpected placeholder ${name}`);
    }
  }
});

// --- footer ----------------------------------------------------------------

test("appends the suffix within the available width", () => {
  assert.equal(appendToFooterLine("~/dotfiles (main)", " · Rex", 80), "~/dotfiles (main) · Rex");
  assert.ok(appendToFooterLine("~/dotfiles (main)", " · Rex", 16).endsWith(" · Rex"));
});

test("patches only the first footer line and restores cleanly", () => {
  class FakeFooter {
    render() {
      return ["~/x (main)", "stats", "status"];
    }
  }
  const original = FakeFooter.prototype.render;
  assert.equal(installFooterPatch(FakeFooter, () => " · Rex"), true);
  assert.deepEqual(new FakeFooter().render(80), ["~/x (main) · Rex", "stats", "status"]);

  // A second install (e.g. after /reload) updates the suffix without re-wrapping.
  installFooterPatch(FakeFooter, () => " · Orca");
  assert.equal(new FakeFooter().render(80)[0], "~/x (main) · Orca");

  removeFooterPatch(FakeFooter);
  assert.equal(FakeFooter.prototype.render, original);
});

test("a throwing suffix never breaks the footer", () => {
  class FakeFooter {
    render() {
      return ["line"];
    }
  }
  installFooterPatch(FakeFooter, () => {
    throw new Error("boom");
  });
  assert.deepEqual(new FakeFooter().render(80), ["line"]);
  removeFooterPatch(FakeFooter);
});

test("the extension registers its hooks and /host command", () => {
  const events = new Set();
  const commands = new Set();
  mod.default({
    on: (name) => events.add(name),
    registerCommand: (name) => commands.add(name),
  });
  for (const name of ["session_start", "session_shutdown", "before_agent_start"]) assert.ok(events.has(name), name);
  assert.ok(commands.has("host"));
});

test("before_agent_start injects the built-in Rex instructions", async () => {
  const handlers = new Map();
  const agentDir = tempDir();
  const saved = { ...process.env };
  Object.assign(process.env, { PI_HOST: "rex", REX_BLOCK: "block:e2e", PI_CODING_AGENT_DIR: agentDir });
  try {
    mod.default({ on: (name, fn) => handlers.set(name, fn), registerCommand() {} });
    await handlers.get("session_start")({}, { hasUI: false });
    const contextFiles = [{ path: path.join(agentDir, "AGENTS.md"), content: "global" }];
    await handlers.get("before_agent_start")({ systemPromptOptions: { contextFiles } });
    assert.equal(contextFiles.length, 2);
    assert.equal(contextFiles[1].path, path.join(builtinDir, "rex.md"));
    assert.match(contextFiles[1].content, /block:e2e/);
  } finally {
    process.env = saved;
  }
});
