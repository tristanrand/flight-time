// What a cash fare would cost in points, and whether spending them is a good idea.
//
// Without real award data we estimate from the cash price: most US programs now price
// awards off the fare (WN, B6 and DL openly; AA and UA mostly). Real award seats from
// Seats.aero replace the estimate when the Seats.aero key is set (fare-search "awards").
import { AIRLINES } from "./data/airlines.js";
import { PROGRAMS, programLabel, transfersInto } from "./data/programs.js";

const round = (n, step) => Math.ceil(n / step) * step;

/** Government taxes and fees an award still owes: $5.60 per US segment; more abroad. */
export function awardTaxes(price, segments = 1, intl = false) {
  return intl ? Math.round(price * 0.12 + 5.6 * segments) : 5.6 * segments;
}

/**
 * Ways to pay for a fare with points, cheapest (by what the points are worth) first.
 * wallet: [{ airline_code, balance }] from loyalty_accounts. Unsigned users get every option.
 */
export function pointsOptions({ price, airline, segments = 1, intl = false, wallet = null, award = null }) {
  if (!price) return { options: [], best: null };
  const own = PROGRAMS[AIRLINES[airline]?.program ?? airline];
  const taxes = award?.taxes ?? awardTaxes(price, segments, intl);
  const has = (code) => wallet?.find((w) => w.airline_code === code)?.balance ?? 0;
  const options = [];

  if (own) {
    const points = award?.miles ?? Math.max(own.floor, round((price - taxes) / (own.rate / 100), own.rate >= 1.3 ? 100 : 500));
    options.push({
      kind: award ? "award" : "own",
      program: own.code,
      label: programLabel(own.code),
      points,
      taxes,
      cost: (points * own.value) / 100 + taxes,
      cpp: ((price - taxes) / points) * 100,
      balance: has(own.code),
      exact: !!award,
    });
    for (const { bank, ratio } of transfersInto(own.code)) {
      const bankPoints = round(points / ratio, 1000);
      if (wallet && !has(bank.code)) continue;
      options.push({
        kind: "transfer",
        program: bank.code,
        into: own.code,
        label: `${bank.owner} ${bank.name}`,
        detail: `transfer ${ratio === 1 ? "1:1" : `at ${ratio}`} to ${own.name}`,
        points: bankPoints,
        taxes,
        cost: (bankPoints * bank.value) / 100 + taxes,
        cpp: ((price - taxes) / bankPoints) * 100,
        balance: has(bank.code),
        exact: !!award,
      });
    }
  }

  // any bank's travel portal books any fare at a fixed rate, taxes included
  for (const bank of Object.values(PROGRAMS).filter((p) => p.kind === "bank")) {
    if (wallet && !has(bank.code)) continue;
    if (!wallet && bank.code !== "UR" && bank.code !== "MR") continue; // keep the anonymous list short
    const points = round(price / (bank.portal / 100), 100);
    options.push({
      kind: "portal",
      program: bank.code,
      label: `${bank.owner} travel portal`,
      detail: `${bank.portal}¢ a point, taxes included`,
      points,
      taxes: 0,
      cost: (points * bank.value) / 100,
      cpp: bank.portal,
      balance: has(bank.code),
      exact: false,
    });
  }

  options.sort((a, b) => a.cost - b.cost);
  const affordable = wallet ? options.filter((o) => o.balance >= o.points) : options;
  const best = affordable[0] ?? null;
  return { options, best, cashWins: best ? best.cost > price * 1.02 : true, taxes };
}

/** Short verdict a traveler can act on. */
export function verdict(o, price) {
  if (!o) return null;
  if (o.cost > price * 1.02) return "Pay cash. These points are worth more on another trip.";
  if (o.cpp >= (PROGRAMS[o.program]?.value ?? 1.2) * 1.15) return "Good use of points.";
  return "Fair use of points.";
}

export const fmtPoints = (n) => (n == null ? "—" : n >= 100000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
