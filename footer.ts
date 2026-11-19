/**
 * Append a label to the first line of Pi's built-in footer.
 *
 * Pi has no public hook for extending that line without replacing the whole
 * footer (`ctx.ui.setFooter()`), so this wraps `FooterComponent.prototype.render`
 * and rewrites only line 0. The wrapper is installed once per process, shared
 * across `/reload` through a global symbol, and never throws into rendering.
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Render = (this: unknown, width: number) => string[];
type Patchable = { prototype: { render?: Render } } | undefined;

interface FooterPatchState {
  original: Render;
  suffix?: () => string;
}

const STATE_KEY = Symbol.for("pi-host-context.footer");

/** Append `suffix` to an already-rendered footer line without exceeding `width`. */
export function appendToFooterLine(line: string, suffix: string, width: number, ellipsis = "..."): string {
  const suffixWidth = visibleWidth(suffix);
  if (suffixWidth >= width) return truncateToWidth(line, width, ellipsis);
  if (visibleWidth(line) + suffixWidth <= width) return line + suffix;
  return truncateToWidth(line, width - suffixWidth, ellipsis) + suffix;
}

function patchState(): FooterPatchState | undefined {
  return (globalThis as Record<symbol, FooterPatchState | undefined>)[STATE_KEY];
}

/** Wrap `target.prototype.render` once. Returns false when patching is impossible. */
export function installFooterPatch(target: Patchable, suffix: () => string): boolean {
  const proto = target?.prototype;
  if (!proto || typeof proto.render !== "function") return false;

  let state = patchState();
  if (!state) {
    const original = proto.render;
    state = { original };
    proto.render = function (this: unknown, width: number) {
      const lines = original.call(this, width);
      const current = patchState()?.suffix;
      if (!current || !Array.isArray(lines) || lines.length === 0) return lines;
      try {
        const text = current();
        if (text) lines[0] = appendToFooterLine(lines[0], text, width);
      } catch {
        // Never break the footer because of this extension.
      }
      return lines;
    };
    (globalThis as Record<symbol, FooterPatchState | undefined>)[STATE_KEY] = state;
  }
  state.suffix = suffix;
  return true;
}

/** Restore the original render method. */
export function removeFooterPatch(target: Patchable): void {
  const state = patchState();
  if (!state) return;
  if (target?.prototype) target.prototype.render = state.original;
  delete (globalThis as Record<symbol, FooterPatchState | undefined>)[STATE_KEY];
}
