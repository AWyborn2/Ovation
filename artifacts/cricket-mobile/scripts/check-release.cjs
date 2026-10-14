const path = require("node:path");
const { getReleaseDomain, verifyTenantApi, checkStaticConfig } = require("./release-config.cjs");

async function main() {
  const config = checkStaticConfig(path.resolve(__dirname, ".."));
  const domain = getReleaseDomain();
  const brand = await verifyTenantApi(domain);
  console.log(`Release preflight passed: ${config.name} ${config.version}`);
  console.log(`iOS: ${config.ios.bundleIdentifier}; Android: ${config.android.package}`);
  console.log(`Club API: ${brand.name} at https://${domain}`);
}

main().catch((error) => {
  console.error(`Release preflight failed: ${error.message}`);
  process.exitCode = 1;
});
