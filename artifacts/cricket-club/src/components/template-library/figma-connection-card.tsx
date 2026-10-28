import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFigmaConnectionQueryKey,
  useDisconnectFigma,
  useGetFigmaConnection,
  useSaveFigmaToken,
  useStartFigmaOAuth,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsCard, SettingsRow, StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { figmaImportError } from "./figma-report";

/**
 * The club's own Figma connection (template library release 2, R2-E): Sign
 * in with Figma when the server has a Figma app, or a pasted personal access
 * token. Sign-in comes back here with `?figma=connected` or
 * `?figma_error=<reason>`. The token is sent once and never shown again.
 */

const ERRORS: Record<string, string> = {
  expired: "That Figma sign-in took too long or was already used. Start again.",
  cancelled: "Signing in was cancelled on Figma.",
  not_allowed: "Your admin access changed while signing in. Sign in and try again.",
  login_failed: "Figma didn't complete the sign-in. Try again.",
};

export const FIGMA_SETTINGS_HREF = "/admin/social/cards#figma";

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function clearParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("figma");
  url.searchParams.delete("figma_error");
  window.history.replaceState(null, "", url.toString());
}

export function FigmaConnectionCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [notice, setNotice] = useState<string | null>(() => {
    const code = readParam("figma_error");
    return code ? (ERRORS[code] ?? ERRORS.login_failed!) : null;
  });
  const [pasting, setPasting] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (readParam("figma") || readParam("figma_error")) clearParams();
  }, []);

  const conn = useGetFigmaConnection({ query: { queryKey: getGetFigmaConnectionQueryKey() } });
  const refresh = () => qc.invalidateQueries({ queryKey: getGetFigmaConnectionQueryKey() });

  const start = useStartFigmaOAuth({
    mutation: {
      onSuccess: (res) => window.location.assign(res.url),
      onError: (err) => setNotice(figmaImportError(err).message),
    },
  });
  const save = useSaveFigmaToken({
    mutation: {
      onSuccess: () => {
        setToken("");
        setPasting(false);
        setNotice(null);
        refresh();
      },
      onError: (err) => {
        setToken("");
        setNotice(figmaImportError(err).message);
      },
    },
  });
  const disconnect = useDisconnectFigma({ mutation: { onSuccess: refresh } });

  const view = conn.data;
  const connected = !!view?.connected;
  const reconnect = view?.status === "needs_reconnect";

  const onDisconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Figma?",
      description: "The stored Figma sign-in is deleted. Templates already imported stay.",
      confirmText: "Disconnect",
      destructive: true,
    });
    if (ok) disconnect.mutate();
  };

  return (
    <div id="figma" className="space-y-3">
      <SettingsCard
        title="Figma"
        description="Connect the club's Figma account to turn your own Figma designs into card templates (Templates → Your templates → Import from Figma)."
      >
        <SettingsRow label="Status" helper={view?.statusReason ?? undefined}>
          {connected ? (
            <StatusPill tone="success">Connected</StatusPill>
          ) : reconnect ? (
            <StatusPill tone="danger">Reconnect needed</StatusPill>
          ) : (
            <StatusPill>Not connected</StatusPill>
          )}
        </SettingsRow>
        {view?.figmaHandle && (connected || reconnect) && (
          <SettingsRow label="Figma account">
            <span className="text-sm font-medium">
              {view.figmaHandle}
              <span className="ml-2 font-normal text-muted-foreground">
                {view.method === "oauth" ? "signed in with Figma" : "personal access token"}
              </span>
            </span>
          </SettingsRow>
        )}
        {pasting ? (
          <form
            className="space-y-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ data: { token: token.trim() } });
            }}
          >
            <p className="text-sm text-muted-foreground">
              In Figma, open Settings → Security → Personal access tokens and make a token with{" "}
              <span className="font-medium text-foreground">File content: read</span> and{" "}
              <span className="font-medium text-foreground">Current user: read</span>. It is checked
              with Figma, stored encrypted and never shown again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label="Figma personal access token"
                placeholder="figd_…"
                className="h-9 min-w-[16rem] flex-1"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button size="sm" type="submit" disabled={token.trim().length < 10 || save.isPending}>
                {save.isPending ? "Checking…" : "Connect"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setPasting(false);
                  setToken("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {view?.oauthAvailable && (
              <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
                {connected || reconnect ? "Sign in with Figma again" : "Sign in with Figma"}
              </Button>
            )}
            <Button
              size="sm"
              variant={view?.oauthAvailable ? "outline" : "default"}
              onClick={() => {
                setNotice(null);
                setPasting(true);
              }}
            >
              {connected || reconnect ? "Paste a new token" : "Paste a token"}
            </Button>
            {(connected || reconnect) && (
              <Button
                size="sm"
                variant="outline"
                onClick={onDisconnect}
                disabled={disconnect.isPending}
              >
                Disconnect
              </Button>
            )}
          </div>
        )}
      </SettingsCard>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
    </div>
  );
}
