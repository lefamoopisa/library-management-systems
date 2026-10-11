import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Navigate } from "react-router-dom";
import { verifyPassword } from "../utils/passwords.js";

export default function LoginPage({ legacyUsers, currentUser, onLogin, onRegister, onMigrateLegacy }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountRole, setAccountRole] = useState("Librarian");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) return <Navigate to="/" replace />;

  function changeMode() {
    setMode((currentMode) => currentMode === "login" ? "register" : "login");
    setError("");
    setPassword("");
    setConfirmPassword("");
    setAccountRole("Librarian");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      try {
        await onLogin({ email: email.trim().toLowerCase(), password });
      } catch (cause) {
        const legacyUser = cause.status === 401
          ? legacyUsers.find((entry) => entry.email?.toLowerCase() === email.trim().toLowerCase())
          : null;
        if (!legacyUser || !(await verifyPassword(password, legacyUser.passwordSalt, legacyUser.passwordHash))) throw cause;
        await onMigrateLegacy({ ...legacyUser, password });
      }
    } catch (cause) {
      setError(cause.message || "We couldn't verify your sign-in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("The passwords don't match. Please check both fields.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setIsSubmitting(true);
    try {
      await onRegister({ name: name.trim(), email: normalizedEmail, password, role: accountRole });
    } catch (cause) {
      setError(cause.message || "We couldn't create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">{mode === "register" ? "JOIN THE COMMUNITY" : "WELCOME BACK"}</p>
        {mode === "register" && <h1>Create your library account.</h1>}
        {mode === "register" && <p className="login-copy">{accountRole === "Librarian" ? "Create a librarian account to manage books, members, and supplier orders." : "Sign up as a member to browse and buy available books."}</p>}

        {mode === "login" && (
          <form className="form-stack login-form" onSubmit={handleLogin}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="fullname@gmail.com" required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : <>Sign in <ArrowRight size={17} /></>}</button>
          </form>
        )}

        {mode === "register" && (
          <form className="form-stack login-form" onSubmit={handleRegister}>
            <label>Enter your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required maxLength={100} /></label>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="fullname@gmail.com" required maxLength={254} /></label>
            <label>Account type<select value={accountRole} onChange={(event) => setAccountRole(event.target.value)}><option value="Librarian">Librarian</option><option value="Member">Member</option></select></label>
            <label>Create a password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
            <label>Verify your password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : <>Create account <ArrowRight size={17} /></>}</button>
          </form>
        )}

        <div className="login-mode-actions">
          {mode === "login" && <button type="button" className="login-mode-link login-mode-link--prominent" onClick={changeMode}>New here? Create an account</button>}
          {mode === "register" && <button type="button" className="login-mode-link" onClick={changeMode}>Already have an account? Sign in</button>}
        </div>
      </section>
    </main>
  );
}
