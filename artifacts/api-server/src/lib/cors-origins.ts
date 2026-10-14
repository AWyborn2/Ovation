/** Exact project origins only; never allow arbitrary Expo/Replit subdomains. */
export function buildAllowedOrigins(options: {
  domains?: string;
  devDomain?: string;
  expoDevDomain?: string;
  production: boolean;
}): Set<string> {
  const origins = new Set<string>();
  for (const value of [
    options.domains,
    options.devDomain,
    options.production ? undefined : options.expoDevDomain,
  ]) {
    for (const host of value?.split(",") ?? []) {
      const trimmed = host.trim();
      if (trimmed) origins.add(`https://${trimmed}`);
    }
  }
  return origins;
}
