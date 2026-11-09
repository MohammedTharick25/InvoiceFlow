import { useEffect } from "react";
import { bootstrapSession, refreshSession } from "../lib/authClient.js";
import { useAuthStore } from "../store/authStore.js";

export function AuthProvider({ children }) {
  const initialized = useAuthStore((state) => state.initialized);
  const accessToken = useAuthStore((state) => state.accessToken);
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setBootstrapError = useAuthStore((state) => state.setBootstrapError);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let active = true;
    bootstrapSession()
      .then(() => {
        if (active) setInitialized();
      })
      .catch(() => {
        if (active) {
          setBootstrapError(
            "InvoiceFlow could not connect. Check your connection and retry.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [setBootstrapError, setInitialized]);

  useEffect(() => {
    if (!initialized || !accessToken || !expiresAt) return undefined;
    const refreshIn = Math.max(1000, expiresAt - Date.now() - 60_000);
    let retryTimer;
    const timer = window.setTimeout(async function renew() {
      try {
        await refreshSession();
      } catch (error) {
        if (error.response?.status === 401) {
          clearSession();
        } else {
          retryTimer = window.setTimeout(renew, 30_000);
        }
      }
    }, refreshIn);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
    };
  }, [accessToken, clearSession, expiresAt, initialized]);

  return children;
}
