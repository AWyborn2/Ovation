import { closeDb } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { validateConfigAtBoot } from "./config";
import { logger } from "./lib/logger";
import { closeBrowser } from "./lib/card-video-renderer";

// Fail fast, and all at once, on a misconfigured environment (see config.ts).
const config = validateConfigAtBoot();

// Imported after validation so a bad environment produces the readable
// config error rather than a stack trace from deep inside a module.
const { default: app } = await import("./app");

const server = app.listen(config.PORT, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port: config.PORT }, "Server listening");
});

/**
 * Graceful shutdown. On SIGTERM/SIGINT (autoscale scale-down, a deploy, Ctrl-C)
 * stop accepting connections, let in-flight requests finish, then release the
 * database pools and the shared Chromium so nothing is orphaned. A hard exit
 * follows if draining takes too long.
 */
const SHUTDOWN_GRACE_MS = 15_000;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  const hardExit = setTimeout(() => {
    logger.error("Shutdown grace period exceeded; exiting");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  hardExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([closeBrowser(), closeDb(), closeCentralDb()]);
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", (sig) => void shutdown(sig));
process.on("SIGINT", (sig) => void shutdown(sig));
