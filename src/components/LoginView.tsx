import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { LogoMark } from "@/components/BootScreen";
import { useApexStore } from "@/state/apexStore";

export function LoginView() {
  const error = useApexStore((s) => s.error);
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice("Working...");
    try {
      await useApexStore.getState().login(username, password);
      setNotice("Logged in");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-grid">
        <section className="login-hero">
          <LogoMark />
          <div className="login-copy">
            <p className="eyebrow">Apex Pathway</p>
            <h1>Automotive build control for serious projects.</h1>
            <p>
              Track boosted builds, parts, budget, timeline, maintenance, and power estimates from one secure
              dashboard.
            </p>
          </div>
        </section>
        <section className="login-card">
          <p className="eyebrow">Secure access</p>
          <h2>Log in</h2>
          <p className="muted-copy">Admin-created accounts only. No public registration.</p>
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn primary" type="submit">
              <LogIn size={18} />
              Log in
            </button>
            {notice ? (
              <div className={/error|invalid|failed/i.test(notice) ? "notice error" : "notice"}>{notice}</div>
            ) : (
              <div className="notice" aria-live="polite" />
            )}
            {error ? <div className="notice error">{error}</div> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
