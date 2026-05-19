import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";

function Login() {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [resetSent, setResetSent]   = useState(false);
  const [mode, setMode]             = useState("login"); // "login" | "reset"
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    } catch {
      setError("Incorrect email or password. Please try again.");
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
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch {
      setError("Couldn't find an account with that email.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError("");
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

            {error && <p className="form-error">{error}</p>}

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
                  A password reset link was sent to <strong>{email}</strong>.
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

      </div>
    </section>
  );
}

export default Login;
