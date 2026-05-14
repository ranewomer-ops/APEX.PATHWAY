export function SetupScreen() {
  return (
    <div className="login-screen">
      <div className="setup-card">
        <p className="eyebrow">Configuration</p>
        <h2>Supabase connection required</h2>
        <p className="muted-copy">
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.
        </p>
        <p className="muted-copy">
          Run <code>supabase/schema.sql</code> in the Supabase SQL editor before logging in.
        </p>
      </div>
    </div>
  );
}
