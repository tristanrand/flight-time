import { useState } from "react";
import { AIRLINE_PROGRAMS, BANK_PROGRAMS, PROGRAMS, programLabel } from "../data/programs.js";
import { fmtPoints } from "../points.js";
import { call, money, supabase, useRows, useUser } from "../lib.js";

const blank = { airline_code: "AA", member_number: "", balance: "", elite_tier: "", expires_on: "" };
const num = (s) => (s === "" || s == null ? null : Number(String(s).replace(/[^\d]/g, "")));
const daysUntil = (d) => Math.round((new Date(`${d}T12:00:00`) - Date.now()) / 86400_000);

export default function Wallet() {
  const user = useUser();
  const [rows, reload] = useRows("loyalty_accounts", (q) => q.order("balance", { ascending: false, nullsFirst: false }));
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [sync, setSync] = useState("");

  if (user === undefined) return <section className="page" />;
  if (!user)
    return (
      <section className="page">
        <p className="eyebrow">Wallet</p>
        <h1 className="page-title">Every mile, one place</h1>
        <p className="empty">
          Keep your airline miles and card points together, see what they're worth, and see every fare priced in them. Your member numbers go on every booking so you always earn.
        </p>
        <a className="btn" href="#/account?next=/wallet">Sign in</a>
      </section>
    );

  async function add(e) {
    e.preventDefault();
    setErr("");
    const p = PROGRAMS[form.airline_code];
    const { error } = await supabase.from("loyalty_accounts").insert({
      user_id: user.id,
      airline_code: form.airline_code,
      program: programLabel(form.airline_code),
      member_number: form.member_number.trim() || null,
      balance: num(form.balance),
      elite_tier: form.elite_tier.trim() || null,
      expires_on: form.expires_on || null,
      source: "manual",
    });
    if (error) return setErr(error.message);
    setForm({ ...blank, airline_code: p?.kind === "bank" ? "UR" : "AA" });
    reload();
  }

  async function saveBalance(r, v) {
    await supabase.from("loyalty_accounts").update({ balance: num(v), synced_at: new Date().toISOString() }).eq("id", r.id);
    setEditing(null);
    reload();
  }

  async function connect() {
    setSync("Checking…");
    try {
      const r = await call("loyalty-sync", {});
      setSync(r.message ?? (r.connected ? "Synced." : "Not connected yet."));
    } catch (e) {
      setSync(e.message);
    }
  }

  const list = rows ?? [];
  const value = list.reduce((s, r) => s + ((r.balance ?? 0) * (PROGRAMS[r.airline_code]?.value ?? 1)) / 100, 0);
  const points = list.reduce((s, r) => s + (r.balance ?? 0), 0);
  const expiring = list.filter((r) => r.expires_on && daysUntil(r.expires_on) <= 90);
  const airline = list.filter((r) => PROGRAMS[r.airline_code]?.kind !== "bank");
  const banks = list.filter((r) => PROGRAMS[r.airline_code]?.kind === "bank");
  const mine = new Set(list.map((r) => r.airline_code));

  const Row = ({ r }) => {
    const p = PROGRAMS[r.airline_code];
    return (
      <li className="wallet-row">
        <div className="wr-name">
          <strong>{p ? programLabel(p.code) : r.program}</strong>
          <span>
            {r.member_number ? `#${r.member_number}` : "No member number"}
            {r.elite_tier ? ` · ${r.elite_tier}` : ""}
            {r.expires_on ? ` · expires ${new Date(`${r.expires_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
          </span>
        </div>
        <div className="wr-bal">
          {editing === r.id ? (
            <form onSubmit={(e) => (e.preventDefault(), saveBalance(r, e.target.bal.value))}>
              <input name="bal" defaultValue={r.balance ?? ""} inputMode="numeric" autoFocus aria-label="New balance" />
              <button className="linkish small">Save</button>
            </form>
          ) : (
            <button className="bal-btn" onClick={() => setEditing(r.id)} title="Update balance">
              {r.balance != null ? r.balance.toLocaleString() : "Add balance"}
            </button>
          )}
          {r.balance != null && p && <small>about {money((r.balance * p.value) / 100)}</small>}
        </div>
        <button
          className="linkish remove"
          onClick={async () => {
            await supabase.from("loyalty_accounts").delete().eq("id", r.id);
            reload();
          }}
        >
          Remove
        </button>
      </li>
    );
  };

  return (
    <section className="page wallet-page">
      <p className="eyebrow">Wallet</p>
      <h1 className="page-title">Your miles and points</h1>

      {list.length > 0 && (
        <dl className="wallet-sum">
          <div><dt>Worth about</dt><dd>{money(value)}</dd></div>
          <div><dt>Points and miles</dt><dd>{fmtPoints(points)}</dd></div>
          <div><dt>Programs</dt><dd>{list.length}</dd></div>
        </dl>
      )}

      {expiring.length > 0 && (
        <div className="warn-box">
          {expiring.map((r) => (
            <p key={r.id}>
              <b>{programLabel(r.airline_code)}</b>: {fmtPoints(r.balance)} expire in {daysUntil(r.expires_on)} days. Earning or spending any amount usually resets the clock.
            </p>
          ))}
        </div>
      )}

      {airline.length > 0 && (
        <>
          <h2 className="section-title">Airline miles</h2>
          <ul className="wallet-list">{airline.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      )}
      {banks.length > 0 && (
        <>
          <h2 className="section-title">Card points</h2>
          <ul className="wallet-list">{banks.map((r) => <Row key={r.id} r={r} />)}</ul>
        </>
      )}

      {banks.length > 0 && (
        <>
          <h2 className="section-title">Where your card points can go</h2>
          <div className="transfer-map">
            {banks.map((r) => {
              const b = PROGRAMS[r.airline_code];
              return (
                <div key={r.id} className="panel">
                  <h2>{b.owner} {b.name}</h2>
                  <ul className="partners">
                    {Object.entries(b.to).map(([code, ratio]) => (
                      <li key={code} className={mine.has(code) ? "have" : ""}>
                        <span>{programLabel(code)}</span>
                        <b>{ratio === 1 ? "1:1" : `1:${ratio}`}</b>
                        <small>{r.balance ? `→ ${fmtPoints(Math.floor(r.balance * ratio))}` : ""}</small>
                      </li>
                    ))}
                  </ul>
                  <p className="fine">Or about {money((r.balance ?? 0) * b.portal / 100)} of any flight through {b.owner}'s travel site.</p>
                </div>
              );
            })}
          </div>
          <p className="fine">Transfers usually can't be undone, and partners change. Check the bank's site before you move points.</p>
        </>
      )}

      {airline.some((r) => r.balance) && (
        <>
          <h2 className="section-title">What your miles cover</h2>
          <ul className="covers">
            {airline.filter((r) => r.balance && PROGRAMS[r.airline_code]).map((r) => {
              const p = PROGRAMS[r.airline_code];
              return (
                <li key={r.id}>
                  <b>{money((r.balance * p.rate) / 100)}</b> of {p.owner.split(",")[0]} fares, roughly
                  <small>{fmtPoints(r.balance)} at about {p.rate}¢ a mile</small>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2 className="section-title">Add a program</h2>
      <form className="miles-form" onSubmit={add}>
        <label className="field grow">
          <span>Program</span>
          <select value={form.airline_code} onChange={(e) => setForm({ ...form, airline_code: e.target.value })}>
            <optgroup label="Airline miles">
              {AIRLINE_PROGRAMS.map((p) => <option key={p.code} value={p.code}>{programLabel(p.code)}</option>)}
            </optgroup>
            <optgroup label="Card points">
              {BANK_PROGRAMS.map((p) => <option key={p.code} value={p.code}>{p.owner} {p.name}</option>)}
            </optgroup>
          </select>
        </label>
        {PROGRAMS[form.airline_code]?.kind !== "bank" && (
          <label className="field">
            <span>Member number</span>
            <input value={form.member_number} onChange={(e) => setForm({ ...form, member_number: e.target.value })} autoComplete="off" />
          </label>
        )}
        <label className="field">
          <span>Balance</span>
          <input value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} inputMode="numeric" placeholder="e.g. 42,000" />
        </label>
        {PROGRAMS[form.airline_code]?.kind !== "bank" && (
          <label className="field">
            <span>Status</span>
            <input value={form.elite_tier} onChange={(e) => setForm({ ...form, elite_tier: e.target.value })} placeholder="e.g. Gold" />
          </label>
        )}
        <label className="field">
          <span>Expires</span>
          <input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
        </label>
        <button className="btn">Add</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}

      <div className="panel sync">
        <h2>Sync balances automatically</h2>
        <p>Connect AwardWallet once and your balances update on their own, including programs you forgot about.</p>
        <button className="btn btn-quiet" onClick={connect}>Connect AwardWallet</button>
        {sync && <p className="fine">{sync}</p>}
      </div>
      <p className="fine">Values are our estimate of what a point is usually worth, not a cash-out price.</p>
    </section>
  );
}
