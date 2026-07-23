/**
 * Shared field primitives for the card builder forms (U8).
 *
 * Every control is fully controlled off the parent's form state so a prefilled
 * value and a hand-typed value flow through the same path — a prefilled field is
 * always editable (R14).
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import type { CardKind } from "@/lib/share-card";
import { ROW_CAPS, type CardFormState } from "./logic";
import type { KindDescriptor, RepeatColumn, ScalarField } from "./descriptors";

export const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type SetState = (patch: CardFormState) => void;

/** Coerce a text input into the state value type expected for a number field. */
function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function ScalarControl({
  field,
  state,
  setState,
}: {
  field: ScalarField;
  state: CardFormState;
  setState: SetState;
}) {
  const raw = state[field.key];
  const set = (value: unknown) => setState({ [field.key]: value });

  if (field.type === "switch") {
    return (
      <div className="flex items-center gap-2 pt-6">
        <Switch checked={Boolean(raw)} onCheckedChange={(v) => set(v)} />
        <Label className="text-sm">{field.label}</Label>
      </div>
    );
  }

  const label = <Label>{field.label}</Label>;

  if (field.type === "select") {
    return (
      <div className="space-y-1">
        {label}
        <select
          className={selectClass}
          value={raw == null ? "" : String(raw)}
          onChange={(e) => set(e.target.value)}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        {label}
        <Textarea
          value={raw == null ? "" : String(raw)}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value || null)}
        />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="space-y-1">
        {label}
        <Input
          type="number"
          value={raw == null ? "" : String(raw)}
          placeholder={field.placeholder}
          onChange={(e) => set(toNumberOrNull(e.target.value))}
        />
      </div>
    );
  }

  // text
  return (
    <div className="space-y-1">
      {label}
      <Input
        value={raw == null ? "" : String(raw)}
        placeholder={field.placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );
}

/** A player typeahead that writes the selected name into the descriptor's field(s). */
function PlayerPickRow({
  descriptor,
  setState,
}: {
  descriptor: KindDescriptor;
  setState: SetState;
}) {
  const pf = descriptor.playerField;
  if (!pf) return null;
  const onPick = (p: SelectedPlayer | null) => {
    if (!p) return;
    if ("firstKey" in pf) {
      setState({ [pf.firstKey]: p.givenName, [pf.lastKey]: p.surname });
    } else {
      setState({ [pf.key]: `${p.givenName} ${p.surname}`.trim() });
    }
  };
  return (
    <div className="space-y-1">
      <Label>Link a player (fills the name — still editable)</Label>
      <PlayerTypeahead value={null} onChange={onPick} />
    </div>
  );
}

/** Inline editor for a single repeat column. */
function RepeatCell({
  col,
  value,
  onChange,
}: {
  col: RepeatColumn;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (col.type === "switch") {
    return (
      <div className={`flex items-center justify-center ${col.width ?? ""}`}>
        <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
      </div>
    );
  }
  if (col.type === "select") {
    return (
      <select
        className={`${selectClass} ${col.width ?? ""}`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      >
        {(col.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === "number") {
    return (
      <Input
        type="number"
        className={col.width ?? "w-16"}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(toNumberOrNull(e.target.value) ?? 0)}
      />
    );
  }
  return (
    <Input
      className={col.width ?? "flex-1"}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Repeat-row editor for team lists / ladder / weekend wrap / club leaderboard / stats. */
function RepeatEditor({
  kind,
  descriptor,
  state,
  setState,
}: {
  kind: CardKind;
  descriptor: KindDescriptor;
  state: CardFormState;
  setState: SetState;
}) {
  const spec = descriptor.repeat;
  if (!spec) return null;
  const cap = ROW_CAPS[kind];
  const max = cap?.cap ?? 99;
  const min = cap?.min ?? 1;

  const rows = (Array.isArray(state[spec.key]) ? state[spec.key] : []) as Record<
    string,
    unknown
  >[];

  const commit = (next: Record<string, unknown>[]) => setState({ [spec.key]: next });
  const setCell = (rowIdx: number, colKey: string, value: unknown) =>
    commit(rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r)));
  const addRow = () => {
    if (rows.length >= max) return;
    commit([...rows, spec.newRow()]);
  };
  const removeRow = (idx: number) => {
    if (rows.length <= min) return;
    commit(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {spec.label} · {rows.length}/{max}
        </Label>
        <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= max}>
          <Plus className="h-3 w-3 mr-1" /> {spec.addLabel}
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-end gap-1">
            {spec.columns.map((col) => (
              <div key={col.key} className={`space-y-1 ${col.width ? "" : "flex-1"}`}>
                {idx === 0 && (
                  <Label className="text-[10px] uppercase text-muted-foreground">{col.label}</Label>
                )}
                <RepeatCell
                  col={col}
                  value={row[col.key]}
                  onChange={(v) => setCell(idx, col.key, v)}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRow(idx)}
              disabled={rows.length <= min}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The generic descriptor-driven editor used by every non-bespoke kind. */
export function GenericCardForm({
  kind,
  descriptor,
  state,
  setState,
}: {
  kind: CardKind;
  descriptor: KindDescriptor;
  state: CardFormState;
  setState: SetState;
}) {
  return (
    <div className="space-y-5">
      {descriptor.playerField && (
        <PlayerPickRow descriptor={descriptor} setState={setState} />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {descriptor.fields.map((field) => (
          <div key={field.key} className={field.full ? "sm:col-span-2" : undefined}>
            <ScalarControl field={field} state={state} setState={setState} />
          </div>
        ))}
      </div>
      {descriptor.repeat && (
        <RepeatEditor kind={kind} descriptor={descriptor} state={state} setState={setState} />
      )}
    </div>
  );
}
