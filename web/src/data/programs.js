// Loyalty programs: airline miles and the bank points that transfer into them.
//
// value   — what we think one point is worth on a typical redemption, in cents. Used to
//           decide whether spending points beats paying cash, and to total the wallet.
// rate    — airline programs only: cents per point you usually get when the award is priced
//           off the cash fare (Southwest, JetBlue, Delta and most domestic awards now work
//           this way). Used to estimate points for a fare when we don't have award data.
// floor   — the fewest points an award on that program normally costs.
// portal  — bank programs only: cents per point when you book through the bank's travel site.
// to      — bank programs only: airline programs you can transfer to, and the ratio.
//
// Valuations and partners move. Last reviewed October 2026; the app always says "about".
export const PROGRAMS = {
  AA: { code: "AA", kind: "airline", name: "AAdvantage", owner: "American", value: 1.5, rate: 1.35, floor: 7500 },
  DL: { code: "DL", kind: "airline", name: "SkyMiles", owner: "Delta", value: 1.15, rate: 1.15, floor: 5000 },
  UA: { code: "UA", kind: "airline", name: "MileagePlus", owner: "United", value: 1.3, rate: 1.25, floor: 5000 },
  WN: { code: "WN", kind: "airline", name: "Rapid Rewards", owner: "Southwest", value: 1.4, rate: 1.4, floor: 1000 },
  AS: { code: "AS", kind: "airline", name: "Atmos Rewards", owner: "Alaska & Hawaiian", value: 1.45, rate: 1.4, floor: 4500 },
  B6: { code: "B6", kind: "airline", name: "TrueBlue", owner: "JetBlue", value: 1.35, rate: 1.35, floor: 1500 },
  F9: { code: "F9", kind: "airline", name: "Frontier Miles", owner: "Frontier", value: 1.0, rate: 1.1, floor: 5000 },
  NK: { code: "NK", kind: "airline", name: "Free Spirit", owner: "Spirit", value: 0.9, rate: 1.0, floor: 2500 },
  AC: { code: "AC", kind: "airline", name: "Aeroplan", owner: "Air Canada", value: 1.5, rate: 1.5, floor: 6000 },
  BA: { code: "BA", kind: "airline", name: "Avios", owner: "British Airways, Iberia, Aer Lingus", value: 1.4, rate: 1.2, floor: 4500 },
  AFKL: { code: "AFKL", kind: "airline", name: "Flying Blue", owner: "Air France-KLM", value: 1.3, rate: 1.25, floor: 7500 },
  VS: { code: "VS", kind: "airline", name: "Flying Club", owner: "Virgin Atlantic", value: 1.4, rate: 1.3, floor: 7500 },

  UR: { code: "UR", kind: "bank", name: "Ultimate Rewards", owner: "Chase", value: 1.8, portal: 1.0,
        to: { UA: 1, WN: 1, B6: 1, AC: 1, BA: 1, AFKL: 1, VS: 1 } },
  MR: { code: "MR", kind: "bank", name: "Membership Rewards", owner: "American Express", value: 1.8, portal: 1.0,
        to: { DL: 1, AC: 1, BA: 1, AFKL: 1, VS: 1, B6: 0.8 } },
  TY: { code: "TY", kind: "bank", name: "ThankYou Points", owner: "Citi", value: 1.7, portal: 1.0,
        to: { AA: 1, B6: 1, AFKL: 1, VS: 1 } },
  C1: { code: "C1", kind: "bank", name: "Capital One Miles", owner: "Capital One", value: 1.7, portal: 1.0,
        to: { AC: 1, BA: 1, AFKL: 1, VS: 1, B6: 0.6 } },
  BILT: { code: "BILT", kind: "bank", name: "Bilt Points", owner: "Bilt", value: 1.8, portal: 1.0,
        to: { AA: 1, UA: 1, AS: 1, AC: 1, BA: 1, AFKL: 1, VS: 1 } },
  WF: { code: "WF", kind: "bank", name: "Wells Fargo Rewards", owner: "Wells Fargo", value: 1.4, portal: 1.0,
        to: { BA: 1, AFKL: 1 } },
};

export const AIRLINE_PROGRAMS = Object.values(PROGRAMS).filter((p) => p.kind === "airline");
export const BANK_PROGRAMS = Object.values(PROGRAMS).filter((p) => p.kind === "bank");

/** "American AAdvantage", "Frontier Miles" (not "Frontier Frontier Miles"). */
export const programLabel = (code) => {
  const p = PROGRAMS[code];
  if (!p) return code;
  const owner = p.owner.split(",")[0].split(" & ")[0];
  return p.name.startsWith(owner.split(" ")[0]) ? p.name : `${owner} ${p.name}`;
};

/** Seats.aero source names -> our program codes. */
export const AWARD_SOURCES = {
  american: "AA", delta: "DL", united: "UA", alaska: "AS", jetblue: "B6",
  aeroplan: "AC", flyingblue: "AFKL", virginatlantic: "VS",
};

/** Bank programs that can move points into `airlineProgram`, with the ratio. */
export const transfersInto = (airlineProgram) =>
  BANK_PROGRAMS.filter((b) => b.to[airlineProgram]).map((b) => ({ bank: b, ratio: b.to[airlineProgram] }));
