import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import {
  getGetAvailabilityResponseQueryKey,
  useAddAvailabilityAway,
  useGetAvailabilityResponse,
  useRemoveAvailabilityAway,
  useSaveAvailabilityAnswers,
  useUpdateAvailabilityContact,
  useWithdrawAvailability,
  type AvailabilityDateAnswer,
  type AvailabilityMatch,
  type AvailabilityResponsePage,
  type AvailabilityStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PERTH = "Australia/Perth";

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string; pressed: string }[] = [
  { value: "yes", label: "Yes", pressed: "bg-[var(--win-fg)] border-[var(--win-fg)] text-white" },
  { value: "no", label: "No", pressed: "bg-[var(--loss-fg)] border-[var(--loss-fg)] text-white" },
  { value: "maybe", label: "Maybe", pressed: "bg-amber-500 border-amber-500 text-white" },
];

const ROLE_LABELS: Record<string, string> = {
  C: "Captain",
  WK: "Wicketkeeper",
  "C/WK": "Captain and wicketkeeper",
};

// Server error codes (U5) → what the player is told.
const ERROR_TEXT: Record<string, string> = {
  selection_final: 'Your side for this day is final. Use "Can\'t make it" below instead.',
  date_not_asked: "This day isn't one you're being asked about.",
  invalid_range: "The last day must be on or after the first day.",
  in_the_past: "Away dates can't be in the past.",
  too_long: "An away period can be at most 120 days.",
  too_many: "You've added as many away periods as allowed. Remove one first.",
  invalid_mobile: "Enter an Australian mobile number, like 0412 345 678.",
  invalid_email: "Enter a valid email address.",
  not_selected: "You're no longer in a side this round.",
};

function errorText(e: unknown, fallback: string): string {
  const data = (e as { data?: unknown })?.data;
  const code = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
  if ((e as { status?: number })?.status === 429) return "Too many tries. Wait a minute and retry.";
  return (typeof code === "string" && ERROR_TEXT[code]) || fallback;
}

