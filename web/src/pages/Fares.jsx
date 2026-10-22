import { useEffect, useState } from "react";
import { call, day, duration, money, nextMonths, supabase, useUser } from "../lib.js";

const months = nextMonths(12);

export default function Fares({ go, initial }) {
  const user = useUser();
  const [origin, setOrigin] = useState(initial?.origin ?? "OKC");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [month, setMonth] = useState(months[1].value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [miles, setMiles] = useState([]);
  const [watched, setWatched] = useState("");

  // frequent-flyer numbers to paste in at checkout, so bookings still earn miles
  useEffect(() => {
    if (!user || !supabase) return;
    supabase.from("loyalty_accounts").select("airline_code, program, member_number").then(({ data }) => setMiles(data ?? []));
  }, [user]);

  async function search(e) {
    e?.preventDefault();
    setErr("");
    setWatched("");
    setBusy(true);
    try {
      setResult(await call("fare-search", { origin, destination, month }));
    } catch (e) {
      setResult(null);
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function watch() {
    if (!user) return go("account");
    const cheapest = result?.fares?.[0]?.price ?? null;
    const { error } = await supabase.from("price_watches").insert({
      user_id: user.id,
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      depart_month: month,
      last_price: cheapest,
      last_checked_at: new Date().toISOString(),
    });
    setWatched(error ? error.message : "Watching this route. You'll see price drops in My trips.");
  }

  const memberFor = (code) => miles.find((m) => m.airline_code === code && m.member_number);

  return (
    <section className="page">
      <h1 className="page-title">Cheapest fares</h1>
      <form className="fare-form" onSubmit={search}>
        <label className="field">
          <span>From</span>
          <input value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} maxLength={3} placeholder="OKC" required />
        </label>
        <button
          type="button"
          className="swap"
          aria-label="Swap airports"
          onClick={() => {
            setOrigin(destination);
            setDestination(origin);
          }}
        >
          ⇄
        </button>
        <label className="field">
          <span>To</span>
          <input value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} maxLength={3} placeholder="LAS" required />
        </label>
        <label className="field grow">
          <span>Leaving in</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <button className="btn" disabled={busy}>{busy ? "Searching…" : "Search fares"}</button>
      </form>

      {result?.demo && <p className="note">Showing sample fares. Real prices turn on once the Travelpayouts token is added.</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {result && (
        <>
          {result.fares.length === 0 ? (
            <p className="empty">No recent fares for this route and month. Try a nearby airport or a different month.</p>
          ) : (
            <ol className="fares">
              {result.fares.map((f, i) => {
                const m = memberFor(f.airline);
                return (
                  <li key={i} className="fare">
                    <div className="fare-price">{money(f.price)}</div>
                    <div className="fare-main">
                      <strong>{f.airline} {f.flight_number}</strong>
                      <span>
                        {day(f.departure_at)} · {f.transfers ? `${f.transfers} stop` : "Nonstop"}
                        {f.duration_minutes ? ` · ${duration(f.duration_minutes)}` : ""}
                      </span>
                      {m && <span className="earn">Earn miles: add {m.program} #{m.member_number} at checkout</span>}
                    </div>
                    <a className="btn btn-small" href={f.book_url} target="_blank" rel="noopener sponsored">Book</a>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="fine">
            Prices are the lowest travelers found recently and are confirmed on the booking site. We earn a small commission when you book; you pay the same fare.
          </p>
          <button className="btn btn-quiet" onClick={watch}>{user ? "Watch this route for price drops" : "Sign in to watch prices"}</button>
          {watched && <p className="ok">{watched}</p>}
        </>
      )}

      {!result && !err && !busy && <p className="empty">Pick where you're flying and roughly when. We'll show the cheapest days first.</p>}
    </section>
  );
}
