/**
 * Studio home → Create: a round tile per card kind the club posts, the rest
 * under More, then Carousel set and Blank design.
 */
import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Flag,
  Layers,
  ListOrdered,
  Megaphone,
  Plus,
  Sparkles,
  Star,
  Trophy,
  Users,
  Handshake,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { MakeSetDialog } from "@/components/template-library/make-set-dialog";
import { kindLabel, type CardKind } from "@/lib/social-studio";
import { splitPostedKinds } from "@/lib/studio-home";

const KIND_ICONS: Partial<Record<CardKind, LucideIcon>> = {
  matchDay: CalendarDays,
  matchSummary: Trophy,
  resultsSummary: ListOrdered,
  teamList: Users,
  milestone: Star,
  bigMoment: Sparkles,
  ladder: Flag,
  weekendWrap: Newspaper,
  sponsor: Handshake,
  announcement: Megaphone,
};

function Tile({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-20 flex-col items-center gap-2 text-center sm:w-24"
      >
        <span className="bc-lift flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary-text sm:h-20 sm:w-20">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <span className="text-xs font-medium leading-tight sm:text-sm">{label}</span>
      </button>
    </li>
  );
}

export function CreateRow({
  onPickKind,
  onBlank,
}: {
  onPickKind: (kind: CardKind) => void;
  onBlank: () => void;
}) {
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const { posted, more } = splitPostedKinds(
    bundle?.settings.postingPlan,
    !!bundle?.settings.postingPlanSaved,
  );
  const [showMore, setShowMore] = useState(false);
  const [carousel, setCarousel] = useState(false);

  return (
    <section aria-labelledby="create-heading" className="space-y-3">
      <h2 id="create-heading" className="text-lg font-semibold">
        Create
      </h2>
      <ul className="flex flex-wrap gap-x-3 gap-y-4">
        {posted.map((k) => (
          <Tile
            key={k}
            label={kindLabel(k)}
            icon={KIND_ICONS[k] ?? Plus}
            onClick={() => onPickKind(k)}
          />
        ))}
        <Tile label="Carousel set" icon={Layers} onClick={() => setCarousel(true)} />
        <Tile label="Blank design" icon={Plus} onClick={onBlank} />
      </ul>
      {more.length > 0 && (
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            More
            <ChevronDown
              className={`ml-1 h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`}
              aria-hidden
            />
          </Button>
          {showMore && (
            <ul aria-label="More card types" className="flex flex-wrap gap-x-3 gap-y-4">
              {more.map((k) => (
                <Tile
                  key={k}
                  label={kindLabel(k)}
                  icon={KIND_ICONS[k] ?? Plus}
                  onClick={() => onPickKind(k)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Create → Carousel set: pick the set, a look and a size, then the editor (part 4). */}
      <MakeSetDialog open={carousel} onClose={() => setCarousel(false)} />
    </section>
  );
}
