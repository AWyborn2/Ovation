import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import {
  useGetAvailableClubs,
  usePlatformSignup,
  checkSlugAvailable,
  type AvailableClub,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Self-serve onboarding wizard (platform/apex host). Pick a central PCA club →
 * choose a subdomain (live availability) + first admin (email + password, no
 * verification in the pilot) → POST /platform/signup provisions the tenant and we
 * redirect to the new club's admin URL.
 */

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "bad"; reason: string };

function ClubPicker({ onPick }: { onPick: (c: AvailableClub) => void }) {
  const { data, isLoading, isError } = useGetAvailableClubs();
  const [q, setQ] = useState("");

  const clubs = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => c.name.toLowerCase().includes(needle)) : all;
  }, [data, q]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading clubs…
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        Signup isn't available right now. Please check back soon.
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search for your club…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <ul className="mt-4 max-h-96 divide-y overflow-y-auto rounded-md border">
        {clubs.map((c) => (
          <li key={c.centralClubId}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted"
            >
              <span className="font-medium">{c.name}</span>
              {c.shortName ? (
                <span className="text-sm text-muted-foreground">{c.shortName}</span>
              ) : null}
            </button>
          </li>
        ))}
        {clubs.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No clubs match “{q}”. Only Peel Cricket Association clubs are available
            during the pilot.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function DetailsForm({
  club,
  onBack,
}: {
  club: AvailableClub;
  onBack: () => void;
}) {
  const [slug, setSlug] = useState(club.suggestedSlug);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });
  const signup = usePlatformSignup();

  // Debounced live slug availability check.
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

  const canSubmit =
    slugState.status === "ok" &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    password.length >= 8 &&
    !signup.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    signup.mutate(
      {
        data: {
          centralClubId: club.centralClubId,
          slug: slug.trim().toLowerCase(),
          adminEmail: email.trim().toLowerCase(),
          password,
        },
      },
      {
        onSuccess: (res) => {
          window.location.href = res.redirectUrl;
        },
      },
    );
  }

  const baseDomain =
    typeof window !== "undefined"
      ? window.location.hostname.replace(/^www\./, "")
      : "ovation.app";

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Choose a different club
        </button>
        <h2 className="text-xl font-semibold">{club.name}</h2>
        <p className="text-sm text-muted-foreground">Set up your club's site.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Your address</Label>
        <div className="flex items-center gap-2">
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="max-w-[12rem]"
          />
          <span className="text-sm text-muted-foreground">.{baseDomain}</span>
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
        <Label htmlFor="email">Admin email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@club.org.au"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>

      {signup.isError ? (
        <p className="text-sm text-destructive">
          Couldn't complete signup. The address or club may already be taken.
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {signup.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating your site…
          </>
        ) : (
          "Create my club's site"
        )}
      </Button>
    </form>
  );
}

export default function SignupPage() {
  const [club, setClub] = useState<AvailableClub | null>(null);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-6 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Ovation
      </Link>
      <div className="mt-10">
        {club ? (
          <DetailsForm club={club} onBack={() => setClub(null)} />
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Find your club</h1>
            <p className="mt-2 text-muted-foreground">
              Pick your club and we'll populate its full history instantly.
            </p>
            <div className="mt-6">
              <ClubPicker onPick={setClub} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
