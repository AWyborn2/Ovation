import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateCardTemplate,
  getListCardTemplatesQueryKey,
  type CardTemplate,
} from "@workspace/api-client-react";
import {
  resolvePackIdForKind,
  listSelectablePacksForKind,
  canonicalPackRowFor,
  nextDefaultForKinds,
  byoDefaultsClearedBy,
} from "@/lib/card-template";
import { listPackManifests, DEFAULT_PACK_ID } from "@/lib/pack-templates/registry";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  ALL_CARD_KINDS,
  kindLabel,
  packName,
  type CardKind,
} from "@/lib/social-studio";

/**
 * The confirm dialog the Studio already uses, narrowed to what this hook needs.
 * Kept structural rather than importing the provider's type so the hook stays
 * testable without mounting the dialog.
 */
type Confirm = (opts: {
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  destructive?: boolean;
}) => Promise<boolean>;

export type PackSelection = {
  /** The pack each kind resolves to today (`null` = the renderer's default). */
  packIdByKind: ReadonlyMap<CardKind, string | null>;
  /** The packs offerable for each kind, in registry order. */
  selectablePacksByKind: ReadonlyMap<CardKind, string[]>;
  /** Registered packs this tenant actually has a claimable row for. */
  availablePacks: { packId: string; name: string }[];
  /** The kind with a write in flight, if any. */
  pendingKind: CardKind | null;
  /** The pack a bulk apply is running for, if any. */
  bulkPackId: string | null;
  /** True while any pack write is in flight — gates every pack control. */
  busy: boolean;
  error: string | null;
  clearError: () => void;
  /** How many kinds currently render with `packId`, counting unclaimed ones. */
  kindsUsing: (packId: string) => number;
  selectPack: (kind: CardKind, value: string) => Promise<void>;
  usePackEverywhere: (packId: string) => Promise<void>;
};

/**
 * Owns the tenant's design-pack choice: what each kind resolves to, what it
 * could resolve to, and the two write paths that change it.
 *
 * Extracted from the Studio page because the selection rules are the subtle
 * part of that screen and were buried in 120 lines of a 1000-line component.
 * The page keeps its own template mutation for the layer editor; this hook owns
 * a separate one so a pack write never trips the editor's `onSuccess`.
 */
