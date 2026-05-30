import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

serve({ fetch: app.fetch, port: config.apiPort }, (info) => {
  console.info(
    JSON.stringify({
      level: "info",
      event: "server.start",
      port: info.port,
      ts: new Date().toISOString(),
    }),
  );
});
