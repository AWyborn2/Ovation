import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminAvailableClubs,
  useProvisionTenantAsAdmin,
  checkSlugAvailable,
  getListAllTenantsQueryKey,
  type AvailableClub,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClubPicker } from "@/components/club-picker";

/**
 * Concierge provisioning (platform-admin). Mirrors the self-serve signup wizard
 * but is initiated by a platform admin: the first club admin (email + password) is
 * optional, and on success we land on the new tenant's detail page.
 */

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "bad"; reason: string };

function ConciergeClubPicker({ onPick }: { onPick: (c: AvailableClub) => void }) {
  const { data, isLoading, isError } = useGetAdminAvailableClubs();
  return <ClubPicker clubs={data} isLoading={isLoading} isError={isError} onPick={onPick} />;
}

function DetailsForm({ club, onBack }: { club: AvailableClub; onBack: () => void }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [slug, setSlug] = useState(club.suggestedSlug);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const provision = useProvisionTenantAsAdmin();

  useEffect(() => {
    const s = slug.trim().toLowerCase();
    if (!s) {
      setSlugState({ status: "idle" });
      return;
    }
    setSlugState({ status: "checking" });
    const t = setTimeout(() => {
      checkSlugAvailable({ slug: s })
        .then((r) =>
          setSlugState(
            r.available
              ? { status: "ok" }
              : { status: "bad", reason: r.reason ?? "Unavailable" },
          ),
        )
        .catch(() => setSlugState({ status: "idle" }));
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  // Admin is optional; if an email is given, require a valid one + 8-char password.
  const emailOk = email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const adminOk = email.trim() === "" || (emailOk && password.length >= 8);
  const canSubmit = slugState.status === "ok" && adminOk && !provision.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const hasAdmin = email.trim() !== "";
    provision.mutate(
      {
        data: {
          centralClubId: club.centralClubId,
          slug: slug.trim().toLowerCase(),
          ...(hasAdmin
            ? { adminEmail: email.trim().toLowerCase(), password }
            : {}),
        },
      },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getListAllTenantsQueryKey() });
          navigate(`/platform-admin/tenants/${res.id}`);
        },
        onError: (err) => {
          const status = (err as { status?: number })?.status;
          setError(
            status === 409
              ? "That address or club is already taken."
              : "Couldn't provision the club.",
          );
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Choose a different club
        </button>
        <h2 className="text-xl font-semibold">{club.name}</h2>
        <p className="text-sm text-muted-foreground">
          Provision this club as a tenant. The first admin is optional.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Subdomain</Label>
        <div className="flex items-center gap-2">
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="max-w-[12rem]"
          />
          {slugState.status === "checking" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : slugState.status === "ok" ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : null}
        </div>
        {slugState.status === "bad" ? (
          <p className="text-sm text-destructive">{slugState.reason}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">First admin email (optional)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@club.org.au"
        />
        {!emailOk ? (
          <p className="text-sm text-destructive">Enter a valid email or leave blank.</p>
        ) : null}
      </div>

      {email.trim() !== "" ? (
        <div className="space-y-2">
          <Label htmlFor="password">Admin password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={!canSubmit}>
        {provision.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Provisioning…
          </>
        ) : (
          "Provision club"
        )}
      </Button>
    </form>
  );
}

export default function ProvisionTenant() {
  const [club, setClub] = useState<AvailableClub | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Provision a club</h1>
      <p className="text-sm text-muted-foreground">
        Concierge onboarding from the central PCA register.
      </p>
      <p className="mb-6 text-sm text-muted-foreground">
        Folded or merged clubs aren't available to provision — their history
        stays in the platform, view-only.
      </p>
      {club ? (
        <DetailsForm club={club} onBack={() => setClub(null)} />
      ) : (
        <ConciergeClubPicker onPick={setClub} />
      )}
    </div>
  );
}
