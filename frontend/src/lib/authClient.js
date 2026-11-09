import { apiClient } from "./apiClient.js";
import { useAuthStore } from "../store/authStore.js";

let refreshInFlight;

function refreshRequest() {
  if (refreshInFlight) return refreshInFlight;
  const sendRefresh = async () =>
    (await apiClient.post("/auth/refresh", undefined, { skipAuth: true })).data;
  const request =
    typeof navigator !== "undefined" && navigator.locks?.request
      ? navigator.locks.request("invoiceflow-auth-refresh", sendRefresh)
      : sendRefresh();
  refreshInFlight = request.finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

async function fetchCurrentWorkspace(accessToken) {
  const response = await apiClient.get("/businesses/current", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

async function establishSession(session) {
  let workspace = null;
  if (session.business?.id) {
    workspace = await fetchCurrentWorkspace(session.accessToken);
  }
  useAuthStore.getState().setSession(session, workspace);
  return { session, workspace };
}

export async function loginUser(credentials) {
  const { data } = await apiClient.post("/auth/login", credentials, {
    skipAuth: true,
  });
  return establishSession(data);
}

export async function bootstrapSession() {
  try {
    const session = await refreshRequest();
    return await establishSession(session);
  } catch (error) {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearSession();
      return null;
    }
    throw error;
  }
}

export async function refreshSession() {
  const session = await refreshRequest();
  return establishSession(session);
}

export async function registerUser(input) {
  const { data } = await apiClient.post("/auth/register", input, {
    skipAuth: true,
  });
  return data;
}

export async function verifyEmail(token) {
  const { data } = await apiClient.post(
    "/auth/verify-email",
    { token },
    { skipAuth: true },
  );
  return data;
}

export async function requestPasswordReset(email) {
  const { data } = await apiClient.post(
    "/auth/forgot-password",
    { email },
    { skipAuth: true },
  );
  return data;
}

export async function resetPassword(token, password) {
  const { data } = await apiClient.post(
    "/auth/reset-password",
    { token, password },
    { skipAuth: true },
  );
  return data;
}

export async function completeOnboarding(input) {
  const { data } = await apiClient.post("/businesses", input);
  return establishSession({
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    tokenType: data.tokenType,
    user: useAuthStore.getState().user,
    business: data.business ? { id: data.business.id } : null,
  });
}

export async function logoutUser() {
  const session = useAuthStore.getState();
  if (!session.accessToken) {
    useAuthStore.getState().clearSession();
    return;
  }

  try {
    await apiClient.post("/auth/logout");
  } catch (error) {
    if (error.response?.status === 401) {
      try {
        await refreshSession();
        await apiClient.post("/auth/logout");
      } catch (refreshError) {
        if (refreshError.response?.status === 401) {
          useAuthStore.getState().clearSession();
          return;
        }
        throw refreshError;
      }
    } else {
      throw error;
    }
  }
  useAuthStore.getState().clearSession();
}

export function apiErrorMessage(error, fallback) {
  return error.response?.data?.error?.message ?? fallback;
}
