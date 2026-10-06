import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMetaConnection,
  getGetMetaConnectionQueryKey,
  useStartMetaConnect,
  useGetMetaConnectPending,
  getGetMetaConnectPendingQueryKey,
  useCompleteMetaConnect,
  useDisconnectMetaConnection,
  getGetSocialSettingsQueryKey,
  getListSocialDraftsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsRow, StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Facebook Page + Instagram connection (Meta publishing R1, R2). Connecting
 * goes to Facebook and comes back here with `?meta_connect=<token>`; with one
 * Page it connects straight away, with several the admin picks one.
 */

const ERRORS: Record<string, string> = {
  cancelled: "Connecting was cancelled on Facebook.",
  not_allowed: "Your admin access changed while connecting. Sign in and try again.",
  unavailable: "Publishing to Facebook and Instagram isn't switched on for this club.",
  login_failed: "Facebook didn't complete the connection. Try again.",
  no_pages: "That Facebook account doesn't manage any Pages.",
};

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function clearParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("meta_connect");
  url.searchParams.delete("meta_error");
  window.history.replaceState(null, "", url.toString());
}

export function MetaConnectionCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(() => readParam("meta_connect"));
  const [notice, setNotice] = useState<string | null>(() => {
    const code = readParam("meta_error");
    return code ? (ERRORS[code] ?? "Facebook didn't complete the connection. Try again.") : null;
  });
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (readParam("meta_error")) clearParams();
  }, []);

  const conn = useGetMetaConnection({ query: { queryKey: getGetMetaConnectionQueryKey() } });
  const pending = useGetMetaConnectPending(
    { token: token ?? "" },
    {
      query: {
        queryKey: getGetMetaConnectPendingQueryKey({ token: token ?? "" }),
        enabled: !!token,
        retry: false,
      },
    },
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetMetaConnectionQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
  };

  const start = useStartMetaConnect({
    mutation: {
      onSuccess: (res) => window.location.assign(res.url),
      onError: () => setNotice("Couldn't start connecting. Try again."),
    },
  });
  const complete = useCompleteMetaConnect({
    mutation: {
      onSuccess: () => {
        setToken(null);
        clearParams();
        setNotice(null);
        refresh();
      },
      onError: () => {
        setToken(null);
        clearParams();
        setNotice("That connection attempt expired. Start again.");
      },
    },
  });
  const disconnect = useDisconnectMetaConnection({ mutation: { onSuccess: refresh } });

  const pages = useMemo(() => pending.data?.pages ?? [], [pending.data]);
  // One Page: nothing to choose, connect it.
  useEffect(() => {
    if (token && pages.length === 1 && !complete.isPending && !complete.isSuccess) {
      complete.mutate({ data: { token, pageId: pages[0].pageId, replace: true } });
    }
  }, [token, pages, complete]);
  useEffect(() => {
    if (token && pending.isError) {
      setToken(null);
      clearParams();
      setNotice("That connection attempt expired. Start again.");
    }
  }, [token, pending.isError]);

  const view = conn.data;
  const status = view?.status ?? "not_connected";
  const connected = status === "connected";

  const onConnect = async () => {
    if (connected) {
      const ok = await confirm({
        title: "Replace the connection?",
        description: `Posts will go to the Page you pick instead of ${view?.pageName ?? "the current Page"}.`,
        confirmText: "Replace",
      });
      if (!ok) return;
    }
    start.mutate({ data: { replace: connected } });
  };

  const onDisconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Facebook and Instagram?",
      description: "Scheduled posts are cancelled. Drafts stay in the queue.",
      confirmText: "Disconnect",
      destructive: true,
    });
    if (ok) disconnect.mutate();
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Facebook and Instagram"
        description="Publish ready cards to the club's Facebook Page and Instagram account, at a time you choose or automatically."
      >
        {view && !view.available ? (
          <p className="text-sm text-muted-foreground">
            Publishing to Facebook and Instagram isn't switched on for this club yet.
          </p>
        ) : token && pages.length > 1 ? (
          <div className="space-y-3" role="radiogroup" aria-label="Choose a Facebook Page">
            <p className="text-sm">Which Page should the club post to?</p>
            {pages.map((p) => (
              <label key={p.pageId} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="meta-page"
                  value={p.pageId}
                  checked={picked === p.pageId}
                  onChange={() => setPicked(p.pageId)}
                />
                <span className="font-medium">{p.pageName}</span>
                <span className="text-muted-foreground">
                  {p.igUsername ? `Instagram @${p.igUsername}` : "No Instagram account linked"}
                </span>
              </label>
            ))}
            <Button
              size="sm"
              disabled={!picked || complete.isPending}
              onClick={() =>
                picked && complete.mutate({ data: { token, pageId: picked, replace: true } })
              }
            >
              Connect this Page
            </Button>
          </div>
        ) : token ? (
          <p className="text-sm text-muted-foreground">Finishing the connection…</p>
        ) : (
          <>
            <SettingsRow label="Status" helper={view?.statusReason ?? undefined}>
              {connected ? (
                <StatusPill tone="success">Connected</StatusPill>
              ) : status === "needs_reconnect" ? (
                <StatusPill tone="danger">Reconnect needed</StatusPill>
              ) : (
                <StatusPill>Not connected</StatusPill>
              )}
            </SettingsRow>
            {connected && (
              <>
                <SettingsRow label="Facebook Page">
                  <span className="text-sm font-medium">{view?.pageName}</span>
                </SettingsRow>
                <SettingsRow label="Instagram">
                  <span className="text-sm">
                    {view?.igUsername ? `@${view.igUsername}` : "No Instagram account linked"}
                  </span>
                </SettingsRow>
              </>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={onConnect} disabled={start.isPending}>
                {connected
                  ? "Connect a different Page"
                  : status === "needs_reconnect"
                    ? "Reconnect"
                    : "Connect Facebook and Instagram"}
              </Button>
              {connected && (
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
          </>
        )}
      </SettingsCard>
      {notice && <p className="text-sm text-destructive">{notice}</p>}
    </div>
  );
}
