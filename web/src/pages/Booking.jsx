import { useEffect, useState } from "react";
import { Flaps } from "../components/Board.jsx";
import { airport } from "../data/airports.js";
import { programLabel } from "../data/programs.js";
import { fmtPoints } from "../points.js";
import { call, duration, money, supabase, useUser, wallClock, wallDay } from "../lib.js";

const WORDS = {
  pending_payment: ["Waiting for payment", "As soon as your card goes through, we ask the airline to issue your ticket."],
  paid: ["Payment received", "The airline is issuing your ticket. This usually takes under a minute."],
  ticketed: ["You're booked", "Your ticket is issued and your flights are in My trips. We'll watch them and tell you about any change."],
  failed: ["The airline didn't confirm", "You haven't been charged for a ticket. Any payment is being refunded to your card automatically."],
  cancelled: ["Not booked", "This booking was stopped before payment. Nothing was charged."],
  handoff: ["Finish with your points", "Your trip is priced and saved. Book the award on the program's site, then save the flights from Track so we can watch them for you."],
};

export default function Booking({ route }) {
  const id = route.parts[1];
  const user = useUser();
  const [b, setB] = useState(null);
  const [err, setErr] = useState("");
  const [handoff, setHandoff] = useState(null);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => (error ? setErr(error.message) : data ? setB(data) : setErr("We couldn't find that booking on this account.")));
    const ch = supabase
      .channel(`booking-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, (p) => setB(p.new))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, id]);

  // the award site for a points hand-off comes from the server, never from the address bar
  useEffect(() => {
    if (b?.status !== "handoff") return;
    call("booking", { action: "confirm", booking_id: id }).then((r) => setHandoff(r.handoff_url ?? null)).catch(() => {});
  }, [b?.status]);

  // back from Stripe: confirm the payment ourselves in case the webhook is slow
  useEffect(() => {
    if (!b || b.status !== "pending_payment" || !route.query.paid) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await call("booking", { action: "confirm", booking_id: id }).catch(() => null);
      if (r?.booking) setB(r.booking);
      if (n > 20 || (r?.booking && r.booking.status !== "pending_payment")) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [b?.status]);

  if (user === null) return <section className="page"><h1 className="page-title">Booking</h1><p className="empty">Sign in to see this booking.</p><a className="btn" href="#/account">Sign in</a></section>;
  if (err) return <section className="page"><a className="back" href="#/trips">My trips</a><h1 className="page-title">Booking</h1><p className="error">{err}</p></section>;
  if (!b) return <section className="page"><h1 className="page-title">Booking</h1><p className="empty">Loading…</p></section>;

  const [title, body] = WORDS[b.status] ?? [b.status, ""];
  const o = b.offer;

  return (
    <section className="page booking-page">
      <a className="back" href="#/trips">My trips</a>
      {b.provider === "demo" && <p className="note">Sample booking. The confirmation code is pretend and nothing was charged.</p>}
      <p className="eyebrow">{o.owner.name} · booked {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
      <h1 className="page-title">{title}</h1>
      <p className="lede">{body}</p>

      {b.booking_reference && (
        <div className="board pnr">
          <div className="board-cell">
            <span className="board-key">Confirmation</span>
            <Flaps text={b.booking_reference} width={6} tone="landed" />
          </div>
          <div className="board-cell">
            <span className="board-key">Airline</span>
            <Flaps text={o.owner.code} width={2} />
          </div>
        </div>
      )}

      {b.status === "handoff" && handoff && (
        <div className="panel handoff">
          <p>
            You chose to pay with <b>{fmtPoints(b.points_amount)} {programLabel(b.points_program)}</b>. Search the same flights there: {o.slices.map((s) => `${s.origin}–${s.destination} ${wallDay(s.segments[0].departing_at)}`).join(", ")}.
          </p>
          <a className="btn" href={handoff} target="_blank" rel="noopener">Open {programLabel(b.points_program)}</a>
        </div>
      )}

      <div className="booking-grid">
        <div>
          {o.slices.map((s, k) => (
            <div key={k} className="panel">
              <h2>{k === 0 ? "Outbound" : "Return"} · {wallDay(s.segments[0].departing_at)}</h2>
              {s.segments.map((x, j) => (
                <a key={j} className="sum-seg linkrow" href={`#/flight/${x.carrier}${x.flight_number}`}>
                  <b>{wallClock(x.departing_at)} {x.origin}</b>
                  <span>{x.carrier}{x.flight_number} · {duration(x.duration_minutes)} · {airport(x.destination)?.city ?? x.destination}</span>
                  <b>{wallClock(x.arriving_at)} {x.destination}</b>
                </a>
              ))}
            </div>
          ))}
        </div>
        <aside>
          <div className="panel">
            <h2>Travelers</h2>
            <ul className="plain">
              {b.passengers.map((p, i) => <li key={i}>{p.given_name} {p.family_name}</li>)}
            </ul>
            <dl className="price-break">
              {b.pay_with === "points" ? (
                <div className="total"><dt>Points</dt><dd>{fmtPoints(b.points_amount)}</dd></div>
              ) : (
                <div className="total"><dt>Paid</dt><dd>{money(b.total_amount, true)}</dd></div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}
