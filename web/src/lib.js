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
let cachedUser;
const listeners = new Set();
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    cachedUser = data.session?.user ?? null;
    listeners.forEach((f) => f(cachedUser));
  });
  supabase.auth.onAuthStateChange((_e, s) => {
    cachedUser = s?.user ?? null;
    listeners.forEach((f) => f(cachedUser));
  });
} else cachedUser = null;

export function useUser() {
  const [user, setUser] = useState(cachedUser);
  useEffect(() => {
    listeners.add(setUser);
    setUser(cachedUser);
    return () => listeners.delete(setUser);
  }, []);
  return user; // undefined while loading
}

/** Rows from a table the signed-in user owns; reloads when `deps` change. */
export function useRows(table, build = (q) => q, deps = []) {
  const user = useUser();
  const [rows, setRows] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user || !supabase) return setRows(user === null ? [] : null);
    let stop = false;
    build(supabase.from(table).select("*")).then(({ data }) => !stop && setRows(data ?? []));
    return () => {
      stop = true;
    };
  }, [user?.id, tick, ...deps]);
  return [rows, () => setTick((t) => t + 1)];
}

/** Small persistent preferences that don't need an account (recent searches, last radar view). */
export const local = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(`ft:${k}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`ft:${k}`, JSON.stringify(v));
    } catch {}
  },
};

export function remember(kind, item, max = 8) {
  const key = `recent:${kind}`;
  const list = local.get(key, []).filter((x) => JSON.stringify(x) !== JSON.stringify(item));
  local.set(key, [item, ...list].slice(0, max));
}

/** Re-render on a timer, for countdowns and "updated 2 min ago". */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------- formatting ---------- */

/** "2:45 PM" in the airport's local time when we know it, otherwise the device's. */
export const clock = (iso, timeZone) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) })
    : "—";

/** "14:05", for the departure board. */
export const clock24 = (iso, timeZone) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, ...(timeZone ? { timeZone } : {}) })
    : "--:--";

export const day = (iso, timeZone) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) }) : "";

export const longDay = (iso, timeZone) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...(timeZone ? { timeZone } : {}) }) : "";

/** Local wall-clock offer times ("2026-12-03T08:15:00") shown as-is, no time zone shifting. */
export const wallClock = (s) => {
  if (!s) return "—";
  const [h, m] = s.slice(11, 16).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const wallDay = (s) => (s ? new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");

export const money = (n, cents = false) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export const duration = (min) => {
  if (min == null || Number.isNaN(min)) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/** "in 2h 10m", "3d 4h", "now" */
export const until = (iso, now = Date.now()) => {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  const min = Math.round(Math.abs(ms) / 60000);
  const txt = min < 1 ? "now" : min < 60 ? `${min}m` : min < 1440 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
  return ms >= 0 ? txt : `${txt} ago`;
};

export const ago = (iso, now = Date.now()) => {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return day(iso);
};

/** on-time | delayed | cancelled | landed | scheduled | airborne — drives color on the board. */
export function tone(f) {
  if (!f) return "scheduled";
  if (f.cancelled || /cancel/i.test(f.status ?? "")) return "cancelled";
  if (f.diverted || /divert/i.test(f.status ?? "")) return "delayed";
  if (f.actual_in || f.actual_on || /arrived|landed/i.test(f.status ?? "")) return "landed";
  if ((delayOf(f) ?? 0) >= 15 || /delay/i.test(f.status ?? "")) return "delayed";
  if (f.actual_out || /en route|taxiing|left gate/i.test(f.status ?? "")) return "airborne";
  return "scheduled";
}

/** The delay that matters now: arrival once it's moving, departure before. */
export function delayOf(f) {
  if (!f) return 0;
  if (f.actual_out && f.arrival_delay_minutes != null) return f.arrival_delay_minutes;
  if (f.departure_delay_minutes != null) return f.departure_delay_minutes;
  return f.delay_minutes ?? 0;
}

export const toneLabel = {
  scheduled: "On time",
  airborne: "In the air",
  delayed: "Delayed",
  cancelled: "Cancelled",
  landed: "Landed",
};

/** Plain-language status line, the way a gate agent would say it. */
export function statusLine(f) {
  const t = tone(f);
  const d = delayOf(f);
  if (t === "cancelled") return "Cancelled";
  if (f.diverted) return "Diverted";
  if (f.actual_in) return d >= 15 ? `Arrived ${d}m late` : d <= -5 ? `Arrived ${-d}m early` : "Arrived on time";
  if (f.actual_on) return "Landed, taxiing to the gate";
  if (f.actual_off) return d >= 15 ? `In the air, ${d}m late` : "In the air, on time";
  if (f.actual_out) return "Left the gate";
  if (d >= 15) return `Delayed ${d}m`;
  return "On time";
}

export const nextMonths = (n = 12) => {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      short: d.toLocaleDateString("en-US", { month: "short" }),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

export const monthName = (ym) => (ym ? new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) : "");

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
