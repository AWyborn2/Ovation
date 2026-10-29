import { Link } from "wouter";
import AdminSocialSettings from "@/pages/admin-social-settings";

/**
 * The pages that left New Studio's menu (studio-create-consolidation). They
 * are unchanged and still live at their own URLs; Settings links to them
 * until it is regrouped into cards (P1).
 */
export const SETTINGS_LINKS = [
  { href: "/admin/social/plan", label: "Posting plan" },
  { href: "/admin/social/cards", label: "Cards" },
  { href: "/admin/social/email-lists", label: "Email lists" },
  { href: "/admin/social/fixtures", label: "Fixtures" },
];

/** New Studio → Settings: links to the moved pages, then today's Settings page. */
export default function AdminSocialSettingsHub() {
  return (
    <div className="space-y-6">
      <nav aria-label="More settings" className="flex flex-wrap gap-2">
        {SETTINGS_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="bc-lift inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
          >
            {label}
          </Link>
        ))}
      </nav>
      <AdminSocialSettings />
    </div>
  );
}
