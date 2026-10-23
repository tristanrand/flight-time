import { useEffect, useState } from "react";
import AirportPicker from "../components/AirportPicker.jsx";
import { local, supabase, useRows, useUser } from "../lib.js";
import { go } from "../router.js";

const CABINS = [
  ["economy", "Economy"],
  ["premium_economy", "Premium economy"],
  ["business", "Business"],
  ["first", "First"],
];

export default function Account({ route }) {
  const user = useUser();
  const next = route.query.next;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState("");
  const [travelers, reloadTravelers] = useRows("travelers", (q) => q.order("created_at"));

  // came here to sign in on the way somewhere else: go back once signed in
  useEffect(() => {
    if (user && next) go(next.startsWith("/") ? next : `/${next}`, null, { replace: true });
    else if (!user && next) local.set("afterSignIn", next);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data ?? { id: user.id }));
  }, [user?.id]);

  async function send(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // the session comes back in the URL hash, so the return route waits in localStorage (see App)
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function saveProfile(patch) {
    const p = { ...profile, ...patch };
    setProfile(p);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: p.display_name ?? null, home_airport: p.home_airport || null, preferred_cabin: p.preferred_cabin ?? "economy" });
    setSaved(error ? error.message : "Saved.");
    setTimeout(() => setSaved(""), 1800);
  }

  if (user === undefined) return <section className="page" />;

  if (!user)
    return (
      <section className="page narrow">
        <h1 className="page-title">Sign in</h1>
        <p className="lede">Save trips and get alerts, book fares, and keep your miles in one place.</p>
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

  return (
    <section className="page narrow">
      <h1 className="page-title">Account</h1>
      <p>Signed in as <strong>{user.email}</strong>.</p>

      {profile && (
        <>
          <h2 className="section-title">Preferences</h2>
          <div className="miles-form">
            <label className="field grow">
              <span>Your name</span>
              <input defaultValue={profile.display_name ?? ""} onBlur={(e) => saveProfile({ display_name: e.target.value.trim() || null })} />
            </label>
            <AirportPicker label="Home airport" value={profile.home_airport ?? ""} onChange={(c) => c.length === 3 && saveProfile({ home_airport: c })} className="grow" />
            <label className="field">
              <span>Usual cabin</span>
              <select value={profile.preferred_cabin ?? "economy"} onChange={(e) => saveProfile({ preferred_cabin: e.target.value })}>
                {CABINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          {saved && <p className="ok">{saved}</p>}
        </>
      )}

      <h2 className="section-title">Saved travelers</h2>
      {travelers?.length ? (
        <ul className="plain travelers">
          {travelers.map((t) => (
            <li key={t.id}>
              <span>
                <b>{t.given_name} {t.family_name}</b>
                <small>Born {new Date(`${t.born_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{t.is_self ? " · you" : ""}</small>
              </span>
              <button
                className="linkish remove"
                onClick={async () => {
                  await supabase.from("travelers").delete().eq("id", t.id);
                  reloadTravelers();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">Travelers you book for are saved here so checkout fills itself in next time.</p>
      )}

      <div className="actions">
        <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </section>
  );
}
