import { serveStatic } from "hono/bun";
import { createApp } from "./app";
import { resolveHostname } from "./config";

const app = createApp();
const port = Number(Bun.env.PORT ?? "3000");

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/manifest.webmanifest", serveStatic({ root: "./dist" }));
app.use("/pwa-icon.svg", serveStatic({ root: "./dist" }));
app.use("/register-sw.js", serveStatic({ root: "./dist" }));
app.use("/sw.js", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default {
  hostname: resolveHostname(Bun.env.HOST),
  port,
  fetch: app.fetch,
};
