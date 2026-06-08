import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListCaps } from "@workspace/api-client-react";
import type { CapCategory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";

const CATEGORY_LABEL: Record<CapCategory, string> = {
  male: "A Grade Male",
  female: "A Grade Female",
};

export function CapRegisterTab() {
  const { data: caps, isLoading } = useListCaps();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CapCategory>("male");

  const inCategory = useMemo(
    () => (caps ?? []).filter((c) => (c.category ?? "male") === category),
    [caps, category],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || String(c.capNumber) === q,
    );
  }, [inCategory, search]);

  const deceased = inCategory.filter((c) => c.deceased).length;
  const categoryLabel = CATEGORY_LABEL[category];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-md p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">
            A Grade Caps
          </h2>
          <div className="flex items-center gap-2">
            <label
              htmlFor="cap-category"
              className="text-xs font-bold uppercase tracking-widest text-primary"
            >
              List
            </label>
            <select
              id="cap-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CapCategory)}
              className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
            >
              <option value="male">A Grade Male</option>
              <option value="female">A Grade Female</option>
            </select>
          </div>
        </div>
        <div className="w-20 h-[3px] bg-primary mt-3" />
        <p className="text-muted-foreground italic mt-3 mb-0">
          Every player to wear the {categoryLabel} cap for Halls Head Cricket
          Club, in chronological order of debut. {inCategory.length}{" "}
          caps issued, {deceased} since deceased.
        </p>
      </div>

      <div className="bg-card border-2 border-primary/40 rounded-md p-5 md:p-6 shadow-md">
        <h3 className="text-lg font-serif font-bold text-primary uppercase tracking-wider m-0">
          About this register
        </h3>
        <div className="w-12 h-[2px] bg-primary mt-2 mb-3" />
        <p className="text-sm text-foreground/90 leading-relaxed m-0">
          Cap numbers are assigned in chronological order of A Grade debut for
          Halls Head Cricket Club. Prior to the adoption of the digital scoring
          platforms <strong>MyCricket</strong> and <strong>PlayHQ</strong>, the
          club only retained statistics for players who had played 10 or more
          games. As a result, many of the players in this register —
          particularly those from the foundational era — have no statistical
          record despite having earned their A Grade cap. Their place in club
          history is honoured here regardless.
        </p>
      </div>

      <div className="bg-card border border-border rounded-md p-4 shadow-md flex flex-wrap gap-3 items-center text-xs">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-600/40 text-amber-700 dark:text-amber-300 font-bold">
          <span>✝</span> deceased
        </span>
      </div>

      <Input
        placeholder="Search by name or cap number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-base"
      />

      {isLoading ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading cap register…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
          {search.trim()
            ? `No caps matched "${search}".`
            : `No ${categoryLabel} caps have been recorded yet.`}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/25">
                  <th className="text-center font-serif uppercase tracking-wider text-primary p-3 text-xs w-16">
                    Cap #
                  </th>
                  <th className="text-left font-serif uppercase tracking-wider text-primary p-3 text-xs">
                    Player
                  </th>
                  <th className="text-right font-serif uppercase tracking-wider text-primary p-3 text-xs">
                    A Grade Games
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.capNumber}
                    className={`border-t border-border/50 ${i % 2 ? "bg-black/10" : ""} hover:bg-primary/10 transition-colors`}
                  >
                    <td className="p-3 text-center font-mono text-primary font-bold">
                      {c.capNumber}
                    </td>
                    <td className="p-3">
                      {c.playerId !== null && c.playerId !== undefined ? (
                        <Link
                          href={`/players/${c.playerId}`}
                          className="uppercase font-semibold text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                      ) : (
                        <span className="uppercase font-semibold text-primary">
                          {c.name}
                        </span>
                      )}
                      {c.deceased && (
                        <span
                          className="ml-2 text-amber-600 dark:text-amber-400 font-bold"
                          title="Deceased"
                          aria-label="Deceased"
                        >
                          ✝
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {c.inStats && c.gamesAGrade > 0 ? (
                        c.gamesAGrade
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
