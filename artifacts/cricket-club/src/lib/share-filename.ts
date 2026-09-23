import { useBrand } from "@/lib/brand-context";

/** Lower-case, hyphenated file-name slug ("A Grade 1992" → "a-grade-1992"). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * The tenant's prefix for downloaded share images (e.g. "hhcc", "mandurah"),
 * from its short name or full name — never another club's literal.
 */
export function useShareFilePrefix(): string {
  const brand = useBrand();
  return slugify(brand.shortName?.trim() || brand.name) || "club";
}
