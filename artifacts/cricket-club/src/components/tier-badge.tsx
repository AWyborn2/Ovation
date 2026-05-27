import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";

const TIER_ICONS: LucideIcon[] = [Crown, Trophy, Medal, Award, Star, Shield, Sparkles];

export const TierBadge = ({ tierIndex, className }: { tierIndex: number; className?: string }) => {
  const Icon = TIER_ICONS[Math.min(Math.max(tierIndex, 0), TIER_ICONS.length - 1)];
  return <Icon className={className ?? "h-5 w-5 md:h-6 md:w-6 shrink-0"} strokeWidth={2.25} />;
};
