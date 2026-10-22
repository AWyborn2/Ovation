/**
 * Editing inside a group (editable-elements plan, A2): the editor works on
 * one level of a page at a time, its "scope". At the top the scope is the
 * page; double-clicking a group (or a stack) enters it, and Esc goes back up.
 *
 * A scope is shown to the rest of the editor as a flat document whose layers
 * are the group's children, so every editing operation (move, resize, delete,
 * arrange, clipboard, undo) works on nested layers unchanged, and its result
 * is written back into the group.
 */
import type { StackSpec } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import { childrenOf, type EditorDoc } from "./document";
import { findLayer, updateDeep, type EditorLayer } from "./template-doc";

/** A layer the editor can enter: a group or stack with children. */
export const isContainer = (l: FreeLayer | EditorLayer): boolean =>
  l.kind === "group" && childrenOf(l as FreeLayer).length > 0;

/** Whether a layer lays its children out as a stack (their positions come from the stack). */
export const isStack = (l: FreeLayer | EditorLayer | null | undefined): boolean =>
  !!(l as { stack?: StackSpec } | null | undefined)?.stack;

/** The group a scope id names, or null when it's the page or no longer there. */
export function scopeLayer(doc: EditorDoc, scope: string | null): EditorLayer | null {
  if (!scope) return null;
  const hit = findLayer(doc, scope)?.layer ?? null;
  return hit && hit.kind === "group" ? hit : null;
}

/** One level of a page as a flat document: the page itself, or a group's children. */
export function scopeDoc(doc: EditorDoc, scope: string | null): EditorDoc {
  const group = scopeLayer(doc, scope);
  if (!group) return doc;
  return { ...doc, layers: (group.children ?? []) as FreeLayer[] };
}

/** The page with one level replaced by an edited copy of it. */
export function withScope(doc: EditorDoc, scope: string | null, view: EditorDoc): EditorDoc {
  const group = scopeLayer(doc, scope);
  if (!group) return view;
  const { layers: _layers, ...rest } = view;
  return {
    ...updateDeep(doc, group.id, { children: (view.layers ?? []) as EditorLayer[] }),
    ...rest,
  };
}

/** The group a layer sits in (null at the top of the page or when it isn't there). */
export function parentOf(doc: EditorDoc, id: string): string | null {
  return findLayer(doc, id)?.parent?.id ?? null;
}

/** The groups from the top of the page down to `scope`, outermost first. */
export function scopePath(doc: EditorDoc, scope: string | null): EditorLayer[] {
  const path: EditorLayer[] = [];
  let at = scopeLayer(doc, scope);
  while (at) {
    path.unshift(at);
    const up = parentOf(doc, at.id);
    at = up ? scopeLayer(doc, up) : null;
  }
  return path;
}

/** Whether a scope's children are placed by a stack, at its level or any level above. */
export const scopeInStack = (doc: EditorDoc, scope: string | null): boolean =>
  scopePath(doc, scope).some(isStack);
