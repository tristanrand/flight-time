// Hash routes, so the app works as static files on Vercel and every screen has a shareable link.
//   #/                       track hub        #/fly?from=OKC&to=LAS   fares
//   #/flight/AA100?id=…      one flight       #/checkout/<offer id>   checkout
//   #/airport/DFW            airport board    #/booking/<id>          booking confirmation
//   #/route/OKC/DFW          today's nonstops #/trips  #/wallet  #/account
//   #/radar                  live map
import { useEffect, useState } from "react";

// links from the first version of the app (#track, #fares, #miles) still land somewhere sensible
const LEGACY = { track: "/", fares: "/fly", trips: "/trips", miles: "/wallet", account: "/account" };

export function parse(hash = location.hash) {
  let h = hash.replace(/^#/, "");
  if (LEGACY[h]) h = LEGACY[h];
  if (!h.startsWith("/")) h = `/${h}`;
  const [path, qs = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { parts, page: parts[0] ?? "", query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function href(path, query) {
  const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== "")).toString() : "";
  return `#${path}${q ? `?${q}` : ""}`;
}

export function go(path, query, { replace = false } = {}) {
  const h = href(path, query);
  if (replace) history.replaceState(null, "", h);
  else history.pushState(null, "", h);
  dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener("hashchange", on);
    addEventListener("popstate", on);
    return () => {
      removeEventListener("hashchange", on);
      removeEventListener("popstate", on);
    };
  }, []);
  return r;
}
