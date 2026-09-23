import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/**
 * Broadcast chrome for the apex (platform) pages — landing, directory, signup.
 * Standalone (no club Layout) so it never picks up a tenant's colours: the
 * tokens here come from the platform brand only.
 */
export function PlatformHeader({ showDirectory = true }: { showDirectory?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--glass)] backdrop-blur-[20px] backdrop-saturate-150">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-3 px-[var(--pad)]">
        <Link
          href="/"
          className="font-serif text-2xl font-bold uppercase leading-none tracking-wide"
          data-testid="platform-wordmark"
        >
          Ovation
        </Link>
        <nav aria-label="Ovation" className="flex items-center gap-1 sm:gap-2">
          {showDirectory && (
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/directory">Browse clubs</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href="/platform-admin">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function PlatformFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-[1280px] px-[var(--pad)] py-8 text-sm text-muted-foreground">
        © {new Date().getFullYear()} Ovation. A white-label cricket stats platform.
      </div>
    </footer>
  );
}

/** Centred section heading used down the landing and directory pages. */
export function PlatformSectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-text">
          {eyebrow}
        </div>
      )}
      <h2 className="mt-2 text-[clamp(28px,3.2vw,40px)] leading-none">{title}</h2>
      {children && <p className="mt-3 text-muted-foreground">{children}</p>}
    </div>
  );
}
