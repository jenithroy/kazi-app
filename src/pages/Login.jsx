import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth as firebaseAuth, firebasePersistenceReady } from "../firebase";
import { authClient, authRedirectUrl } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { landingPath } from "../components/RequireSection";
import { clearRecoveryLink, isRecoveryPending } from "../lib/recoveryLink";

function Login() {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [newPassword, setNewPass]   = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError]           = useState("");
  const [notice, setNotice]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [resetSent, setResetSent]   = useState(false);
  // "login" | "reset" | "newPassword". Someone arriving on a reset link starts
  // on the new-password form — decided at first render, because waiting for an
  // effect gives the redirect below a frame in which to send them elsewhere.
  const [mode, setMode]             = useState(() => (isRecoveryPending() ? "newPassword" : "login"));
  const navigate  = useNavigate();
  const location  = useLocation();
  const { authenticated, profile, error: authError } = useAuth();

  useEffect(() => {
    // Only leave the login screen once the session has resolved to a real,
    // active person — a bare token is not a login. Testing that too loosely is
    // what let a leftover session push straight through to the dashboard.
    //
    // The exception is mid-reset: following a recovery link signs you in before
    // the new password exists, so stay put until it is set.
    if (!authenticated || mode === "newPassword") return;
    // Back to whatever they were trying to reach, else the first page their
    // position opens. If that original page turns out to be one they may not
    // see, the section guard says so plainly rather than bouncing them.
    const from = location.state?.from?.pathname;
    navigate(from || landingPath(profile) || "/dashboard", { replace: true });
  }, [authenticated, profile, mode, navigate, location]);

  // A password-reset link comes back to the app as a recovery session. Catch it
  // and show the "choose a new password" form instead of the sign-in form.
  useEffect(() => {
    const { data } = authClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("newPassword");
        setError("");
      }
    });
    return () => data?.subscription?.unsubscribe();
  }, []);

  /**
   * Two credential stores, one login box.
   *
   * Supabase is tried first because that is where everyone is heading. Anyone
   * who has not set a Supabase password yet still has their Firebase one, so a
   * failure there falls through rather than rejecting them. The database
   * accepts either token and resolves both to the same person.
   *
   * The error message is deliberately the same either way — saying which store
   * recognised the address would confirm to a stranger that it is a real one.
   */
  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const { error: supaError } = await authClient.auth.signInWithPassword({ email, password });

      if (supaError) {
        try {
          // Make sure session-scoped persistence is applied before a session
          // exists, so this login cannot outlive the browser session.
          await firebasePersistenceReady;
          await signInWithEmailAndPassword(firebaseAuth, email, password);
        } catch {
          setError("Incorrect email or password. Please try again.");
          return;
        }
      }

      // Deliberately no navigate() here. The credentials being right is only
      // half of it — AuthContext still has to resolve them to an active person,
      // and if it cannot it signs the token straight back out. Navigating now
      // would land on a page that immediately bounces back. The effect above
      // moves us on once `authenticated` actually turns true; until then the
      // button stays in its loading state.
      setNotice("Signing you in…");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email) { setError("Enter your email address above first."); return; }
    setError("");
    setLoading(true);
    try {
      const { error: err } = await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl("/login"),
      });
      // An unknown address still reports success — see the note above. But a
      // refusal from Supabase is a different thing entirely, and swallowing it
      // told people to go and check an inbox nothing had been sent to. The
      // usual culprit is the hourly cap on the built-in mail service.
      if (err) {
        setError(
          err.status === 429 || /rate limit/i.test(err.message || "")
            ? "Too many reset emails just now. Wait an hour and try again."
            : err.message || "Couldn't send the reset email. Try again shortly."
        );
        return;
      }
      setResetSent(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Those two passwords don't match."); return; }
    setLoading(true);
    try {
      const { error: err } = await authClient.auth.updateUser({ password: newPassword });
      if (err) { setError(err.message || "Couldn't set your password. Try the reset link again."); return; }
      setNotice("Password updated. Signing you in…");
      // The link has done its job; a later visit is an ordinary login again.
      clearRecoveryLink();
      // Leaving newPassword mode releases the guard in the effect above, which
      // then routes to a page this person can actually open.
      setMode("login");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError("");
    setNotice("");
    setResetSent(false);
    setPassword("");
  }

  return (
    <section className="login-screen">
      <div className="login-card">

        {/* Logo */}
        <div className="login-logo-wrap">
          <img src="/kazi - logo - white-01.png" alt="KAZI Manufacturing" className="login-logo" />
        </div>
        <p>Secure portal for Nepal and UK operations teams.</p>

        {/* ── Sign In ── */}
        {mode === "login" && (
          <form onSubmit={handleSignIn} className="stack-form">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@gmail.com"
                autoComplete="email"
              />
            </label>

            <div className="login-pw-wrap">
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                className="login-forgot-link"
                onClick={() => switchMode("reset")}
              >
                Forgot password?
              </button>
            </div>

            {/* authError covers the case where the password was right but the
                account resolves to no active staff record — AuthContext signs
                that token back out, so without this the form would just sit
                there looking like nothing happened. */}
            {(error || authError) && <p className="form-error">{error || authError}</p>}
            {!error && !authError && notice && <p className="login-reset-ok-sub">{notice}</p>}

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}

        {/* ── Forgot Password ── */}
        {mode === "reset" && (
          <form onSubmit={handleReset} className="stack-form">
            {resetSent ? (
              <div className="login-reset-ok">
                <div className="login-reset-ok-ico">✓</div>
                <p className="login-reset-ok-title">Check your inbox</p>
                <p className="login-reset-ok-sub">
                  If <strong>{email}</strong> has an account, a reset link is on its way.
                  Check your spam folder if you don't see it.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  style={{ marginTop: 6 }}
                  onClick={() => switchMode("login")}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <div className="login-reset-hd">
                  <p className="login-reset-title">Reset your password</p>
                  <p className="login-reset-sub">
                    Enter your email and we'll send you a reset link.
                  </p>
                </div>

                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@gmail.com"
                    autoFocus
                    autoComplete="email"
                  />
                </label>

                {error && <p className="form-error">{error}</p>}

                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>

                <button
                  type="button"
                  className="login-back-link"
                  onClick={() => switchMode("login")}
                >
                  ← Back to Sign In
                </button>
              </>
            )}
          </form>
        )}

        {/* ── Choose a new password (arrived via reset link) ── */}
        {mode === "newPassword" && (
          <form onSubmit={handleNewPassword} className="stack-form">
            <div className="login-reset-hd">
              <p className="login-reset-title">Choose a new password</p>
              <p className="login-reset-sub">
                At least 8 characters. You'll use this to sign in from now on.
              </p>
            </div>

            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPass(e.target.value)}
                required
                placeholder="••••••••"
                autoFocus
                autoComplete="new-password"
              />
            </label>

            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>

            {error  && <p className="form-error">{error}</p>}
            {notice && <p className="login-reset-ok-sub">{notice}</p>}

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Saving…" : "Set Password"}
            </button>

            <button
              type="button"
              className="login-back-link"
              onClick={() => switchMode("login")}
            >
              ← Back to Sign In
            </button>
          </form>
        )}

      </div>
    </section>
  );
}

export default Login;
