import { useState, type ReactNode } from "react";
import { useBrandLogo } from "@/lib/use-brand";
import { useBrand } from "@/lib/brand-context";
import { PlaqueLightbox } from "@/components/plaque-lightbox";
import { CardGridSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { PLAQUE_FONT } from "./plaque";

/**
 * The full-bleed premiership "wall": club header, one filter select, the plaque
 * grid and the enlarge lightbox. Generic over the record type so the senior
 * and junior boards share the shell while keeping their own data hooks — the
 * juniors page still reads only `/api/juniors/*` (plan.md §5.6).
 */
export function PremiershipBoard<T extends { id: number }>({
  heading,
  eyebrow,
  filter,
  total,
  items,
  isLoading,
  isError,
  onRetry,
  empty,
  renderPlaque,
  plaqueLabel,
  focusRingClass,
  lightboxTheme,
  exportFileName,
}: {
  /** Sub-heading under the club name, e.g. "PREMIERSHIPS". */
  heading: string;
  /** Optional line above the club name (the juniors board shows "Juniors"). */
  eyebrow?: ReactNode;
  filter: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    testId?: string;
  };
  /** Unfiltered count for the "n of total shown" line. */
  total: number;
  items: T[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  empty: { title: string; message: string };
  renderPlaque: (item: T) => ReactNode;
  plaqueLabel: (item: T) => string;
  focusRingClass: string;
  lightboxTheme?: "default" | "gold";
  exportFileName: (item: T) => string;
}) {
  const logoUrl = useBrandLogo();
  const brand = useBrand();
  const [enlargedIndex, setEnlargedIndex] = useState<number | null>(null);

  return (
    <div
      className="mx-[calc(50%-50vw)] w-screen min-h-screen overflow-x-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #3a4654 0%, #2a3540 60%, #1f2832 100%)",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <img loading="lazy" decoding="async" src={logoUrl} alt={brand.name} className="h-14 md:h-20 w-auto drop-shadow" />
          <div className="text-center text-white">
            {eyebrow}
            <h1
              className="m-0 font-bold tracking-[0.08em] leading-tight text-xl md:text-3xl lg:text-4xl"
              style={{ fontFamily: PLAQUE_FONT }}
            >
              {brand.name.toUpperCase()}
            </h1>
            <div
              className="mt-1 font-semibold tracking-[0.25em] text-sm md:text-base lg:text-lg text-white/90"
              style={{ fontFamily: PLAQUE_FONT }}
            >
              {heading}
            </div>
          </div>
          <img loading="lazy" decoding="async" src={logoUrl} alt={brand.name} className="h-14 md:h-20 w-auto drop-shadow" />
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4 text-white/90">
          <span className="text-xs font-bold uppercase tracking-widest">{filter.label}</span>
          <select
            value={filter.value}
            onChange={(e) => {
              filter.onChange(e.target.value);
              setEnlargedIndex(null);
            }}
            className="px-3 py-1.5 rounded border border-white/30 bg-black/30 text-white text-sm font-medium"
            data-testid={filter.testId}
          >
            {filter.options.map((g) => (
              <option key={g} value={g} className="text-black">{g}</option>
            ))}
          </select>
          <span className="text-xs italic ml-auto text-white/70">
            {items.length} of {total} shown
          </span>
        </div>

        {isError ? (
          <QueryError onRetry={onRetry} />
        ) : isLoading ? (
          <CardGridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title={empty.title} message={empty.message} />
        ) : (
          <div
            className="grid gap-[3px] justify-center"
            style={{ gridTemplateColumns: "repeat(auto-fill, 151px)" }}
          >
            {items.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEnlargedIndex(i)}
                aria-label={plaqueLabel(p)}
                className={`block p-0 m-0 bg-transparent border-0 cursor-pointer focus:outline-none focus-visible:ring-2 ${focusRingClass}`}
                data-testid={`button-plaque-${p.id}`}
              >
                <div className="pointer-events-none">{renderPlaque(p)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {enlargedIndex !== null && (
        <PlaqueLightbox
          theme={lightboxTheme}
          items={items}
          index={enlargedIndex}
          onIndexChange={setEnlargedIndex}
          onClose={() => setEnlargedIndex(null)}
          renderItem={renderPlaque}
          exportFileName={exportFileName}
        />
      )}
    </div>
  );
}
