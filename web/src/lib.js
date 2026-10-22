import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Publishable key: safe in the browser. Row-level security decides what each user can read or write.
export const supabase = URL && KEY ? createClient(URL, KEY) : null;
export const configured = !!supabase;

/** Call an edge function. Throws an Error carrying the function's own message. */
export async function call(fn, body) {
  if (!supabase) throw new Error("The app isn't connected to its database yet.");
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return data;
}

/** The signed-in user, or null. Re-renders on sign-in and sign-out. */
export function useUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    if (!supabase) return setUser(null);
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user; // undefined while loading
}

/* ---------- formatting ---------- */

/** "2:45 PM" in the airport's local time when we know it, otherwise the device's. */
export const clock = (iso, timeZone) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) })
    : "—";

export const day = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

export const money = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);

export const duration = (min) => {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/** on-time | delayed | cancelled | landed | scheduled — drives color on the board. */
export function tone(f) {
  if (!f) return "scheduled";
  if (f.cancelled) return "cancelled";
  if (f.diverted) return "delayed";
  if (f.actual_in || /arrived|landed/i.test(f.status ?? "")) return "landed";
  if ((f.delay_minutes ?? 0) >= 15 || /delay/i.test(f.status ?? "")) return "delayed";
  if (f.actual_out || /en route/i.test(f.status ?? "")) return "airborne";
  return "scheduled";
}

export const toneLabel = {
  scheduled: "On schedule",
  airborne: "In the air",
  delayed: "Delayed",
  cancelled: "Cancelled",
  landed: "Landed",
};

export const nextMonths = (n = 12) => {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};
