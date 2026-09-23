import type { DebutEntry } from "@workspace/api-client-react";
import type { PromotionEntry } from "@/lib/honour-boards";

export type Scope = "career" | "by-grade";

// A card in the "Just achieved" list: either a career-total milestone promotion
// or an A Grade / Female A Grade debut.
export type RecentItem =
  | { kind: "debut"; key: string; debut: DebutEntry }
  | { kind: "promotion"; key: string; promotion: PromotionEntry };

export type PremiershipCount = { won: number; captained: number };
