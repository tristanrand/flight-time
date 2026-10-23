import { useEffect, useMemo, useRef, useState } from "react";
import AirportPicker from "../components/AirportPicker.jsx";
import DealMeter from "../components/DealMeter.jsx";
import PointsLine from "../components/PointsLine.jsx";
import PriceCalendar from "../components/PriceCalendar.jsx";
import { airlineName } from "../data/airlines.js";
import { airport } from "../data/airports.js";
import { AWARD_SOURCES, programLabel } from "../data/programs.js";
import { fmtPoints } from "../points.js";
import {
  call, day, duration, local, money, monthName, nextMonths, supabase, todayISO, useRows, useUser, wallClock, wallDay,
} from "../lib.js";
import { go, href } from "../router.js";

const months = nextMonths(12);
const CABINS = [
  ["economy", "Economy"],
  ["premium_economy", "Premium economy"],
  ["business", "Business"],
  ["first", "First"],
];

const isIntl = (o, d) => {
  const a = airport(o), b = airport(d);
  return !!(a && b && a.country !== b.country);
};

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function Fly({ route }) {
  const q = route.query;
  const user = useUser();
  const [wallet] = useRows("loyalty_accounts");
  const [from, setFrom] = useState(q.from ?? local.get("lastFrom", ""));
  const [to, setTo] = useState(q.to ?? "");
  const [trip, setTrip] = useState(q.ret ? "round" : q.trip ?? "oneway");
  const [when, setWhen] = useState(q.date ? "exact" : q.when ?? "flex");
  const [month, setMonth] = useState(q.month ?? q.date?.slice(0, 7) ?? months[1].value);
  const [date, setDate] = useState(q.date ?? "");
  const [ret, setRet] = useState(q.ret ?? "");
  const [adults, setAdults] = useState(Number(q.adults) || 1);
  const [cabin, setCabin] = useState(q.cabin ?? "economy");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fares, setFares] = useState(null); // month mode
  const [cal, setCal] = useState(null);
  const [awards, setAwards] = useState(null);
  const [offers, setOffers] = useState(null); // exact mode
  const [places, setPlaces] = useState(null); // explore
  const [demo, setDemo] = useState(false);
  const [watched, setWatched] = useState("");

  // filters for bookable offers
  const [nonstop, setNonstop] = useState(false);
  const [sort, setSort] = useState("price");
  const [only, setOnly] = useState(null);

  // the address we last wrote ourselves; any other change is a new search arriving by link
  const own = useRef(null);
  useEffect(() => {
    if (location.hash === own.current) return;
    if (own.current !== null) {
      setFrom(q.from ?? "");
      setTo(q.to ?? "");
      if (q.month) setMonth(q.month);
      if (q.date) (setDate(q.date), setWhen("exact"));
    }
    if (q.from && (q.to || q.explore)) run(null, { from: q.from, to: q.to ?? "", ...(q.month ? { month: q.month } : {}), ...(q.date ? { date: q.date, when: "exact", ret: q.ret ?? "" } : {}) });
    else own.current = location.hash;
  }, [JSON.stringify(q)]);

  async function run(e, override = {}) {
    e?.preventDefault();
    const s = { from, to, trip, when, month, date, ret, adults, cabin, ...override };
    setErr("");
    setWatched("");
    setFares(null);
    setCal(null);
    setAwards(null);
    setOffers(null);
    setPlaces(null);
    if (!s.from) return setErr("Pick where you're leaving from.");
    local.set("lastFrom", s.from);

    // keep the address bar shareable
    const query = {
      from: s.from, to: s.to,
      ...(s.when === "exact" ? { date: s.date, ret: s.trip === "round" ? s.ret : null } : { month: s.month, trip: s.trip === "round" ? "round" : null }),
      adults: s.adults > 1 ? s.adults : null, cabin: s.cabin !== "economy" ? s.cabin : null, explore: !s.to ? 1 : null,
    };
    own.current = href("/fly", query);
    if (location.hash !== own.current) go("/fly", query, { replace: true });

    setBusy(true);
    try {
      if (!s.to) {
        const r = await call("fare-search", { mode: "explore", origin: s.from, month: s.month });
        setDemo(!!r.demo);
        setPlaces(r.places ?? []);
      } else if (s.when === "exact") {
        if (!s.date) throw new Error("Pick a travel date.");
        if (s.trip === "round" && !s.ret) throw new Error("Pick a return date.");
        const slices = [{ origin: s.from, destination: s.to, departure_date: s.date }];
        if (s.trip === "round") slices.push({ origin: s.to, destination: s.from, departure_date: s.ret });
        const [r, c] = await Promise.all([
          call("booking", { action: "search", slices, adults: s.adults, cabin: s.cabin }),
          call("fare-search", { mode: "calendar", origin: s.from, destination: s.to, month: s.date.slice(0, 7) }).catch(() => null),
        ]);
        setDemo(!!r.demo);
        setOffers(r.offers ?? []);
        setCal(c);
      } else {
        const [r, c, a] = await Promise.all([
          call("fare-search", { origin: s.from, destination: s.to, month: s.month, return_month: s.trip === "round" ? s.month : null }),
          call("fare-search", { mode: "calendar", origin: s.from, destination: s.to, month: s.month }).catch(() => null),
          call("fare-search", { mode: "awards", origin: s.from, destination: s.to, month: s.month }).catch(() => null),
        ]);
        setDemo(!!r.demo);
        setFares(r);
        setCal(c);
        setAwards(a);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  /** Jump from a cheap day to live, bookable prices for it. */
  function priceDay(d) {
    setWhen("exact");
    setDate(d);
    const r = trip === "round" ? ret && ret > d ? ret : addDays(d, 4) : "";
    setRet(r);
    run(null, { when: "exact", date: d, ret: r });
  }

  async function watch() {
    if (!user) return go("/account", { next: location.hash.slice(1) });
    const m = when === "exact" ? date.slice(0, 7) : month;
    const target = prompt("Tell me when it drops below (optional, in dollars):", "");
    const { error } = await supabase.from("price_watches").insert({
      user_id: user.id,
      origin: from,
      destination: to,
      depart_month: m,
      target_price: target && !Number.isNaN(Number(target)) ? Number(target) : null,
      last_price: fares?.fares?.[0]?.price ?? offers?.[0]?.total_amount ?? null,
      last_checked_at: new Date().toISOString(),
    });
    setWatched(error ? error.message : `Watching ${from} to ${to} in ${monthName(m)}. Price drops show up in My trips.`);
  }

  const shown = useMemo(() => {
    if (!offers) return [];
    let list = offers.filter((o) => (!nonstop || o.slices.every((s) => s.stops === 0)) && (!only || o.owner.code === only));
    if (sort === "duration") list = [...list].sort((a, b) => a.slices.reduce((n, s) => n + s.duration_minutes, 0) - b.slices.reduce((n, s) => n + s.duration_minutes, 0));
    if (sort === "early") list = [...list].sort((a, b) => a.slices[0].segments[0].departing_at.localeCompare(b.slices[0].segments[0].departing_at));
    return list;
  }, [offers, nonstop, sort, only]);

  const carriers = useMemo(() => [...new Set((offers ?? []).map((o) => o.owner.code))], [offers]);
  const awardFor = (airline) => {
    const prog = Object.entries(AWARD_SOURCES).find(([, code]) => code === airline)?.[0];
    return prog ? awards?.awards?.find((a) => a.program === prog && a.cabin === cabin) : null;
  };

  return (
    <section className="page fly-page">
      <p className="eyebrow">Fares in cash and points</p>
      <h1 className="page-title">Find a flight</h1>

      <form className="fly-form" onSubmit={run}>
        <div className="fly-row">
          <AirportPicker label="From" value={from} onChange={setFrom} required className="grow" />
          <button
            type="button"
            className="swap"
            aria-label="Swap airports"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄
          </button>
          <AirportPicker label="To" value={to} onChange={setTo} placeholder="Anywhere" className="grow" />
        </div>

        <div className="fly-row">
          <div className="seg seg-small" role="radiogroup" aria-label="Trip">
            <button type="button" role="radio" aria-checked={trip === "oneway"} onClick={() => setTrip("oneway")}>One way</button>
            <button type="button" role="radio" aria-checked={trip === "round"} onClick={() => setTrip("round")}>Round trip</button>
          </div>
          <div className="seg seg-small" role="radiogroup" aria-label="Dates">
            <button type="button" role="radio" aria-checked={when === "flex"} onClick={() => setWhen("flex")}>Flexible</button>
            <button type="button" role="radio" aria-checked={when === "exact"} onClick={() => setWhen("exact")}>Exact dates</button>
          </div>
        </div>

        <div className="fly-row">
          {when === "flex" || !to ? (
            <label className="field grow">
              <span>Leaving in</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="field grow">
                <span>Depart</span>
                <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} required />
              </label>
              {trip === "round" && (
                <label className="field grow">
                  <span>Return</span>
                  <input type="date" value={ret} min={date || todayISO()} onChange={(e) => setRet(e.target.value)} required />
                </label>
              )}
            </>
          )}
          <label className="field">
            <span>Travelers</span>
            <select value={adults} onChange={(e) => setAdults(Number(e.target.value))}>
              {Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1} adult{i ? "s" : ""}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Cabin</span>
            <select value={cabin} onChange={(e) => setCabin(e.target.value)}>
              {CABINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className="btn" disabled={busy}>{busy ? "Searching…" : to ? "Search" : "Explore"}</button>
        </div>
      </form>

      {demo && <p className="note">Sample fares. Real prices turn on once the fare and booking keys are added.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {busy && <div className="searching" aria-live="polite"><span /> Checking airlines…</div>}

      {/* ---------- explore: anywhere from here ---------- */}
      {places && (
        <>
          <h2 className="section-title">Cheapest from {airport(from)?.city ?? from} in {monthName(month)}</h2>
          {places.length === 0 ? (
            <p className="empty">No recent fares out of {from} for that month. Try the next one.</p>
          ) : (
            <ol className="places">
              {places.map((p) => (
                <li key={p.destination}>
                  <button
                    className="place"
                    onClick={() => {
                      setTo(p.destination);
                      run(null, { to: p.destination, when: "flex" });
                      setWhen("flex");
                    }}
                  >
                    <b className="place-code">{p.destination}</b>
                    <span className="place-name">
                      {airport(p.destination)?.city ?? p.destination}
                      <small>{airlineName(p.airline)} · {day(p.departure_at)} · {p.transfers ? `${p.transfers} stop` : "nonstop"}</small>
                    </span>
                    <span className="place-price">{money(p.price)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {/* ---------- flexible month ---------- */}
      {fares && (
        <div className="flex-results">
          <div className="flex-side">
            <DealMeter stats={fares.stats} />
            {cal?.days && Object.keys(cal.days).length > 0 && (
              <>
                <h2 className="section-title">Cheapest day to leave</h2>
                <PriceCalendar month={month} days={cal.days} onPick={priceDay} />
                <p className="fine">Tap a day to see live, bookable prices for it.</p>
              </>
            )}
            {awards?.connected && awards.awards.length > 0 && (
              <div className="panel">
                <h2>Award seats this month</h2>
                <ul className="awards">
                  {awards.awards.slice(0, 8).map((a, i) => (
                    <li key={i}>
                      <b>{fmtPoints(a.miles)}</b> {programLabel(AWARD_SOURCES[a.program] ?? a.program)}
                      <small>{day(`${a.date}T12:00:00Z`)} · {a.cabin.replace("_", " ")}{a.direct ? " · nonstop" : ""}{a.taxes ? ` · + ${money(a.taxes, true)}` : ""}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex-main">
            <h2 className="section-title">Lowest fares travelers found</h2>
            {fares.fares.length === 0 ? (
              <p className="empty">No recent fares for this route and month. Try a nearby airport, a different month, or exact dates for live prices.</p>
            ) : (
              <ol className="fares">
                {fares.fares.map((f, i) => (
                  <li key={i} className="fare">
                    <div className="fare-price">{money(f.price)}</div>
                    <div className="fare-main">
                      <strong>{airlineName(f.airline)} {f.flight_number}</strong>
                      <span>
                        {day(f.departure_at)}{f.return_at ? ` – ${day(f.return_at)}` : ""} · {f.transfers ? `${f.transfers} stop` : "Nonstop"}
                        {f.duration_minutes ? ` · ${duration(f.duration_minutes)}` : ""}
                      </span>
                      <PointsLine price={f.price} airline={f.airline} segments={(f.transfers ?? 0) + 1} intl={isIntl(from, to)} wallet={wallet} award={awardFor(f.airline)} />
                    </div>
                    <div className="fare-acts">
                      <button className="btn btn-small" onClick={() => priceDay(f.departure_at.slice(0, 10))}>Live price</button>
                      <a className="linkish small" href={f.book_url} target="_blank" rel="noopener sponsored">or on Aviasales</a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="fine">
              These are the lowest prices travelers found recently. "Live price" checks the airline now and lets you book here. We may earn a commission on Aviasales bookings; you pay the same fare.
            </p>
            <button className="btn btn-quiet" onClick={watch}>{user ? "Watch this route" : "Sign in to watch prices"}</button>
            {watched && <p className="ok">{watched}</p>}
          </div>
        </div>
      )}

      {/* ---------- exact dates: bookable offers ---------- */}
      {offers && (
        <>
          {cal?.days && (
            <div className="day-strip" role="list" aria-label="Nearby days">
              {[-3, -2, -1, 0, 1, 2, 3].map((k) => {
                const d = addDays(date, k);
                const p = cal.days[d];
                if (d < todayISO()) return null;
                return (
                  <button key={d} role="listitem" className={`ds-day${k === 0 ? " is-selected" : ""}`} onClick={() => k && priceDay(d)}>
                    <span>{wallDay(d)}</span>
                    <b>{p ? money(p.price) : "—"}</b>
                  </button>
                );
              })}
            </div>
          )}

          <div className="offer-tools">
            <label className="toggle"><input type="checkbox" checked={nonstop} onChange={(e) => setNonstop(e.target.checked)} /> Nonstop only</label>
            <label className="field inline">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price">Cheapest</option>
                <option value="duration">Fastest</option>
                <option value="early">Earliest</option>
              </select>
            </label>
            {carriers.length > 1 && (
              <div className="chips small">
                <button className={`chip${!only ? " on" : ""}`} onClick={() => setOnly(null)}>All airlines</button>
                {carriers.map((c) => (
                  <button key={c} className={`chip${only === c ? " on" : ""}`} onClick={() => setOnly(only === c ? null : c)}>{airlineName(c)}</button>
                ))}
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="empty">{offers.length ? "Nothing matches those filters." : "No seats for sale on that date. Try a day either side."}</p>
          ) : (
            <ol className="offers">
              {shown.map((o) => (
                <li key={o.id} className="offer">
                  <div className="offer-legs">
                    {o.slices.map((s, k) => {
                      const a = s.segments[0], z = s.segments[s.segments.length - 1];
                      return (
                        <div key={k} className="offer-leg">
                          <span className="ol-times">
                            <b>{wallClock(a.departing_at)}</b>
                            <i aria-hidden="true" />
                            <b>{wallClock(z.arriving_at)}</b>
                            {z.arriving_at.slice(0, 10) !== a.departing_at.slice(0, 10) && <sup>+1</sup>}
                          </span>
                          <span className="ol-meta">
                            {s.origin}–{s.destination} · {duration(s.duration_minutes)} · {s.stops ? `${s.stops} stop in ${s.segments.slice(0, -1).map((x) => x.destination).join(", ")}` : "Nonstop"}
                            {k === 0 && o.slices.length > 1 ? "" : ""}
                          </span>
                          <span className="ol-flights">{s.segments.map((x) => `${x.carrier}${x.flight_number}`).join(" · ")}{a.aircraft ? ` · ${a.aircraft}` : ""}</span>
                        </div>
                      );
                    })}
                    <p className="offer-terms">
                      <b>{o.owner.name}</b> {o.fare_brand ?? ""} · {o.bags.checked ? `${o.bags.checked} checked bag` : "No checked bag"} · {o.refundable ? "Refundable" : o.changeable ? (o.change_fee ? `Changes ${money(o.change_fee)}` : "Free changes") : "No changes"}
                    </p>
                  </div>
                  <div className="offer-buy">
                    <div className="fare-price">{money(o.total_amount)}</div>
                    <small>{adults > 1 ? `total for ${adults}` : "per traveler"}, taxes in</small>
                    <PointsLine
                      price={o.total_amount / adults}
                      airline={o.owner.code}
                      segments={o.slices.reduce((n, s) => n + s.segments.length, 0)}
                      intl={isIntl(from, to)}
                      wallet={wallet}
                    />
                    <a className="btn btn-small" href={`#/checkout/${encodeURIComponent(o.id)}`}>Select</a>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button className="btn btn-quiet" onClick={watch}>{user ? "Watch this route" : "Sign in to watch prices"}</button>
          {watched && <p className="ok">{watched}</p>}
        </>
      )}

      {!busy && !err && !fares && !offers && !places && (
        <div className="fly-empty">
          <p className="empty">
            Pick where you're flying. Leave "To" empty to see the cheapest places to go. Flexible shows the cheapest days in a month; exact dates show seats you can book right here.
          </p>
        </div>
      )}
    </section>
  );
}
