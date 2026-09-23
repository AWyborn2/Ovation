import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HeroVariant = "home" | "juniors" | "honours";

/** Solid base behind each hero variant (the photo fades into it). */
const BASE: Record<HeroVariant, string> = {
  home: "#0B1014",
  juniors: "var(--juniors-accent)",
  honours: "#0B1014",
};

/** Overlay gradients from the Broadcast handoff. */
const OVERLAY: Record<HeroVariant, string> = {
  home: "linear-gradient(0deg, rgba(8,12,16,.92) 0%, transparent 45%), linear-gradient(90deg, #0B1014 0%, #0B1014 30%, rgba(11,16,20,.55) 48%, rgba(11,16,20,0) 70%)",
  juniors:
    "linear-gradient(0deg, color-mix(in srgb, var(--juniors-accent) 90%, transparent) 0%, transparent 40%), linear-gradient(90deg, var(--juniors-accent) 0%, var(--juniors-accent) 30%, color-mix(in srgb, var(--juniors-accent) 60%, transparent) 50%, transparent 72%)",
  honours: "linear-gradient(0deg, rgba(0,0,0,.92), rgba(0,0,0,.45) 60%, rgba(0,0,0,.25))",
};

/** No-photo fallback: a brand-tinted gradient, never another club's photo. */
const FALLBACK: Record<HeroVariant, string> = {
  home: "radial-gradient(ellipse at 80% 20%, hsl(var(--primary) / .28), transparent 60%), linear-gradient(135deg, #0B1014, hsl(var(--primary) / .12))",
  juniors:
    "radial-gradient(ellipse at 80% 20%, hsl(var(--primary) / .25), transparent 60%), var(--juniors-accent)",
  honours:
    "radial-gradient(ellipse at 70% 10%, hsl(var(--primary) / .22), transparent 60%), linear-gradient(180deg, #131A20, #0B1014)",
};

/**
 * Full-bleed photography hero. The photo sits right (70% wide on desktop, full
 * width on mobile) and fades into the variant's base colour; content is
 * bottom-aligned. With no `image`, a brand gradient renders instead.
 */
export function PageHero({
  variant,
  image,
  imagePosition = "52% 35%",
  fullWidthImage,
  className,
  contentClassName,
  children,
}: {
  variant: HeroVariant;
  image?: string | null;
  imagePosition?: string;
  /** Honours hero: photo spans the whole width behind the overlay. */
  fullWidthImage?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = { background: image ? BASE[variant] : FALLBACK[variant] };
  return (
    <section
      className={cn("relative isolate flex overflow-hidden text-white", className)}
      style={style}
      data-testid={`hero-${variant}`}
    >
      {image && (
        <>
          <img
            src={image}
            alt=""
            fetchPriority="high"
            decoding="async"
            className={cn(
              "absolute inset-y-0 right-0 -z-10 h-full w-full object-cover",
              !fullWidthImage && "nav:w-[70%]",
            )}
            style={{ objectPosition: imagePosition }}
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: OVERLAY[variant] }}
          />
        </>
      )}
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1280px] flex-col justify-end px-[var(--pad)] pb-7 pt-[clamp(40px,6vw,72px)]",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
