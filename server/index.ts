import { serveStatic } from "hono/bun";
import { createApp } from "./app";

const app = createApp();
const port = Number(Bun.env.PORT ?? "3000");

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default {
  hostname: "127.0.0.1",
  port,
  fetch: app.fetch,
};
