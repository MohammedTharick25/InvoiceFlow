import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "../src/lib/apiClient.js";
import {
  bootstrapSession,
  loginUser,
  logoutUser,
  requestPasswordReset,
  registerUser,
} from "../src/lib/authClient.js";
import { useAuthStore } from "../src/store/authStore.js";

const originalAdapter = apiClient.defaults.adapter;
const session = {
  accessToken: "short-lived-access-token",
  expiresIn: 900,
  user: { id: "user-1", email: "owner@example.test", name: "Owner" },
  business: null,
};

function respond(handler) {
  apiClient.defaults.adapter = async (config) => ({
    data: await handler(config),
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    request: {},
  });
}

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  useAuthStore.getState().clearSession();
});

describe("browser authentication client", () => {
  it("keeps the access token in memory and attaches it to protected requests", async () => {
    const observed = [];
    respond((config) => {
      observed.push(config);
      return config.url.endsWith("/auth/login") ? session : { ok: true };
    });

    await loginUser({
      email: session.user.email,
      password: "long-enough-password",
    });
    await apiClient.get("/protected");

    expect(observed[1].headers.get("Authorization")).toBe(
      `Bearer ${session.accessToken}`,
    );
    expect(useAuthStore.getState().accessToken).toBe(session.accessToken);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it("refreshes an existing cookie session without persisting its access token", async () => {
    respond(() => session);
    await bootstrapSession();
    expect(useAuthStore.getState().accessToken).toBe(session.accessToken);
    expect(window.localStorage.length).toBe(0);
  });

  it("does not send an in-memory bearer token to public auth endpoints", async () => {
    let receivedAuthorization;
    respond((config) => {
      receivedAuthorization = config.headers.get("Authorization");
      return { accepted: true };
    });
    useAuthStore.getState().setSession(session);

    await registerUser({
      name: "Owner",
      email: session.user.email,
      password: "long-enough-password",
    });
    expect(receivedAuthorization).toBeUndefined();
  });

  it("requests password resets through the generic public endpoint", async () => {
    let request;
    respond((config) => {
      request = config;
      return {
        message:
          "If this address can be registered, reset instructions have been sent.",
      };
    });
    const result = await requestPasswordReset("owner@example.test");
    expect(request.url).toBe("/auth/forgot-password");
    expect(request.data).toBe(JSON.stringify({ email: "owner@example.test" }));
    expect(request.headers.get("Authorization")).toBeUndefined();
    expect(result.message).toContain("If this address can be registered");
  });

  it("revokes the session and clears client memory on sign out", async () => {
    respond(() => ({ message: "Signed out." }));
    useAuthStore.getState().setSession(session);
    await logoutUser();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
