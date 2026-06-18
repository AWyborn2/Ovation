import express, { type Express } from "express";
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
  express.raw({ type: "application/json" }),
  billingWebhookHandler,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the tenant (header → env → default) for every API request before the
// routes run, so handlers can read it via getTenantId(req).
app.use("/api", tenantContext, router);
app.use(goRedirectRouter);

// Seed the demo tenant's first admin from ADMIN_PASSWORD if it has none, and the
// platform super-admin from PLATFORM_ADMIN_EMAIL/PASSWORD (both no-ops if unset).
ensureSeedAdmin().catch((err) => {
  logger.error({ err }, "ensureSeedAdmin failed");
});
ensureSeedPlatformAdmin().catch((err) => {
  logger.error({ err }, "ensureSeedPlatformAdmin failed");
});

export default app;
