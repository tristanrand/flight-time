import { useEffect, useState } from "react";
import { supabase, useUser } from "../lib.js";

// The programs most US travelers hold. More can be added by typing a name.
export const PROGRAMS = [
  { code: "AA", name: "American AAdvantage" },
  { code: "DL", name: "Delta SkyMiles" },
  { code: "UA", name: "United MileagePlus" },
  { code: "WN", name: "Southwest Rapid Rewards" },
  { code: "AS", name: "Alaska Mileage Plan" },
  { code: "B6", name: "JetBlue TrueBlue" },
  { code: "F9", name: "Frontier Miles" },
  { code: "NK", name: "Spirit Free Spirit" },
];

const blank = { airline_code: "AA", member_number: "", balance: "", elite_tier: "" };

export default function Miles({ go }) {
  const user = useUser();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState("");

  const load = () =>
    supabase.from("loyalty_accounts").select("*").order("balance", { ascending: false, nullsFirst: false }).then(({ data }) => setRows(data ?? []));

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    const p = PROGRAMS.find((x) => x.code === form.airline_code);
    const { error } = await supabase.from("loyalty_accounts").insert({
      user_id: user.id,
      airline_code: form.airline_code,
      program: p?.name ?? form.airline_code,
      member_number: form.member_number.trim() || null,
      balance: form.balance === "" ? null : Number(String(form.balance).replace(/[^\d]/g, "")),
      elite_tier: form.elite_tier.trim() || null,
    });
    if (error) return setErr(error.message);
    setForm(blank);
    load();
  }

  if (user === undefined) return <section className="page" />;
  if (!user)
    return (
      <section className="page">
        <h1 className="page-title">Miles</h1>
        <p className="empty">Sign in to keep every airline's miles in one place and earn them on fares you find here.</p>
        <button className="btn" onClick={() => go("account")}>Sign in</button>
      </section>
    );

  const total = (rows ?? []).reduce((s, r) => s + (r.balance ?? 0), 0);

  return (
    <section className="page">
      <h1 className="page-title">Miles</h1>
      {rows?.length > 0 && (
        <p className="miles-total">
          <strong>{total.toLocaleString()}</strong> miles across {rows.length} {rows.length === 1 ? "program" : "programs"}
        </p>
      )}
      <ul className="miles-list">
        {rows?.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.program}</strong>
              <span>
                {r.member_number ? `#${r.member_number}` : "No member number"}
                {r.elite_tier ? ` · ${r.elite_tier}` : ""}
              </span>
            </div>
            <div className="miles-bal">{r.balance != null ? r.balance.toLocaleString() : "—"}</div>
            <button
              className="linkish remove"
              onClick={async () => {
                await supabase.from("loyalty_accounts").delete().eq("id", r.id);
                load();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Add a program</h2>
      <form className="miles-form" onSubmit={add}>
        <label className="field">
          <span>Airline</span>
          <select value={form.airline_code} onChange={(e) => setForm({ ...form, airline_code: e.target.value })}>
            {PROGRAMS.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Member number</span>
          <input value={form.member_number} onChange={(e) => setForm({ ...form, member_number: e.target.value })} autoComplete="off" />
        </label>
        <label className="field">
          <span>Balance</span>
          <input value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} inputMode="numeric" placeholder="Optional" />
        </label>
        <label className="field">
          <span>Status</span>
          <input value={form.elite_tier} onChange={(e) => setForm({ ...form, elite_tier: e.target.value })} placeholder="e.g. Gold" />
        </label>
        <button className="btn">Add program</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      <p className="fine">Automatic balance syncing from your airline accounts is coming. For now, add balances by hand.</p>
    </section>
  );
}
