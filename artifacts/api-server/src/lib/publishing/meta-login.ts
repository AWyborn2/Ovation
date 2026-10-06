import { env } from "../../config";
import { graph, oauthExchange } from "./meta-client";
import { DestinationError } from "./destination";

/**
 * Facebook Login for Business (KTD1). The admin's browser goes to Meta's
 * dialog; Meta sends a code to Ovation's one platform-level callback; Ovation
 * swaps it for a long-lived user token, lists the admin's Pages and their
 * linked Instagram accounts, and keeps only the Page tokens. The user token is
 * dropped as soon as this returns.
 */

export function callbackUrl(): string {
  const origin = env.SOCIAL_PUBLIC_ORIGIN();
  if (!origin) throw new DestinationError("permanent", "SOCIAL_PUBLIC_ORIGIN is not set");
  return `${origin.replace(/\/$/, "")}/api/meta/oauth/callback`;
}

export function loginDialogUrl(state: string): string {
  const appId = env.META_APP_ID();
  const configId = env.META_LOGIN_CONFIG_ID();
  if (!appId || !configId) throw new DestinationError("permanent", "Meta app is not configured");
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl(),
    state,
    config_id: configId,
    response_type: "code",
    override_default_response_type: "true",
  });
  return `https://www.facebook.com/${env.META_GRAPH_VERSION()}/dialog/oauth?${q.toString()}`;
}

export type LoginPage = {
  pageId: string;
  pageName: string;
  igUserId: string | null;
  igUsername: string | null;
  token: string;
};

export type LoginResult = { metaUserId: string; scopes: string[]; pages: LoginPage[] };

type AccountsResponse = {
  data?: {
    id: string;
    name: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }[];
};

export async function completeLogin(code: string): Promise<LoginResult> {
  const short = await oauthExchange({ redirect_uri: callbackUrl(), code });
  const long = await oauthExchange({
    grant_type: "fb_exchange_token",
    fb_exchange_token: short.access_token,
  });
  const userToken = long.access_token;
  const me = await graph<{ id: string }>("GET", "me", { fields: "id" }, userToken);
  const perms = await graph<{ data?: { permission: string; status: string }[] }>(
    "GET",
    "me/permissions",
    {},
    userToken,
  );
  const accounts = await graph<AccountsResponse>(
    "GET",
    "me/accounts",
    { fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 },
    userToken,
  );
  return {
    metaUserId: me.id,
    scopes: (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission),
    pages: (accounts.data ?? [])
      .filter((p) => !!p.access_token)
      .map((p) => ({
        pageId: p.id,
        pageName: p.name,
        igUserId: p.instagram_business_account?.id ?? null,
        igUsername: p.instagram_business_account?.username ?? null,
        token: p.access_token as string,
      })),
  };
}
