import { Loader2 } from "lucide-react";
import { type CardTemplate, type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { DEFAULT_PACK_ID } from "@/lib/pack-templates/registry";
import { type PackCardData } from "@/lib/pack-render";
import { type ShareCardInput } from "@/lib/share-card";
import { KIND_BLURB, PACK_SWATCH, packName, type CardKind } from "@/lib/social-studio";
import type { PackSelection } from "@/lib/use-pack-selection";
import { cn } from "@/lib/utils";

/**
 * Pack per card type (Social Studio U14): mix packs, so game-day posts can be
 * Neon Night while results stay Broadcast Dark. One row per card type with a
 * live thumbnail, what drafts it, a swatch per pack and the current choice.
 */
export function PackPerTypeSection({
  selection,
  inputByKind,
  dataByKind,
  theme,
  templateByKind,
}: {
  selection: PackSelection;
  /** The club's own layer/background template claiming a type, if any. */
  templateByKind?: ReadonlyMap<string, CardTemplate>;
  inputByKind: ReadonlyMap<CardKind, ShareCardInput>;
  dataByKind: ReadonlyMap<string, PackCardData>;
  theme: ApiCardTheme | null;
}) {
  const { packIdByKind, selectablePacksByKind, selectPack, pendingKind, busy } = selection;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-5 py-5">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">
          Pack per card type
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Mix packs. Game-day posts can be Neon Night while results stay Broadcast Dark.
        </p>
      </header>
      <ul className="divide-y divide-border">
        {CARD_KIND_OPTIONS.map(({ value: kind, label }) => {
          const current = packIdByKind.get(kind) ?? DEFAULT_PACK_ID;
          const choices = [
            DEFAULT_PACK_ID,
            ...(selectablePacksByKind.get(kind) ?? []).filter((p) => p !== DEFAULT_PACK_ID),
          ];
          const input = inputByKind.get(kind);
          return (
            <li key={kind} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-muted">
                {input && (
                  <PackCard
                    input={input}
                    size="square"
                    sponsorsOn
                    junior={false}
                    theme={theme}
                    data={dataByKind.get(kind) ?? null}
                    packId={current}
                  />
                )}
              </div>
              <div className="min-w-[160px] flex-1">
                <p className="font-semibold">{label}</p>
                <p className="text-[13px] text-muted-foreground">{KIND_BLURB[kind]}</p>
                {templateByKind?.get(kind) && (
                  <p className="text-xs text-primary-text">
                    Uses your template: {templateByKind.get(kind)!.name}
                  </p>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label={`Design pack for ${label}`}
                className="flex items-center gap-2"
              >
                {choices.map((packId) => {
                  const on = packId === current;
                  return (
                    <button
                      key={packId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={packName(packId)}
                      title={packName(packId)}
                      disabled={busy}
                      // Re-picking the pack a type already claims is a no-op; picking
                      // the default on an unclaimed type writes an explicit claim.
                      onClick={() =>
                        packIdByKind.get(kind) !== packId &&
                        selectPack(kind, packId === DEFAULT_PACK_ID ? "" : packId)
                      }
                      className={cn(
                        "h-9 w-9 rounded-lg border transition-transform hover:scale-105 disabled:opacity-60",
                        on ? "border-primary ring-2 ring-primary" : "border-border",
                      )}
                      style={{ background: PACK_SWATCH[packId] ?? "var(--muted)" }}
                    />
                  );
                })}
              </div>
              <div className="flex w-36 items-center justify-end gap-1.5 text-right text-sm font-semibold">
                {pendingKind === kind && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                {packName(current)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
