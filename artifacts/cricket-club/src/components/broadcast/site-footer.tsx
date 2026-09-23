import { Link, useLocation } from "wouter";
import { useGetTourContent } from "@workspace/api-client-react";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { useBrandLogo } from "@/lib/use-brand";
import { useBrand } from "@/lib/brand-context";
import { launchAdminTour, launchFanTour } from "@/lib/tour";
import type { GroupedNav } from "@/lib/nav-groups";

/**
 * Launch the guided tour: the admin walkthrough for a signed-in admin on an
 * admin page, otherwise the public fan tour (the old header Help behaviour).
 */
export function useLaunchTour(): () => void {
  const [location, navigate] = useLocation();
  const me = useCurrentAdmin();
  const tourContentQ = useGetTourContent();
  const onAdmin = location === "/admin" || location.startsWith("/admin/");
  return () => {
    if (onAdmin && me.data) launchAdminTour(tourContentQ.data);
    else launchFanTour(navigate, location, tourContentQ.data);
  };
}

/** Broadcast footer: club identity, one column per nav group, bottom bar. */
export function SiteFooter({ nav }: { nav: GroupedNav }) {
  const brand = useBrand();
  const logo = useBrandLogo();
  const me = useCurrentAdmin();
  const launchTour = useLaunchTour();

  return (
    <footer className="mt-auto border-t bg-card" data-testid="site-footer">
      <div className="mx-auto grid max-w-[1280px] gap-7 px-[var(--pad)] py-[clamp(28px,4vw,48px)] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div>
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-11 w-auto" />
            <div className="font-serif text-base font-bold uppercase leading-tight">
              {brand.name}
            </div>
          </div>
          {brand.tagline && (
            <p className="mt-3 text-[13px] text-muted-foreground">{brand.tagline}</p>
          )}
        </div>
        {nav.groups.map((g) => (
          <div key={g.key}>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {g.label}
            </div>
            <ul className="space-y-2">
              {g.items.map((item) => (
                <li key={`${item.target}-${item.label}`}>
                  {item.isExternal ? (
                    <a
                      href={item.target}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm transition-colors hover:text-primary-text"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      href={item.target}
                      className="text-sm transition-colors hover:text-primary-text"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-[var(--pad)] py-4 text-[13px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
            <span aria-hidden>·</span>
            <Link href="/admin" className="transition-colors hover:text-foreground">
              {me.data ? "Admin" : "Admin login"}
            </Link>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={launchTour}
              className="transition-colors hover:text-foreground"
              data-tour="help-button"
            >
              Take the tour
            </button>
          </div>
          <span>Powered by Ovation</span>
        </div>
      </div>
    </footer>
  );
}
