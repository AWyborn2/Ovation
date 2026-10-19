import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetShirtNumberSettings } from "@workspace/api-client-react";
import type { ShirtNumberUploadCommitResult } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { LoadingState, QueryError } from "@/components/data-states";
import { useSearchParamState } from "@/lib/use-search-param";
import { invalidateTeamListCarouselSources } from "@/lib/team-list-carousel-cache";
import {
  REGISTER_LABEL,
  ShirtNumberUploadPanel,
  currentSeasonStartYear,
  invalidateRegisters,
  seasonLabel,
  seniorShirtNumberApiFor,
  type RegisterName,
} from "@/components/shirt-numbers";
import { juniorShirtNumberApi } from "@/components/shirt-numbers/junior-api";

const REGISTERS: readonly RegisterName[] = ["men", "female", "juniors"];
const isRegister = (v: string): v is RegisterName => (REGISTERS as readonly string[]).includes(v);

/**
 * Imports → Shirt numbers: upload the club's number spreadsheet into one register.
 * The register picker decides where it goes: Men or Female (the senior register's
 * categories, /api/shirt-numbers with `category`) or Juniors (/api/juniors only, the
 * juniors isolation rule). Preview, review and commit are the same panel the register
 * uses; nothing is written until the preview is applied.
 */
export function ShirtNumberImportPanel() {
  const queryClient = useQueryClient();
  const settings = useGetShirtNumberSettings();
  const [registerParam, setRegister] = useSearchParamState("register", "men");
  const register: RegisterName = isRegister(registerParam) ? registerParam : "men";
  const current = currentSeasonStartYear();
  const [season, setSeason] = useState(current);
  const [done, setDone] = useState<string | null>(null);
  const api = useMemo(
    () => (register === "juniors" ? juniorShirtNumberApi : seniorShirtNumberApiFor(register)),
    [register],
  );

  if (settings.isError) return <QueryError onRetry={() => settings.refetch()} />;
  if (settings.isLoading || !settings.data) return <LoadingState />;

  const registerLink = (
    <Link
      href={`/admin/people/shirt-numbers?section=${register}`}
      className="font-semibold text-primary-text underline"
    >
      People → Shirt numbers
    </Link>
  );
  if (!settings.data.enabled) {
    return (
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Shirt numbers are turned off for this club. Turn them on in {registerLink} first.
      </p>
    );
  }

  const onCommitted = (res: ShirtNumberUploadCommitResult) => {
    invalidateRegisters(queryClient, season);
    if (register !== "juniors") void invalidateTeamListCarouselSources(queryClient);
    setDone(
      `Applied to the ${REGISTER_LABEL[register]} register for ${seasonLabel(season)}: ` +
        `${res.created} added, ${res.updated} updated, ${res.linked} linked, ${res.held} held, ` +
        `${res.discarded} discarded.`,
    );
  };

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Upload the club's shirt-number spreadsheet (.csv or .xlsx) into one register. Check the
        preview, then apply it. The registers themselves are in {registerLink}.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="shirt-import-register">Register</Label>
          <select
            id="shirt-import-register"
            value={register}
            onChange={(e) => {
              setRegister(e.target.value);
              setDone(null);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            {REGISTERS.map((r) => (
              <option key={r} value={r}>
                {REGISTER_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="shirt-import-season">Season</Label>
          <select
            id="shirt-import-season"
            value={season}
            onChange={(e) => {
              setSeason(parseInt(e.target.value, 10));
              setDone(null);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          >
            {[current + 1, current, current - 1].map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
                {s === current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {done && (
        <p role="status" className="text-sm text-[var(--win-fg)]">
          {done}
        </p>
      )}
      <ShirtNumberUploadPanel
        key={`${register}-${season}`}
        api={api}
        season={season}
        onCommitted={onCommitted}
      />
    </div>
  );
}
