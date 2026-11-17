import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import { shortClubName } from "@/lib/pack-card-data";
import type { CardKind, MatchSummaryTeam } from "@/lib/share-card";
import { juniorSampleCardInput } from "@/lib/sample-card-inputs";
import { initialCardState, type CardFormState } from "./logic";

/** The current tenant's brand as the Match Summary club-team default. */
export function teamFromBrand(brand: ClubBrand): MatchSummaryTeam {
  const accent = brand.primaryColour ?? DEFAULT_BRAND.primaryColour ?? "#94A3B8";
  return {
    name: shortClubName(brand.name ?? DEFAULT_BRAND.name),
    shortName: brand.shortName ?? null,
    primaryColor: brand.backgroundColour ?? DEFAULT_BRAND.backgroundColour ?? "#334155",
    secondaryColor: accent,
    textColor: accent,
    logoUrl: brand.logoUrl ?? null,
  };
}

/** Seed a kind's editable state as the tenant: club-name tokens in the sample
 * become the tenant's short name, and Match Summary's club side carries the
 * full brand (colours + logo). */
export function seedState(kind: CardKind, brand: ClubBrand): CardFormState {
  const state = initialCardState(kind, shortClubName(brand.name ?? DEFAULT_BRAND.name));
  if (kind === "matchSummary") state.club = teamFromBrand(brand);
  return state;
}

/**
 * A junior card's starting state (New Studio's Create, Juniors): the junior sample,
 * with sample junior names and no photo, never the senior sample's players.
 */
export function juniorSeedState(kind: CardKind, brand: ClubBrand): CardFormState {
  const sample = juniorSampleCardInput(kind, shortClubName(brand.name ?? DEFAULT_BRAND.name));
  const { kind: _kind, ...state } = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
  if (kind === "matchSummary") state.club = teamFromBrand(brand);
  return state;
}
