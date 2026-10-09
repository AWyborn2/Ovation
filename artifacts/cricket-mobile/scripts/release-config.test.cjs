const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const { getReleaseDomain, verifyTenantApi, checkStaticConfig } = require("./release-config.cjs");

test("Metro ignores replaceable Vite caches without excluding application dependencies", () => {
  const config = require("../metro.config.js");
  const blocked = (file) => config.resolver.blockList.some((pattern) => pattern.test(file));
  assert.equal(blocked("/workspace/artifacts/cricket-club/node_modules/.vite/deps_temp_example"), true);
  assert.equal(blocked("/workspace/artifacts/cricket-mobile/app/index.tsx"), false);
  assert.equal(blocked("/workspace/node_modules/.pnpm/react/index.js"), false);
});

test("mobile providers and shared API hooks resolve the same React Query and React", () => {
  const mobileRequire = createRequire(path.resolve(__dirname, "../package.json"));
  const clientRequire = createRequire(mobileRequire.resolve("@workspace/api-client-react"));
  const mobileQuery = mobileRequire.resolve("@tanstack/react-query");
  const clientQuery = clientRequire.resolve("@tanstack/react-query");
  assert.equal(clientQuery, mobileQuery);
  const queryRequire = createRequire(clientQuery);
  assert.equal(queryRequire.resolve("react"), mobileRequire.resolve("react"));
});

test("static configuration preserves the existing identities on both platforms", () => {
  const config = checkStaticConfig(path.resolve(__dirname, ".."));
  assert.equal(config.name, "Ovation");
  assert.equal(config.slug, "ovation");
  assert.equal(config.scheme, "ovation");
  assert.equal(config.ios.bundleIdentifier, "app.ovation.ovation");
  assert.equal(config.android.package, "app.ovation.ovation");
});

test("release host accepts a bare hostname or an HTTPS origin", () => {
  assert.equal(getReleaseDomain({ EXPO_PUBLIC_DOMAIN: "club.example.com" }), "club.example.com");
  assert.equal(getReleaseDomain({ EXPO_PUBLIC_DOMAIN: "https://club.example.com/" }), "club.example.com");
});

test("explicit club API takes precedence over the hosting deployment domain", () => {
  assert.equal(getReleaseDomain({
    EXPO_PUBLIC_DOMAIN: "club.example.com",
    REPLIT_INTERNAL_APP_DOMAIN: "platform.example.com",
  }), "club.example.com");
});

test("managed production domain is allowed, but development fallback is not", () => {
  assert.equal(getReleaseDomain({ REPLIT_INTERNAL_APP_DOMAIN: "club.example.com" }), "club.example.com");
  assert.throws(() => getReleaseDomain({ REPLIT_DEV_DOMAIN: "workspace.replit.dev" }), /Set EXPO_PUBLIC_DOMAIN/);
});

test("unsafe or malformed release API hosts fail explicitly", () => {
  for (const value of [
    "http://club.example.com", "localhost", "127.0.0.1", "https://[::1]",
    "workspace.replit.dev", "https://user:password@club.example.com",
    "https://club.example.com/api", "https://club.example.com?tenant=1",
    "https://club.example.com#fragment", "https://club.example.com:8443",
  ]) {
    assert.throws(() => getReleaseDomain({ EXPO_PUBLIC_DOMAIN: value }));
  }
});

test("API check verifies the club without overriding its tenant header", async () => {
  const brand = { name: "Example Cricket Club", primaryColour: "#123456" };
  const result = await verifyTenantApi("club.example.com", async (url, options) => {
    assert.equal(url, "https://club.example.com/api/tenant-brand");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    return { ok: true, json: async () => brand };
  });
  assert.equal(result, brand);
});

test("platform host cannot masquerade as a successful club API", async () => {
  await assert.rejects(() => verifyTenantApi("platform.example.com", async () => ({
    ok: true, json: async () => ({ platform: true, name: "Ovation" }),
  })), /not a club/);
});

test("unavailable or malformed club APIs block release", async () => {
  await assert.rejects(() => verifyTenantApi("club.example.com", async () => ({
    ok: false, status: 404,
  })), /HTTP 404/);
  await assert.rejects(() => verifyTenantApi("club.example.com", async () => ({
    ok: true, json: async () => ({}),
  })), /valid tenant brand/);
});
