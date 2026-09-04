import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, type AppModuleOptions } from "../src/app.module";
import type { UpstreamFetch } from "../src/app.tokens";

export function createApp(
  upstreamFetch: UpstreamFetch = fetch,
  options: Omit<AppModuleOptions, "upstreamFetch"> = {},
) {
  let application: Promise<NestFastifyApplication> | null = null;
  const getApplication = () => {
    application ??= Test.createTestingModule({
      imports: [AppModule.register({ ...options, upstreamFetch })],
    })
      .compile()
      .then(async (moduleRef) => {
        const app = moduleRef.createNestApplication<NestFastifyApplication>(
          new FastifyAdapter(),
        );
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
        return app;
      });
    return application;
  };

  return {
    async request(url: string, init: RequestInit = {}) {
      const app = await getApplication();
      let payload: string | Buffer | undefined;
      if (typeof init.body === "string") {
        payload = init.body;
      } else if (Buffer.isBuffer(init.body)) {
        payload = init.body;
      }
      const response = await app.inject({
        method: (init.method ?? "GET") as
          | "GET"
          | "POST"
          | "PUT"
          | "PATCH"
          | "DELETE",
        url,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(payload === undefined ? {} : { payload }),
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value === undefined) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            headers.append(name, item);
          }
          continue;
        }
        headers.set(name, String(value));
      }
      const body = [204, 205, 304].includes(response.statusCode)
        ? null
        : response.body;
      return new Response(body, {
        status: response.statusCode,
        headers,
      });
    },
    async listen() {
      const app = await getApplication();
      await app.listen(0, "127.0.0.1");
      return {
        url: await app.getUrl(),
        close: () => app.close(),
      };
    },
  };
}
