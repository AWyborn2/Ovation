/**
 * The card render harness contract (round 3 retest, P0 1).
 *
 * The api-server draws downloads and posted images by opening the web app's
 * hidden `/__card-render` page in headless Chromium. When that page comes from
 * a different build (dev's server pointed at the published app, for example),
 * a design that names a field the older binder never fills draws it empty: a
 * Team List came out with shirt numbers and blank name rows. The server and the
 * harness both read this number; the server refuses to draw with a harness
 * that reports a different one, so a mismatch fails loudly instead of posting
 * a card with missing names.
 *
 * Raise it whenever the binder gains a field a template may print (as
 * `listName` did in #636), or the harness payload changes shape.
 */
export const CARD_RENDER_CONTRACT = 2;
