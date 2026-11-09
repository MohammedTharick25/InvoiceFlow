import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import {
  apiErrorMessage,
  loginUser,
  requestPasswordReset,
  registerUser,
  resetPassword,
  verifyEmail,
} from "../../lib/authClient.js";

function AuthFrame({ title, description, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-9 dark:border-slate-800 dark:bg-slate-900">
        <Link className="mb-8 inline-flex items-center gap-3" to="/auth/login">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-700 text-sm font-bold text-white">
            I
          </span>
          <span className="text-base font-semibold tracking-tight text-ink dark:text-white">
            InvoiceFlow
          </span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted dark:text-slate-400">
          {description}
        </p>
        {children}
      </section>
    </main>
  );
}

function FormError({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      {children}
    </p>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { workspace } = await loginUser({ email, password });
      navigate(workspace ? "/" : "/auth/onboarding", { replace: true });
    } catch (requestError) {
      setError(
        apiErrorMessage(requestError, "Sign-in failed. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Sign in to InvoiceFlow"
      description="Use your verified email address to open your business workspace."
    >
      {location.state?.notice && (
        <p className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {location.state.notice}
        </p>
      )}
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Email address
          <Input
            autoComplete="email"
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Password
          <Input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <FormError>{error}</FormError>
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted dark:text-slate-400">
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          to="/auth/forgot-password"
        >
          Forgot password?
        </Link>
      </p>
      <p className="mt-4 text-center text-sm text-muted dark:text-slate-400">
        New to InvoiceFlow?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          to="/auth/register"
        >
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await registerUser({ name, email, password });
      if (result.developmentToken) {
        await verifyEmail(result.developmentToken);
        navigate("/auth/login", {
          replace: true,
          state: { notice: "Your email is verified. You can sign in now." },
        });
      } else {
        navigate("/auth/login", {
          replace: true,
          state: {
            notice:
              "If this address can be registered, verification instructions have been sent. Follow the link in that email before signing in.",
          },
        });
      }
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "Account registration failed. Please try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Create your account"
      description="Start with a free 14-day trial. No payment card is required."
    >
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Your name
          <Input
            autoComplete="name"
            autoFocus
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Email address
          <Input
            autoComplete="email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Password
          <Input
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <span className="block text-xs font-normal text-muted dark:text-slate-400">
            Use at least 12 characters. Avoid a password used on another site.
          </span>
        </label>
        <FormError>{error}</FormError>
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted dark:text-slate-400">
        Already have an account?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          to="/auth/login"
        >
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await requestPasswordReset(email);
      setMessage(
        result.message ??
          "If this address can be registered, password reset instructions have been sent.",
      );
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          "Could not request a password reset. Please try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Reset your password"
      description="Enter your account email and we’ll send a secure reset link if the address is registered."
    >
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
          Email address
          <Input
            autoComplete="email"
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        {message && (
          <p
            className="text-sm text-emerald-800 dark:text-emerald-200"
            role="status"
          >
            {message}
          </p>
        )}
        <FormError>{error}</FormError>
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted dark:text-slate-400">
        <Link
          className="font-semibold text-brand-700 dark:text-brand-300"
          to="/auth/login"
        >
          Return to sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setStatus("submitting");
    try {
      await resetPassword(token, password);
      navigate("/auth/login", {
        replace: true,
        state: {
          notice:
            "Your password has been reset. Sign in with your new password.",
        },
      });
    } catch (requestError) {
      setStatus("ready");
      setError(
        apiErrorMessage(
          requestError,
          "This reset link is invalid or expired. Request a new one.",
        ),
      );
    }
  }

  return (
    <AuthFrame
      title="Choose a new password"
      description="Set a new password for your InvoiceFlow account."
    >
      {!token ? (
        <FormError>
          This password reset link is missing or expired. Request a new link to
          continue.
        </FormError>
      ) : (
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block space-y-2 text-sm font-medium text-ink dark:text-slate-100">
            New password
            <Input
              autoComplete="new-password"
              autoFocus
              maxLength={72}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <span className="block text-xs font-normal text-muted dark:text-slate-400">
              Use at least 12 characters.
            </span>
          </label>
          <FormError>{error}</FormError>
          <Button
            className="w-full"
            disabled={status === "submitting" || !token}
            type="submit"
          >
            {status === "submitting" ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

function VerifyEmailPage() {
  const started = useRef(false);
  const [token] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("token"),
  );
  const [status, setStatus] = useState(() => (token ? "verifying" : "error"));
  const [message, setMessage] = useState(() =>
    token
      ? "Checking your verification link…"
      : "This verification link is missing or has expired.",
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    if (!token) {
      return;
    }
    verifyEmail(token)
      .then(() => {
        setStatus("verified");
        setMessage("Your email is verified. You can sign in now.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(
          apiErrorMessage(
            error,
            "This verification link is invalid or expired.",
          ),
        );
      });
  }, [token]);

  return (
    <AuthFrame
      title={status === "verified" ? "Email verified" : "Verify your email"}
      description={message}
    >
      {status === "verifying" && (
        <p
          role="status"
          className="mt-6 text-sm text-muted dark:text-slate-400"
        >
          Please wait…
        </p>
      )}
      {status !== "verifying" && (
        <div className="mt-6">
          {status === "error" && <FormError>{message}</FormError>}
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
            to="/auth/login"
          >
            Continue to sign in
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}

export function AuthPage({ mode }) {
  if (mode === "register") return <RegisterPage />;
  if (mode === "verify-email") return <VerifyEmailPage />;
  if (mode === "forgot-password") return <ForgotPasswordPage />;
  if (mode === "reset-password") return <ResetPasswordPage />;
  return <LoginPage />;
}
