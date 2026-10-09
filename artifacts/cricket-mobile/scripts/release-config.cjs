const fs = require("node:fs");
const path = require("node:path");

/** Production bundles must never silently inherit the workspace's API host. */
function getReleaseDomain(env = process.env) {
  const value = (env.EXPO_PUBLIC_DOMAIN || env.REPLIT_INTERNAL_APP_DOMAIN || "").trim();
  if (!value) {
    throw new Error("Set EXPO_PUBLIC_DOMAIN to the published club API host before building a release.");
  }
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash || url.port ||
    !host.includes(".") || host === "localhost" ||
    host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".replit.dev") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")
  ) {
    throw new Error("Release API host must be a public HTTPS hostname, without a path, credentials or development address.");
  }
  return url.host;
}

async function verifyTenantApi(domain, fetchImpl = fetch) {
  const response = await fetchImpl(`https://${domain}/api/tenant-brand`, {
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`Club API check failed (HTTP ${response.status}).`);
  }
  const brand = await response.json();
  if (brand?.platform === true) {
    throw new Error("This API host serves the Ovation platform, not a club. Select the published club host for this mobile release.");
  }
  if (!brand || typeof brand.name !== "string" || !brand.name.trim()) {
    throw new Error("Club API did not return a valid tenant brand.");
  }
  return brand;
}

function checkStaticConfig(projectRoot) {
  for (const file of ["app.config.ts", "app.config.js"]) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      throw new Error("Replit Expo Launch requires static app.json, not dynamic app.config files.");
    }
  }
  const { expo } = JSON.parse(fs.readFileSync(path.join(projectRoot, "app.json"), "utf8"));
  if (!expo?.name || !expo.slug || !expo.scheme || !/^\d+\.\d+\.\d+$/.test(expo.version)) {
    throw new Error("App name, slug, scheme and release version must be configured.");
  }
  const identifier = /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/;
  if (!identifier.test(expo.ios?.bundleIdentifier) || !identifier.test(expo.android?.package)) {
    throw new Error("Both iOS and Android store identifiers must be configured.");
  }
  if (!/^[1-9]\d*$/.test(expo.ios?.buildNumber) ||
      !Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 1) {
    throw new Error("Both platforms need positive release build numbers.");
  }
  const icon = fs.readFileSync(path.join(projectRoot, expo.icon));
  // PNG IHDR: width at 16, height at 20, colour type at 25.
  if (icon.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      icon.readUInt32BE(16) !== 1024 || icon.readUInt32BE(20) !== 1024 ||
      icon[25] !== 2) {
    throw new Error("Store icon must be a 1024×1024 opaque RGB PNG.");
  }
  return expo;
}

module.exports = { getReleaseDomain, verifyTenantApi, checkStaticConfig };
