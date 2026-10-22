import { useState } from "react";
import { supabase, useUser } from "../lib.js";

export default function Account() {
  const user = useUser();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function send(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  if (user === undefined) return <section className="page" />;

  if (user)
    return (
      <section className="page">
        <h1 className="page-title">Account</h1>
        <p>Signed in as <strong>{user.email}</strong>.</p>
        <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    );

  return (
    <section className="page">
      <h1 className="page-title">Sign in</h1>
      {sent ? (
        <p className="ok">Check {email} for a sign-in link. You can close this tab once you've tapped it.</p>
      ) : (
        <form className="search-row" onSubmit={send}>
          <label className="field grow">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <button className="btn">Email me a link</button>
        </form>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <p className="fine">No password. We'll email you a one-time link.</p>
    </section>
  );
}
