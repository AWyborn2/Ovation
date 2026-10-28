import { useId, useRef, useState } from "react";
import { fieldToken } from "./template-ops";

export type TokenField = { key: string; label: string };

/** Lower case, letters and digits only: "Team name" and "teamName" both read "teamname". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The fields whose label or key holds `q` (already normalised), best first. */
export function matchFields(fields: TokenField[], q: string): TokenField[] {
  if (!q) return fields;
  const score = (f: TokenField) => {
    const label = norm(f.label);
    const key = norm(f.key);
    if (label.startsWith(q) || key.startsWith(q)) return 0;
    if (label.includes(q) || key.includes(q)) return 1;
    return -1;
  };
  return fields
    .map((f) => ({ f, s: score(f) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.f);
}

/** What is being typed at the caret: the span a picked field replaces, and its matches. */
export type TokenQuery = { start: number; end: number; matches: TokenField[] };

/**
 * The field search at `caret` in a text box's content. An open `{{` (no `}}`
 * after it) searches what follows it, and lists every field when nothing
 * does yet; the span runs on over the rest of that token (`{{tea|m}}`).
 * Otherwise the plain words just before the caret search, the longest run
 * of up to four that still matches ("Go team na" searches "team na"), with
 * at least two letters so ordinary typing isn't interrupted.
 */
export function tokenQuery(text: string, caret: number, fields: TokenField[]): TokenQuery | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("{{");
  if (open >= 0 && before.indexOf("}}", open) < 0) {
    const typed = before.slice(open + 2);
    if (/[{}]/.test(typed)) return null;
    const rest = /^[^{}\s]*\}\}/.exec(text.slice(caret));
    const matches = matchFields(fields, norm(typed));
    return matches.length ? { start: open, end: caret + (rest?.[0].length ?? 0), matches } : null;
  }
  if (caret < text.length && /[a-z0-9]/i.test(text[caret])) return null;
  const plain = before.slice(Math.max(before.lastIndexOf("}}") + 2, 0));
  const offset = caret - plain.length;
  const words = [...plain.matchAll(/[^\s{}]+/g)];
  if (
    !words.length ||
    words[words.length - 1].index + words[words.length - 1][0].length < plain.length
  )
    return null;
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const first = words[words.length - n];
    const q = norm(plain.slice(first.index));
    if (q.length < 2) continue;
    const matches = matchFields(fields, q);
    if (matches.length) return { start: offset + first.index, end: caret, matches };
  }
  return null;
}

/**
 * A text box's content that is also a search for live fields (Social
 * Studio): type a word ("hashtag", "team name") or `{{` and pick a field
 * from the list to put its `{{token}}` in place of what was typed. The
 * content can mix several tokens and plain text. A combobox: arrow keys
 * move through the list, Enter or Tab picks, Escape closes it.
 */
export function TokenTextInput({
  value,
  fields,
  onChange,
  className,
}: {
  value: string;
  fields: TokenField[];
  onChange: (text: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // Escape hides the list until the next edit.
  const [dismissed, setDismissed] = useState(false);
  const query = caret === null || dismissed ? null : tokenQuery(value, caret, fields);
  const matches = query?.matches.slice(0, 8) ?? [];
  const open = matches.length > 0;
  const current = Math.min(active, matches.length - 1);

  const track = (el: HTMLInputElement) =>
    setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null);

  const pick = (f: TokenField) => {
    if (!query) return;
    const token = fieldToken(f.key);
    const next = value.slice(0, query.start) + token + value.slice(query.end);
    const at = query.start + token.length;
    onChange(next);
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        aria-label="Text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        placeholder="Type text, or a field like “team name”"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(0);
          track(e.target);
        }}
        onSelect={(e) => track(e.currentTarget)}
        onBlur={() => setCaret(null)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((current + step + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(matches[current]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }
        }}
        className={className}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Fields"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-auto rounded-lg border border-[var(--ed-line)] bg-[var(--ed-panel)] py-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]"
        >
          {matches.map((f, i) => (
            <li
              key={f.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              // Keep the caret in the box while picking with the mouse.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(f)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm ${
                i === current ? "bg-[var(--ed-card)]" : ""
              }`}
            >
              <span className="font-semibold">{f.label}</span>
              <span className="truncate text-xs text-[var(--ed-ink2)]">{fieldToken(f.key)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
