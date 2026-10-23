import { useEffect, useMemo, useState } from "react";
import { AIRLINES, airlineName } from "../data/airlines.js";
import { airport } from "../data/airports.js";
import { PROGRAMS, programLabel } from "../data/programs.js";
import { fmtPoints, pointsOptions } from "../points.js";
import { call, duration, money, supabase, until, useNow, useRows, useUser, wallClock, wallDay } from "../lib.js";
import { go } from "../router.js";

const blankPax = { given_name: "", family_name: "", born_on: "", gender: "", title: "", email: "", phone_number: "", loyalty: null };

export default function Checkout({ route }) {
  const id = route.parts[1] ?? "";
  const user = useUser();
  const now = useNow(1000);
  const [wallet] = useRows("loyalty_accounts");
  const [saved] = useRows("travelers", (q) => q.order("is_self", { ascending: false }));
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  const [pax, setPax] = useState([]);
  const [payWith, setPayWith] = useState("card");
  const [pickKey, setPickKey] = useState(null);
  const [agree, setAgree] = useState(false);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call("booking", { action: "offer", offer_id: id })
      .then((x) => {
        setR(x);
        setPax(x.offer.passengers.map(() => ({ ...blankPax })));
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  const offer = r?.offer;
  const program = offer ? AIRLINES[offer.owner.code]?.program : null;

  // first traveler defaults to "me" and everyone gets their frequent-flyer number filled in
  useEffect(() => {
    if (!saved?.length || !pax.length || pax[0].given_name) return;
    fill(0, saved.find((t) => t.is_self) ?? saved[0]);
  }, [saved, pax.length]);

  const fill = (i, t) =>
    setPax((list) =>
      list.map((p, k) =>
        k === i
          ? { ...p, given_name: t.given_name, family_name: t.family_name, born_on: t.born_on, gender: t.gender, title: t.title ?? "", email: t.email ?? "", phone_number: t.phone ?? "", traveler_id: t.id }
          : p,
      ),
    );

  // the account holder's own frequent-flyer number only goes on their own ticket
  const selfId = saved?.find((t) => t.is_self)?.id;
  const firstIsMe = pax[0] && (pax[0].traveler_id ? pax[0].traveler_id === selfId : !saved?.length);
  const member = useMemo(() => (firstIsMe ? wallet?.find((w) => w.airline_code === program && w.member_number) : null), [wallet, program, firstIsMe]);
  const pts = useMemo(() => {
    if (!offer) return null;
    const segs = offer.slices.reduce((n, s) => n + s.segments.length, 0);
    const a = airport(offer.slices[0].origin), b = airport(offer.slices[0].destination);
    return pointsOptions({ price: offer.total_amount, airline: offer.owner.code, segments: segs, intl: !!(a && b && a.country !== b.country), wallet: wallet?.length ? wallet : null });
  }, [offer, wallet]);

  const keyOf = (o) => (o ? o.kind + o.program : null);
  const pointsPick = pts?.options.find((o) => keyOf(o) === pickKey) ?? pts?.best ?? pts?.options[0] ?? null;

  const set = (i, k, v) => setPax((list) => list.map((p, n) => (n === i ? { ...p, [k]: v } : p)));

  async function submit(e) {
    e.preventDefault();
    if (!user) return go("/account", { next: location.hash.slice(1) });
    setErr("");
    setBusy(true);
    try {
      const passengers = pax.map((p, i) => ({
        ...p,
        email: p.email || user.email,
        phone_number: p.phone_number || pax[0].phone_number,
        loyalty: i === 0 && member ? { airline: offer.owner.code, number: member.member_number } : p.loyalty,
      }));
      const res = await call("booking", {
        action: "checkout",
        offer_id: offer.id,
        passengers,
        pay_with: payWith,
        points_program: payWith === "points" ? pointsPick?.into ?? pointsPick?.program : null,
        points_amount: payWith === "points" ? pointsPick?.points : null,
      });
      // save travelers only once the booking went through, so a retry doesn't save them twice
      if (keep) {
        for (const p of passengers) {
          if (p.traveler_id) continue;
          await supabase.from("travelers").insert({
            user_id: user.id,
            given_name: p.given_name,
            family_name: p.family_name,
            born_on: p.born_on,
            gender: p.gender,
            title: p.title || null,
            email: p.email || null,
            phone: p.phone_number || null,
            is_self: !saved?.length && p === passengers[0],
          });
        }
      }
      if (res.pay_url) {
        location.href = res.pay_url; // Stripe's own checkout page; card details never touch this app
        return;
      }
      if (res.handoff_url) window.open(res.handoff_url, "_blank", "noopener");
      go(`/booking/${res.booking.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (err && !offer)
    return (
      <section className="page">
        <a className="back" href="#/fly">Back to fares</a>
        <h1 className="page-title">Checkout</h1>
        <p className="error" role="alert">{err}</p>
      </section>
    );
  if (!offer) return <section className="page"><h1 className="page-title">Checkout</h1><p className="empty">Checking the latest price with the airline…</p></section>;

  const expired = offer.expires_at && new Date(offer.expires_at) < now;
  const fee = r.service_fee ?? 0;
  const total = offer.total_amount + fee;

  return (
    <section className="page checkout">
      <a className="back" href="#" onClick={(e) => (e.preventDefault(), history.back())}>Back to results</a>
      {r.demo && <p className="note">Sample fare. Booking completes instantly with a pretend confirmation code, so you can try the whole flow. Nothing is charged.</p>}
      {offer.test_mode && <p className="note">Duffel test mode: this books a test ticket, not a real one.</p>}
      {route.query.cancelled && <p className="warn">Payment was cancelled. Nothing was charged; your details are still here.</p>}
      <p className="eyebrow">Checkout</p>
      <h1 className="page-title">
        {airport(offer.slices[0].origin)?.city ?? offer.slices[0].origin} <span className="to">to</span> {airport(offer.slices[0].destination)?.city ?? offer.slices[0].destination}
      </h1>

      <div className="checkout-grid">
        <form onSubmit={submit} className="checkout-form">
          {user === null && (
            <p className="signin-first">
              <a className="btn btn-small" href={`#/account?next=${encodeURIComponent(location.hash.slice(1))}`}>Sign in</a>
              Sign in first so your trip, alerts and travelers are saved. It takes one email.
            </p>
          )}
          <h2 className="section-title">Who's flying</h2>
          <p className="fine">Names must match each traveler's government ID exactly.</p>
          {pax.map((p, i) => (
            <fieldset key={i} className="pax">
              <legend>
                Traveler {i + 1}
                {saved?.length > 0 && (
                  <select aria-label="Use a saved traveler" value={p.traveler_id ?? ""} onChange={(e) => e.target.value && fill(i, saved.find((t) => t.id === e.target.value))}>
                    <option value="">Saved travelers…</option>
                    {saved.map((t) => <option key={t.id} value={t.id}>{t.given_name} {t.family_name}</option>)}
                  </select>
                )}
              </legend>
              <div className="pax-grid">
                <label className="field"><span>First and middle names</span><input value={p.given_name} onChange={(e) => set(i, "given_name", e.target.value)} autoComplete={i === 0 ? "given-name" : "off"} required /></label>
                <label className="field"><span>Last name</span><input value={p.family_name} onChange={(e) => set(i, "family_name", e.target.value)} autoComplete={i === 0 ? "family-name" : "off"} required /></label>
                <label className="field"><span>Date of birth</span><input type="date" value={p.born_on} onChange={(e) => set(i, "born_on", e.target.value)} autoComplete={i === 0 ? "bday" : "off"} required /></label>
                <label className="field">
                  <span>Gender on ID</span>
                  <select value={p.gender} onChange={(e) => set(i, "gender", e.target.value)} required>
                    <option value="" disabled>Choose</option>
                    <option value="f">Female</option>
                    <option value="m">Male</option>
                  </select>
                </label>
                {i === 0 && (
                  <>
                    <label className="field"><span>Email for the ticket</span><input type="email" value={p.email || user?.email || ""} onChange={(e) => set(i, "email", e.target.value)} autoComplete="email" required /></label>
                    <label className="field"><span>Mobile, with country code</span><input type="tel" value={p.phone_number} onChange={(e) => set(i, "phone_number", e.target.value)} placeholder="+1 405 555 0123" autoComplete="tel" required /></label>
                  </>
                )}
              </div>
              {i === 0 && member && (
                <p className="earn">Earning {programLabel(program)} miles on #{member.member_number}</p>
              )}
            </fieldset>
          ))}
          {user && <label className="toggle"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Save travelers for faster checkout next time</label>}

          <h2 className="section-title">Pay with</h2>
          <div className="pay-options" role="radiogroup">
            <label className={`pay-opt${payWith === "card" ? " on" : ""}`}>
              <input type="radio" name="pay" checked={payWith === "card"} onChange={() => setPayWith("card")} />
              <span>
                <strong>Card</strong>
                <small>{r.card_payments ? "Secure checkout by Stripe. Apple Pay and Google Pay work too." : "Card payments aren't switched on yet."}</small>
              </span>
              <b>{money(total, true)}</b>
            </label>
            {pts?.options.length > 0 && (
              <label className={`pay-opt${payWith === "points" ? " on" : ""}`}>
                <input type="radio" name="pay" checked={payWith === "points"} onChange={() => setPayWith("points")} />
                <span>
                  <strong>Points</strong>
                  <small>{pts.cashWins ? "Cash is the better deal on this fare, but it's your call." : "Use miles or card points instead of cash."}</small>
                </span>
                <b>{pointsPick ? fmtPoints(pointsPick.points) : ""}</b>
              </label>
            )}
          </div>

          {payWith === "points" && (
            <div className="points-pick">
              {pts.options.map((o) => {
                const enough = !wallet?.length || o.balance >= o.points;
                return (
                  <label key={keyOf(o)} className={`pp${keyOf(pointsPick) === keyOf(o) ? " on" : ""}${!enough ? " short" : ""}`}>
                    <input type="radio" name="pp" checked={keyOf(pointsPick) === keyOf(o)} onChange={() => setPickKey(keyOf(o))} />
                    <span>
                      <strong>{fmtPoints(o.points)} {o.kind === "portal" ? `${PROGRAMS[o.program].owner} points` : programLabel(o.program)}</strong>
                      <small>{o.detail ?? (o.exact ? "award price" : "estimated from the fare")}{o.taxes ? ` · plus ${money(o.taxes, true)} taxes` : ""}</small>
                    </span>
                    <em>{wallet?.length ? (enough ? `you have ${fmtPoints(o.balance)}` : `short: you have ${fmtPoints(o.balance)}`) : `${o.cpp.toFixed(1)}¢/pt`}</em>
                  </label>
                );
              })}
              <p className="fine">
                {r.demo
                  ? "On sample fares, points bookings complete here so you can see the flow."
                  : "Airlines don't let other apps spend your miles yet. We'll hold these details and send you to the program's own site to finish the award with them, prefilled where they allow it."}
              </p>
            </div>
          )}

          <label className="toggle agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            Names match IDs, and I accept {offer.owner.name}'s fare rules: {offer.refundable ? "refundable" : "non-refundable"}, {offer.changeable ? "changes allowed" : "no changes"}.
          </label>

          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn btn-big" disabled={busy || expired || !agree || (payWith === "card" && !r.card_payments)}>
            {!user ? "Sign in to book" : busy ? "Booking…" : payWith === "card" ? `Pay ${money(total, true)}` : r.demo ? "Book with points" : "Continue to the airline"}
          </button>
          {expired && <p className="warn">This price expired. <a href="#/fly">Search again</a> for the latest fare.</p>}
        </form>

        <aside className="checkout-side">
          <div className="panel summary">
            <h2>{airlineName(offer.owner.code)} · {offer.fare_brand ?? offer.cabin.replace("_", " ")}</h2>
            {offer.slices.map((s, k) => (
              <div key={k} className="sum-slice">
                <p className="eyebrow">{k === 0 ? "Outbound" : "Return"} · {wallDay(s.segments[0].departing_at)}</p>
                {s.segments.map((x, j) => (
                  <div key={j} className="sum-seg">
                    <b>{wallClock(x.departing_at)} {x.origin}</b>
                    <span>{x.carrier}{x.flight_number} · {duration(x.duration_minutes)}{x.aircraft ? ` · ${x.aircraft}` : ""}</span>
                    <b>{wallClock(x.arriving_at)} {x.destination}</b>
                  </div>
                ))}
              </div>
            ))}
            <ul className="terms">
              <li>{offer.bags.carry_on ? "Carry-on included" : "No carry-on"}</li>
              <li>{offer.bags.checked ? `${offer.bags.checked} checked bag included` : "Checked bags extra"}</li>
              <li>{offer.refundable ? "Refundable" : "Non-refundable"}</li>
              <li>{offer.changeable ? (offer.change_fee ? `Changes for ${money(offer.change_fee)}` : "Free changes") : "No changes"}</li>
            </ul>
            <dl className="price-break">
              <div><dt>Fare</dt><dd>{money(offer.base_amount, true)}</dd></div>
              <div><dt>Taxes and fees</dt><dd>{money(offer.tax_amount, true)}</dd></div>
              {fee > 0 && <div><dt>Booking fee</dt><dd>{money(fee, true)}</dd></div>}
              <div className="total"><dt>Total{offer.passengers.length > 1 ? ` for ${offer.passengers.length}` : ""}</dt><dd>{money(total, true)}</dd></div>
            </dl>
            {offer.expires_at && !expired && <p className="fine">Price held for {until(offer.expires_at, now)}.</p>}
          </div>
          <p className="fine">
            Tickets are issued by {offer.owner.name} through our booking partner Duffel. You'll get the airline's confirmation code by email, and the flights go straight into My trips.
          </p>
        </aside>
      </div>
    </section>
  );
}
