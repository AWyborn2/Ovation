import type { SVGProps } from "react";

/**
 * A baggy cricket cap in side profile, drawn to sit alongside the lucide icon
 * set (24px grid, 2px round strokes, currentColor). Lucide has no cricket cap;
 * this marks A Grade debuts (the cap) on the player timeline.
 */
export function CricketCap({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M6 15a7 7 0 0 1 14 0" />
      <path d="M6 15h14" />
      <path d="M6 15c-2 0-4 .7-4 1.6S3.5 18 8 18h5" />
    </svg>
  );
}
