/**
 * Express 4 does not catch an error thrown (or a promise rejected) inside an async route handler. On Node 20 that
 * is an unhandled rejection and the whole server exits, so one database hiccup in one route took everybody down.
 *
 * This hands such a rejection to Express's normal error handler (a 500 for that one request), and the process
 * handlers below make sure anything else is logged instead of killing the server.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Layer = require("express/lib/router/layer");

if (!Layer.prototype.__asyncSafe) {
  Layer.prototype.handle_request = function handle_request(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === "function") result.catch(next);
    } catch (error) {
      next(error);
    }
  };
  Layer.prototype.__asyncSafe = true;
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error?.stack || error);
});
