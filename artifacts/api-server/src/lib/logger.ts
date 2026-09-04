import pino from "pino";
import { env } from "../config";

const isProduction = env.isProduction();

export const logger = pino({
  level: env.LOG_LEVEL() ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
