import { ShieldBadge } from "./shield-badge";
import { BallBadge } from "./ball-badge";
import { ChevronBadge } from "./chevron-badge";
import { PillBadge } from "./pill-badge";

export type BadgePresetId = "shield" | "ball" | "chevron" | "pill";

export interface BadgePresetProps {
  label: string;
  size: number;
  className?: string;
}

export function badgeFontSize(label: string): number {
  return label.length > 7 ? 14 : label.length > 5 ? 17 : 20;
}

export const PRESETS: Record<BadgePresetId, React.ComponentType<BadgePresetProps>> = {
  shield: ShieldBadge,
  ball: BallBadge,
  chevron: ChevronBadge,
  pill: PillBadge,
};

export { ShieldBadge, BallBadge, ChevronBadge, PillBadge };
