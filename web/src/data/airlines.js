// Airlines by IATA code, with the ICAO callsign prefix (for radar) and the
// loyalty program that earns on them.
const RAW = [
  // code, icao, name, alliance, program
  ["AA", "AAL", "American", "oneworld", "AA"],
  ["DL", "DAL", "Delta", "SkyTeam", "DL"],
  ["UA", "UAL", "United", "Star Alliance", "UA"],
  ["WN", "SWA", "Southwest", null, "WN"],
  ["AS", "ASA", "Alaska", "oneworld", "AS"],
  ["HA", "HAL", "Hawaiian", "oneworld", "AS"],
  ["B6", "JBU", "JetBlue", null, "B6"],
  ["F9", "FFT", "Frontier", null, "F9"],
  ["NK", "NKS", "Spirit", null, "NK"],
  ["G4", "AAY", "Allegiant", null, null],
  ["SY", "SCX", "Sun Country", null, null],
  ["MX", "MXY", "Breeze", null, null],
  ["OO", "SKW", "SkyWest", null, null],
  ["YX", "RPA", "Republic", null, null],
  ["MQ", "ENY", "Envoy", "oneworld", "AA"],
  ["9E", "EDV", "Endeavor", "SkyTeam", "DL"],
  ["OH", "JIA", "PSA", "oneworld", "AA"],
  ["QX", "QXE", "Horizon", "oneworld", "AS"],
  ["AC", "ACA", "Air Canada", "Star Alliance", "AC"],
  ["WS", "WJA", "WestJet", null, null],
  ["AM", "AMX", "Aeroméxico", "SkyTeam", "DL"],
  ["Y4", "VOI", "Volaris", null, null],
  ["CM", "CMP", "Copa", "Star Alliance", "UA"],
  ["AV", "AVA", "Avianca", "Star Alliance", null],
  ["LA", "LAN", "LATAM", null, null],
  ["BA", "BAW", "British Airways", "oneworld", "BA"],
  ["VS", "VIR", "Virgin Atlantic", "SkyTeam", "VS"],
  ["AF", "AFR", "Air France", "SkyTeam", "AFKL"],
  ["KL", "KLM", "KLM", "SkyTeam", "AFKL"],
  ["LH", "DLH", "Lufthansa", "Star Alliance", null],
  ["LX", "SWR", "Swiss", "Star Alliance", null],
  ["IB", "IBE", "Iberia", "oneworld", "BA"],
  ["EI", "EIN", "Aer Lingus", null, "BA"],
  ["TP", "TAP", "TAP Air Portugal", "Star Alliance", null],
  ["FI", "ICE", "Icelandair", null, null],
  ["TK", "THY", "Turkish", "Star Alliance", null],
  ["EK", "UAE", "Emirates", null, null],
  ["QR", "QTR", "Qatar", "oneworld", null],
  ["EY", "ETD", "Etihad", null, null],
  ["JL", "JAL", "Japan Airlines", "oneworld", "AA"],
  ["NH", "ANA", "ANA", "Star Alliance", "UA"],
  ["KE", "KAL", "Korean Air", "SkyTeam", "DL"],
  ["CX", "CPA", "Cathay Pacific", "oneworld", "AA"],
  ["SQ", "SIA", "Singapore", "Star Alliance", null],
  ["QF", "QFA", "Qantas", "oneworld", "AA"],
  ["NZ", "ANZ", "Air New Zealand", "Star Alliance", "UA"],
];

export const AIRLINES = Object.fromEntries(
  RAW.map(([code, icao, name, alliance, program]) => [code, { code, icao, name, alliance, program }]),
);
const byIcao = Object.fromEntries(RAW.map(([code, icao]) => [icao, code]));

export const airlineName = (code) => AIRLINES[code]?.name ?? code ?? "";

/** "AAL1234" -> { airline: "AA", number: "1234", ident: "AA1234" } when it's an airline callsign. */
export function fromCallsign(cs) {
  const m = String(cs ?? "").trim().toUpperCase().match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (!m || !byIcao[m[1]]) return null;
  return { airline: byIcao[m[1]], number: m[2], ident: `${byIcao[m[1]]}${m[2]}` };
}