export function usePackSelection({
  templates,
  confirm,
}: {
  templates: CardTemplate[];
  confirm: Confirm;
}): PackSelection {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Tracked per kind rather than off `isPending` so the spinner lands on the
  // control the admin touched.
  const [pendingKind, setPendingKind] = useState<CardKind | null>(null);
  const [bulkPackId, setBulkPackId] = useState<string | null>(null);

  const updateMut = useUpdateCardTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() });
      },
      onError: (e: unknown) => setError(handleAdminMutationError(e)),
    },
  });

  // Both maps are rebuilt only when the template list actually changes — not on
  // every pending/error toggle, which would defeat <PackCard>'s html memo.
  const packIdByKind = useMemo(
    () =>
      new Map<CardKind, string | null>(
        ALL_CARD_KINDS.map((k) => [k, resolvePackIdForKind(templates, k)] as const),
      ),
    [templates],
  );

  const selectablePacksByKind = useMemo(
    () =>
      new Map<CardKind, string[]>(
        ALL_CARD_KINDS.map(
          (k) => [k, listSelectablePacksForKind(templates, k)] as const,
        ),
      ),
    [templates],
  );

  const availablePacks = useMemo(
    () =>
      listPackManifests()
        .filter((m) => canonicalPackRowFor(templates, m.packId) !== null)
        .map((m) => ({ packId: m.packId, name: m.name })),
    [templates],
  );

  /**
   * An unclaimed kind resolves to `null`, which RENDERS as the default pack —
   * so count it toward that pack, or a fresh tenant reads "Not used by any card
   * type" on Broadcast Dark while every selector calls it "(default)".
   */
  const kindsUsing = (packId: string): number =>
    ALL_CARD_KINDS.filter(
      (k) => (packIdByKind.get(k) ?? DEFAULT_PACK_ID) === packId,
    ).length;

  /**
   * One write path for both surfaces, and ONE PATCH per action, to one canonical
   * row per pack. The server's `clearDefaultKinds` strips the claimed kinds from
   * every other row in the tenant, so a second write would undo the first —
   * three sequential writes across a pack's square/portrait/story rows would
   * leave only the last one claiming anything.
   */
  const claimKindsForPack = (
    packId: string,
    kinds: CardKind[],
    onSettled?: () => void,
  ) => {
    setError(null);
    const row = canonicalPackRowFor(templates, packId);
    if (!row || kinds.length === 0) {
      if (!row) {
        setError(`"${packName(packId)}" isn't available for this club yet.`);
      }
      onSettled?.();
      return;
    }
    let next = row.defaultForKinds ?? [];
    for (const k of kinds) next = nextDefaultForKinds({ defaultForKinds: next }, k);
    updateMut.mutate(
      { id: row.id, data: { defaultForKinds: next } },
      { onSettled: () => onSettled?.() },
    );
  };

  const selectPack = async (kind: CardKind, value: string) => {
    // Claiming ONE kind clears it from the tenant's own templates just as the
    // bulk path does — `clearDefaultKinds` is source-agnostic. Confirm on the
    // same terms, or this surface quietly destroys the very template the card's
    // "Overridden by template" caption is pointing at.
    const cleared = byoDefaultsClearedBy(templates, [kind]);
    if (cleared.length > 0) {
      const ok = await confirm({
        title: `Use ${packName(value || DEFAULT_PACK_ID)} for ${kindLabel(kind)}?`,
        description: `"${cleared[0].name}" is currently the default for ${kindLabel(
          kind,
        )} and will lose it. That template overrides the pack, so this changes which design ships.`,
        confirmText: "Use this pack",
        destructive: true,
      });
      if (!ok) return;
    }
    // "" is the leading option: the default pack, written as an explicit claim
    // rather than an empty body, so the choice is stored rather than inferred.
    setPendingKind(kind);
    claimKindsForPack(value || DEFAULT_PACK_ID, [kind], () => setPendingKind(null));
  };

  /** The kinds a pack can actually render for this tenant, in gallery order. */
  const kindsCoveredByPack = (packId: string): CardKind[] =>
    ALL_CARD_KINDS.filter((k) =>
      (selectablePacksByKind.get(k) ?? []).includes(packId),
    );

  const usePackEverywhere = async (packId: string) => {
    const name = packName(packId);
    const covered = kindsCoveredByPack(packId);
    if (covered.length === 0) return;
    const uncovered = ALL_CARD_KINDS.filter((k) => !covered.includes(k));
    // `defaultForKinds` is one namespace: claiming these kinds for the pack also
    // clears them from the tenant's OWN templates, and a cleared `layers`
    // default changes which renderer the card ships through. Name the cost.
    const cleared = byoDefaultsClearedBy(templates, covered);
    const clearedNames = cleared
      .slice(0, 4)
      .map((t) => `"${t.name}"`)
      .join(", ");
    const ok = await confirm({
      title: `Use ${name} for all card types?`,
      description: (
        <>
          <span className="block">
            {name} will be used for {covered.length} card{" "}
            {covered.length === 1 ? "type" : "types"}.
          </span>
          {uncovered.length > 0 && (
            <span className="block pt-2">
              {uncovered.length} card {uncovered.length === 1 ? "type" : "types"}{" "}
              this pack doesn't cover stay as they are:{" "}
              {uncovered.map(kindLabel).join(", ")}.
            </span>
          )}
          <span className="block pt-2">
            {cleared.length === 0
              ? "None of your own templates lose their per-card-type default."
              : `${cleared.length} of your own ${
                  cleared.length === 1 ? "template" : "templates"
                } will lose their per-card-type default: ${clearedNames}${
                  cleared.length > 4 ? `, and ${cleared.length - 4} more` : ""
                }.`}
          </span>
        </>
      ),
      confirmText: "Apply to all card types",
      destructive: cleared.length > 0,
    });
    if (!ok) return;
    setBulkPackId(packId);
    claimKindsForPack(packId, covered, () => setBulkPackId(null));
  };

  return {
    packIdByKind,
    selectablePacksByKind,
    availablePacks,
    pendingKind,
    bulkPackId,
    busy: pendingKind !== null || bulkPackId !== null,
    error,
    clearError: () => setError(null),
    kindsUsing,
    selectPack,
    usePackEverywhere,
  };
}