/** "Saturday 11 October" for a Perth YYYY-MM-DD date. */
function formatDay(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-AU", {
    timeZone: PERTH,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDay(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-AU", {
    timeZone: PERTH,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatStart(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: PERTH,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Only a plain hex colour from the tenant row is used as an accent. */
function safeColour(c: string | null | undefined): string | null {
  return c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
}

const MOBILE_RE = /^(\+?61|0)4\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every endpoint answers with the full page, so the cache is replaced from it. */
function usePageWriter(token: string) {
  const queryClient = useQueryClient();
  return (page: AvailabilityResponsePage) =>
    queryClient.setQueryData(getGetAvailabilityResponseQueryKey(token), page);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground">
      <h2 className="mb-3 text-lg font-semibold leading-tight">{title}</h2>
      {children}
    </section>
  );
}

function DateRow({
  token,
  day,
  onPage,
}: {
  token: string;
  day: AvailabilityDateAnswer;
  onPage: (p: AvailabilityResponsePage) => void;
}) {
  const [note, setNote] = useState(day.note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = `note-${day.date}`;

  useEffect(() => setNote(day.note ?? ""), [day.note]);

  const save = useSaveAvailabilityAnswers({
    mutation: {
      onSuccess: (page) => {
        onPage(page);
        setError(null);
        setSaved(true);
      },
      onError: (e) => {
        setSaved(false);
        setError(errorText(e, "Couldn't save your answer. Please try again."));
      },
    },
  });

  function send(status: AvailabilityStatus) {
    setSaved(false);
    const trimmed = note.trim();
    save.mutate({
      token,
      data: { answers: [{ date: day.date, status, note: trimmed === "" ? null : trimmed }] },
    });
  }

  function onNoteBlur() {
    if (!day.status || note.trim() === (day.note ?? "").trim()) return;
    send(day.status);
  }

  return (
    <li className="border-t pt-4 first:border-t-0 first:pt-0" data-testid="date-row">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{formatDay(day.date)}</h3>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {save.isPending ? (
            <Loader2 className="inline h-4 w-4 animate-spin" aria-label="Saving" />
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-[var(--win-fg)]">
              <Check className="h-4 w-4" aria-hidden /> Saved
            </span>
          ) : null}
        </span>
      </div>
      {day.locked ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You've been picked for this day, so your answer is locked.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={formatDay(day.date)}>
        {STATUS_OPTIONS.map((opt) => {
          const pressed = day.status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={pressed}
              disabled={day.locked || save.isPending}
              onClick={() => send(opt.value)}
              className={cn(
                "min-h-12 rounded-md border text-base font-semibold transition-colors disabled:opacity-60",
                pressed ? opt.pressed : "bg-background hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!day.locked ? (
        <div className="mt-3 space-y-1">
          <Label htmlFor={noteId} className="text-sm text-muted-foreground">
            Note for the captain (optional)
          </Label>
          <Input
            id={noteId}
            value={note}
            maxLength={280}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            onBlur={onNoteBlur}
            placeholder={day.status ? "e.g. can only bat" : "Pick Yes, No or Maybe first"}
            className="min-h-11"
          />
        </div>
      ) : null}
      {day.late && day.status && !day.locked ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Answered after cut-off — it still reaches the captain.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function MatchDetails({
  token,
  match,
  canWithdraw,
  onPage,
}: {
  token: string;
  match: AvailabilityMatch;
  canWithdraw: boolean;
  onPage: (p: AvailabilityResponsePage) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = useWithdrawAvailability({
    mutation: {
      onSuccess: (page) => {
        setConfirming(false);
        setError(null);
        onPage(page);
      },
      onError: (e) => setError(errorText(e, "Couldn't send that. Please try again.")),
    },
  });

  return (
    <Section title="You've been picked">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Grade</dt>
        <dd className="font-medium">{match.grade}</dd>
        <dt className="text-muted-foreground">Opponent</dt>
        <dd className="font-medium">
          {match.opponent}{" "}
          <span className="text-muted-foreground">({match.isHome ? "home" : "away"})</span>
        </dd>
        {match.venue ? (
          <>
            <dt className="text-muted-foreground">Venue</dt>
            <dd className="font-medium">{match.venue}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Start</dt>
        <dd className="font-medium">{formatStart(match.startAt)}</dd>
        {match.role ? (
          <>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">{ROLE_LABELS[match.role] ?? match.role}</dd>
          </>
        ) : null}
      </dl>
      {canWithdraw ? (
        <div className="mt-4">
          {confirming ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-3">
              <p className="text-sm">
                Your captain will be told and your spot will go to someone else. Are you sure?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="destructive"
                  className="min-h-11"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutate({ token })}
                >
                  {withdraw.isPending ? "Sending…" : "Yes, I can't make it"}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={withdraw.isPending}
                  onClick={() => setConfirming(false)}
                >
                  Keep my spot
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setConfirming(true)}
            >
              Can't make it
            </Button>
          )}
          {error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function AwayDates({
  token,
  page,
  onPage,
}: {
  token: string;
  page: AvailabilityResponsePage;
  onPage: (p: AvailabilityResponsePage) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = useAddAvailabilityAway({
    mutation: {
      onSuccess: (p) => {
        onPage(p);
        setFrom("");
        setTo("");
        setError(null);
      },
      onError: (e) => setError(errorText(e, "Couldn't add those dates. Please try again.")),
    },
  });
  const remove = useRemoveAvailabilityAway({
    mutation: {
      onSuccess: (p) => {
        onPage(p);
        setError(null);
      },
      onError: (e) => setError(errorText(e, "Couldn't remove those dates. Please try again.")),
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setError("Pick the first and last day you'll be away.");
      return;
    }
    if (to < from) {
      setError(ERROR_TEXT.invalid_range);
      return;
    }
    setError(null);
    add.mutate({ token, data: { fromDate: from, toDate: to } });
  }

  return (
    <Section title="Away dates">
      <p className="mb-3 text-sm text-muted-foreground">
        Going away? Add the dates and you won't be asked about those weekends.
      </p>
      {page.away.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {page.away.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <span className="text-sm font-medium">
                {a.fromDate === a.toDate
                  ? formatShortDay(a.fromDate)
                  : `${formatShortDay(a.fromDate)} – ${formatShortDay(a.toDate)}`}
              </span>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ token, awayId: a.id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="away-from">First day</Label>
            <Input
              id="away-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="away-to">Last day</Label>
            <Input
              id="away-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-11"
            />
          </div>
        </div>
        <Button
          type="submit"
          variant="outline"
          className="min-h-11 w-full"
          disabled={add.isPending}
        >
          {add.isPending ? "Adding…" : "Add away dates"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Section>
  );
}

function ContactDetails({
  token,
  page,
  onPage,
}: {
  token: string;
  page: AvailabilityResponsePage;
  onPage: (p: AvailabilityResponsePage) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useUpdateAvailabilityContact({
    mutation: {
      onSuccess: (p) => {
        onPage(p);
        setEditing(false);
        setMobile("");
        setEmail("");
        setError(null);
        setSaved(true);
      },
      onError: (e) => setError(errorText(e, "Couldn't update your details. Please try again.")),
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const m = mobile.replace(/[\s()-]/g, "");
    const em = email.trim();
    if (!m && !em) {
      setError("Enter a new mobile or email.");
      return;
    }
    if (m && !MOBILE_RE.test(m)) {
      setError(ERROR_TEXT.invalid_mobile);
      return;
    }
    if (em && !EMAIL_RE.test(em)) {
      setError(ERROR_TEXT.invalid_email);
      return;
    }
    setError(null);
    update.mutate({
      token,
      data: { ...(m ? { mobile: m } : {}), ...(em ? { email: em } : {}) },
    });
  }

  return (
    <Section title="Your contact details">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Mobile</dt>
        <dd className="font-medium">{page.contact.mobile ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium break-all">{page.contact.email ?? "Not set"}</dd>
      </dl>
      {saved && !editing ? (
        <p className="mt-2 text-sm text-[var(--win-fg)]">Your details are updated.</p>
      ) : null}
      {editing ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <p className="text-sm text-muted-foreground">
            Only the club's admins see these. If you change them, we'll let your old number and
            email know about the change.
          </p>
          <div className="space-y-1">
            <Label htmlFor="contact-mobile">New mobile</Label>
            <Input
              id="contact-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Leave blank to keep"
              className="min-h-11"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-email">New email</Label>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Leave blank to keep"
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-11" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save details"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <Button
          variant="outline"
          className="mt-4 min-h-11 w-full"
          onClick={() => {
            setEditing(true);
            setSaved(false);
          }}
        >
          Edit details
        </Button>
      )}
    </Section>
  );
}

function Shell({ page, children }: { page?: AvailabilityResponsePage; children: React.ReactNode }) {
  const accent = safeColour(page?.primaryColour);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className={cn("px-4 py-4", accent ? "text-white" : "border-b bg-card")}
        style={accent ? { backgroundColor: accent } : undefined}
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          {page?.logoUrl ? (
            <img
              src={page.logoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5"
            />
          ) : null}
          <span className="text-base font-semibold leading-tight">
            {page ? (page.clubShortName ?? page.clubName) : "Availability"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

/**
 * Public page a player or guardian opens from their availability message
 * (`/availability/:token`). No login: the token in the path is the credential,
 * scoped to one recipient of one member for one round (KTD5). Every write
 * returns the whole page, which replaces the cached copy.
 */
export default function AvailabilityRespond() {
  const { token = "" } = useParams<{ token?: string }>();
  const writePage = usePageWriter(token);
  const query = useGetAvailabilityResponse(token, {
    query: {
      queryKey: getGetAvailabilityResponseQueryKey(token),
      enabled: token.length > 0,
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  if (!token || (query.isError && (query.error as { status?: number })?.status === 404)) {
    return (
      <Shell>
        <Section title="Link not valid">
          <p className="text-sm text-muted-foreground">
            This link has expired or isn't valid. Contact your club for a new one.
          </p>
        </Section>
      </Shell>
    );
  }

  if (query.isError) {
    return (
      <Shell>
        <Section title="Something went wrong">
          <p className="text-sm text-muted-foreground">
            {errorText(query.error, "We couldn't load your page. Please try again shortly.")}
          </p>
        </Section>
      </Shell>
    );
  }

  const page = query.data;
  if (!page) {
    return (
      <Shell>
        <div className="flex items-center py-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </Shell>
    );
  }

  const name = page.firstName;
  return (
    <Shell page={page}>
      <div>
        <h1 className="text-2xl font-semibold leading-tight">
          {page.self ? `Hi ${name}` : `Is ${name} available?`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {page.self
            ? "Tap Yes, No or Maybe for each day so your captain can pick the side."
            : `Tap Yes, No or Maybe for each day so ${name}'s captain can pick the side.`}
        </p>
      </div>

      {page.withdrawn ? (
        <Section title="You can't make it">
          <p className="text-sm">
            Thanks for letting us know. Your captain has been told and will find a replacement.
          </p>
        </Section>
      ) : null}

      {page.selection ? (
        <MatchDetails
          token={token}
          match={page.selection}
          canWithdraw={page.canWithdraw}
          onPage={writePage}
        />
      ) : null}

      {page.late && !page.locked ? (
        <p className="rounded-md border bg-muted/50 p-3 text-sm">
          Teams are being picked — your answer still reaches the captain.
        </p>
      ) : null}

      {page.dates.length > 0 ? (
        <Section title="This weekend">
          <ul className="space-y-4">
            {page.dates.map((d) => (
              <DateRow key={d.date} token={token} day={d} onPage={writePage} />
            ))}
          </ul>
        </Section>
      ) : (
        <Section title="This weekend">
          <p className="text-sm text-muted-foreground">There's nothing to answer this weekend.</p>
        </Section>
      )}

      <AwayDates token={token} page={page} onPage={writePage} />
      <ContactDetails token={token} page={page} onPage={writePage} />
    </Shell>
  );
}
