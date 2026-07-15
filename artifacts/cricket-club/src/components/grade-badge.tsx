import { useMemo } from "react";
import {
  useGetTenantBrand,
  getGetTenantBrandQueryKey,
  useGetGradeMeta,
  type TenantBrand as ApiBrand,
} from "@workspace/api-client-react";
import { PRESETS, type BadgePresetId } from "./badge-presets";

interface GradeMeta {
  abbr: string;
  sortOrder: number;
}

const FALLBACK_META: Record<string, GradeMeta> = {
  "A Grade":        { abbr: "A GRADE",  sortOrder: 1 },
  "B Grade":        { abbr: "B GRADE",  sortOrder: 2 },
  "C Grade":        { abbr: "C GRADE",  sortOrder: 3 },
  "D Grade":        { abbr: "D GRADE",  sortOrder: 4 },
  "E Grade":        { abbr: "E GRADE",  sortOrder: 5 },
  "F Grade":        { abbr: "F GRADE",  sortOrder: 6 },
  "Female A Grade": { abbr: "FEM A",    sortOrder: 7 },
  "Female B Grade": { abbr: "FEM B",    sortOrder: 8 },
  "PPL":            { abbr: "PPL",      sortOrder: 9 },
  "Colts":          { abbr: "COLTS",    sortOrder: 10 },
};

function fallbackAbbr(grade: string): string {
  if (grade.length <= 3) return grade.toUpperCase();
  const words = grade.split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 5);
  return grade.toUpperCase().slice(0, 8);
}

function getMeta(grade: string): GradeMeta {
  return FALLBACK_META[grade] ?? { abbr: fallbackAbbr(grade), sortOrder: 99 };
}

export const sortGradesBySeniority = (grades: Iterable<string>): string[] =>
  Array.from(grades).sort((a, b) => getMeta(a).sortOrder - getMeta(b).sortOrder);

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 44, md: 68, lg: 112 };

function useBadgeStyle(): BadgePresetId {
  const q = useGetTenantBrand({ query: { queryKey: getGetTenantBrandQueryKey() } });
  const raw = q.data as ApiBrand | undefined;
  const style = raw?.badgeStyle ?? "shield";
  return (style in PRESETS ? style : "shield") as BadgePresetId;
}

function useGradeMeta(): Map<string, GradeMeta> {
  const q = useGetGradeMeta();
  return useMemo(() => {
    if (!q.data) return new Map();
    return new Map(q.data.map((m) => [m.grade, { abbr: m.abbr, sortOrder: m.sortOrder }]));
  }, [q.data]);
}

interface GradeBadgeProps {
  grade: string;
  size?: Size;
  className?: string;
}

export const GradeBadge = ({ grade, size = "sm", className }: GradeBadgeProps) => {
  const badgeStyle = useBadgeStyle();
  const apiMeta = useGradeMeta();
  const Preset = PRESETS[badgeStyle];
  const meta = apiMeta.get(grade) ?? getMeta(grade);
  const px = SIZE_PX[size];

  return (
    <div
      className={`inline-block shrink-0 select-none ${className ?? ""}`}
      style={{ color: "hsl(var(--accent))" }}
      title={grade}
    >
      <Preset label={meta.abbr} size={px} />
    </div>
  );
};

interface GradeBadgeListProps {
  grades: Iterable<string>;
  size?: Size;
  className?: string;
}

export const GradeBadgeList = ({ grades, size = "sm", className }: GradeBadgeListProps) => {
  const sorted = sortGradesBySeniority(grades);
  if (sorted.length === 0) return <span className="text-xs text-muted-foreground italic">—</span>;
  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {sorted.map((g) => (
        <GradeBadge key={g} grade={g} size={size} />
      ))}
    </div>
  );
};

export const GradeBadgeListFromString = ({
  gradesPlayed,
  size = "sm",
  className,
}: {
  gradesPlayed: string | null | undefined;
  size?: Size;
  className?: string;
}) => {
  const grades = (gradesPlayed ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && g !== "CLUB TOTAL");
  return <GradeBadgeList grades={grades} size={size} className={className} />;
};
