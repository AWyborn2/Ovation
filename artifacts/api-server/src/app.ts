import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { tenantContext } from "./middlewares/tenant-context";
import { billingWebhookHandler } from "./routes/billing";
import { goRedirectRouter } from "./routes/social-drafts";
import { logger } from "./lib/logger";
import { ensureSeedAdmin, ensureSeedPlatformAdmin } from "./lib/auth";

const app: Express = express();

// The API runs behind Replit's reverse proxy; trust the first hop so that
// req.ip reflects the real client (needed for per-client rate limiting).
app.set("trust proxy", 1);

// Only allow credentialed cross-origin requests from the club's own dev and
// published domains (derived from the platform env vars). Requests with no
// Origin header (same-origin browser requests, native mobile fetches, curl)
// are allowed through.
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const addHosts = (value: string | undefined): void => {
    if (!value) return;
    for (const host of value.split(",")) {
      const trimmed = host.trim();
      if (trimmed) origins.add(`https://${trimmed}`);
    }
  };
  addHosts(process.env["REPLIT_DOMAINS"]);
  addHosts(process.env["REPLIT_DEV_DOMAIN"]);
  return origins;
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  helmet({
    // Allow assets served by the API (e.g. stored images) to be embedded by
    // the web/mobile clients, which may live on a different origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(cookieParser());

// The billing webhook needs the RAW body for signature verification, so it must
// be mounted before the JSON body parser. Inert while billing is disabled.
app.post(
  "/billing/webhook",
  // Explicit ceiling: this parser is mounted before the global one, so it does
  // not inherit it. Stripe event payloads sit well under 100kb.
  express.raw({ type: "application/json", limit: "100kb" }),
  billingWebhookHandler,
);

// Explicit body ceilings, pinned at body-parser's own default rather than left
// implicit. Bodies here are small JSON (settings patches, import reconcile
// maps); images and logos travel as URLs and file uploads go through multer's
// multipart handling in `imports.ts`, so neither is affected. Raising this is a
// relaxation, not hardening — if a route ever needs a larger body, give that
// route its own limit instead of widening the global one.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Resolve the tenant (header → env → default) for every API request before the
// routes run, so handlers can read it via getTenantId(req).
app.use("/api", tenantContext, router);
// /go/:slug is mounted at the app root (a public short link may be shared
// without the /api prefix), but tracked links are tenant-scoped, so it needs
// the same host-based tenant resolution as /api — a slug is only unique
// within its own tenant.
app.use(tenantContext, goRedirectRouter);

// Central error handler: an error carrying a numeric `status` (e.g.
// TenantNotFoundError → 404) is surfaced as that status with a clean body,
// instead of Express's default 500. This is how "fail closed" tenant resolution
// reaches the client — a request for an unprovisioned/misconfigured tenant gets
// a 404, never another tenant's data. Anything else is a genuine 500.
app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const status =
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    if (status >= 500) {
      req.log?.error?.({ err }, "unhandled request error");
    }
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    res.status(status).json({ error: status >= 500 ? "Internal Server Error" : message });
  },
);

// Seed the demo tenant's first admin from ADMIN_PASSWORD if it has none, and the
// platform super-admin from PLATFORM_ADMIN_EMAIL/PASSWORD (both no-ops if unset).
ensureSeedAdmin().catch((err) => {
  logger.error({ err }, "ensureSeedAdmin failed");
});
ensureSeedPlatformAdmin().catch((err) => {
  logger.error({ err }, "ensureSeedPlatformAdmin failed");
});

export default app;
