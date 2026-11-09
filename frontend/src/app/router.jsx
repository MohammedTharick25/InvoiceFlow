import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useState } from "react";
import { AuthProvider } from "./AuthProvider.jsx";
import App from "./App.jsx";
import { AuthPage } from "../features/auth/AuthPage.jsx";
import { OnboardingPage } from "../features/onboarding/OnboardingPage.jsx";
import { Button } from "../components/ui/Button.jsx";
import { useAuthStore } from "../store/authStore.js";
import { apiErrorMessage, logoutUser } from "../lib/authClient.js";

function LoadingScreen({ error }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-card dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-ink dark:text-white">
          {error ? "Connection problem" : "Loading your workspace"}
        </h1>
        <p
          className="mt-2 text-sm leading-6 text-muted dark:text-slate-400"
          role={error ? "alert" : "status"}
        >
          {error ?? "Checking your secure session…"}
        </p>
        {error && (
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Try again
          </Button>
        )}
      </section>
    </main>
  );
}

function RouteContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapError = useAuthStore((state) => state.bootstrapError);
  const accessToken = useAuthStore((state) => state.accessToken);
  const workspace = useAuthStore((state) => state.workspace);
  const user = useAuthStore((state) => state.user);
  const [signOutError, setSignOutError] = useState("");

  if (!initialized) return <LoadingScreen />;

  const authPath =
    location.pathname === "/register"
      ? "/auth/register"
      : location.pathname === "/login"
        ? "/auth/login"
        : location.pathname;

  if (authPath.startsWith("/auth/")) {
    if (authPath === "/auth/onboarding") {
      if (!accessToken) return <Navigate to="/auth/login" replace />;
      if (workspace) return <Navigate to="/" replace />;
      return <OnboardingPage />;
    }
    if (accessToken)
      return <Navigate to={workspace ? "/" : "/auth/onboarding"} replace />;
    if (authPath === "/auth/register") return <AuthPage mode="register" />;
    if (authPath === "/auth/verify-email")
      return <AuthPage mode="verify-email" />;
    if (authPath === "/auth/forgot-password")
      return <AuthPage mode="forgot-password" />;
    if (authPath === "/auth/reset-password")
      return <AuthPage mode="reset-password" />;
    return <AuthPage mode="login" />;
  }

  if (bootstrapError) return <LoadingScreen error={bootstrapError} />;

  if (!accessToken) return <Navigate to="/auth/login" replace />;
  if (!workspace) return <Navigate to="/auth/onboarding" replace />;
  async function signOut() {
    setSignOutError("");
    try {
      await logoutUser();
      navigate("/auth/login", { replace: true });
    } catch (error) {
      setSignOutError(
        apiErrorMessage(error, "Could not sign out. Please try again."),
      );
    }
  }

  return (
    <App
      entitlements={workspace.entitlements}
      readOnly={workspace.readOnly}
      subscription={workspace.subscription}
      workspace={workspace}
      user={user}
      onSignOut={signOut}
      signOutError={signOutError}
    />
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="*" element={<RouteContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
