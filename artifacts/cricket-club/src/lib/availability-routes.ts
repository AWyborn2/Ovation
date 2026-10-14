/**
 * The public paths of a personal availability link. Messages send the short
 * form, `/a/{round tag}/{token}` (e.g. `/a/r6/Xk3p9Qa2bC1d`) or `/a/{token}`;
 * links sent before short links use `/availability/{token}`. Every form opens
 * the same page with the `token` param — the round tag is decorative and never
 * read.
 */
export const AVAILABILITY_LINK_ROUTES = [
  "/availability/:token",
  "/a/:tag/:token",
  "/a/:token",
] as const;
