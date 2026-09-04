import { useMemo, useState } from "react";
import { Check, Copy, Link2, Loader2, Trash2, Tv } from "lucide-react";
import {
  useGenerateKioskToken,
  useRevokeKioskToken,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";

/**
 * Generate / copy / revoke the private short link the clubroom TV opens.
 * Mutations invalidate the bundle via `onChanged` so the page re-reads the token.
 */
export function KioskLinkCard({
  token,
  onChanged,
}: {
  token: string | null;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customCode, setCustomCode] = useState("");

  const kioskUrl = useMemo(() => {
    if (!token) return null;
    const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(
      /\/+$/,
      "/",
    );
    return `${base}tv/${encodeURIComponent(token)}`;
  }, [token]);

  const generate = useGenerateKioskToken({
    mutation: {
      onSuccess: () => {
        setError(null);
        setCopied(false);
        setCustomCode("");
        onChanged();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  // Random code (no body) vs admin-chosen custom code.
  const generateRandom = () => generate.mutate({ data: {} });
  const setCustom = () => {
    const code = customCode.trim();
    if (!code) return;
    generate.mutate({ data: { token: code } });
  };
  const revoke = useRevokeKioskToken({
    mutation: {
      onSuccess: () => {
        setError(null);
        setCopied(false);
        onChanged();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const busy = generate.isPending || revoke.isPending;

  const copy = async () => {
    if (!kioskUrl) return;
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5" /> Clubroom TV link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Generate a private <strong>short link</strong> that loads <em>only</em>{" "}
          the rotating kiosk — no admin sign-in needed. It's a brief{" "}
          <code>/tv/&lt;code&gt;</code> address that's easy to type straight into a
          wall-mounted TV or Raspberry Pi browser (it auto-runs the rotation). The
          link doesn't expose any other admin page. Revoke it any time to stop a
          lost or shared link working.
        </p>

        {token && kioskUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={kioskUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                data-testid="input-kiosk-url"
              />
              <Button
                type="button"
                variant="outline"
                onClick={copy}
                data-testid="button-copy-kiosk-url"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={generateRandom}
                data-testid="button-regenerate-kiosk-token"
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Regenerate link
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => revoke.mutate()}
                data-testid="button-revoke-kiosk-token"
              >
                {revoke.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Revoke link
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Set a custom code
                </span>
                <Input
                  value={customCode}
                  placeholder="e.g. clubroom-tv"
                  className="font-mono text-xs w-56"
                  onChange={(e) => setCustomCode(e.target.value)}
                  data-testid="input-custom-kiosk-token"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !customCode.trim()}
                onClick={setCustom}
                data-testid="button-set-kiosk-token"
              >
                <Check className="h-4 w-4 mr-2" /> Use this code
              </Button>
              <span className="text-[11px] text-muted-foreground">
                3–40 letters, numbers or hyphens.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Regenerating, setting a new code, or revoking immediately stops the
              current link from working — re-open the kiosk on the TV afterwards.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={generateRandom}
              data-testid="button-generate-kiosk-token"
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Generate kiosk link
            </Button>
            <span className="text-xs text-muted-foreground">or</span>
            <Input
              value={customCode}
              placeholder="custom code e.g. clubroom-tv"
              className="font-mono text-xs w-56"
              onChange={(e) => setCustomCode(e.target.value)}
              data-testid="input-custom-kiosk-token"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || !customCode.trim()}
              onClick={setCustom}
              data-testid="button-set-kiosk-token"
            >
              <Check className="h-4 w-4 mr-2" /> Use code
            </Button>
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
