import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("http://invoiceflow.test/health", () =>
    HttpResponse.json({ status: "ok" }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("MSW smoke", () => {
  it("intercepts a request", async () => {
    const response = await fetch("http://invoiceflow.test/health");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
