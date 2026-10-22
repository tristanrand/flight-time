// Sample data returned while API keys are not set yet, so the whole app can be
// clicked through before any sign-ups. Every demo response carries `demo: true`
// and the app shows a banner when it sees it.

const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

export function demoFlight(ident: string) {
  const code = ident.toUpperCase().replace(/\s+/g, "");
  return {
    demo: true,
    flights: [
      {
        fa_flight_id: `${code}-DEMO-1`,
        ident: code,
        ident_icao: code,
        operator: code.slice(0, 2),
        aircraft_type: "A321",
        origin: "OKC",
        origin_name: "Oklahoma City",
        destination: "DFW",
        destination_name: "Dallas-Fort Worth",
        scheduled_out: at(-0.6),
        estimated_out: at(-0.4),
        actual_out: at(-0.4),
        scheduled_in: at(0.3),
        estimated_in: at(0.45),
        actual_in: null,
        gate_origin: "12",
        terminal_origin: null,
        gate_destination: "C21",
        baggage_claim: "C14",
        status: "En Route / Delayed",
        progress_percent: 52,
        delay_minutes: 14,
        cancelled: false,
        diverted: false,
      },
    ],
    position: { latitude: 34.21, longitude: -97.2, altitude: 310, groundspeed: 412, heading: 168 },
    track: [
      [35.393, -97.601],
      [35.05, -97.5],
      [34.62, -97.35],
      [34.21, -97.2],
    ],
    route: { from: [35.393, -97.601], to: [32.897, -97.038] },
  };
}

export function demoFares(origin: string, destination: string, month: string) {
  const airlines = ["AA", "WN", "DL", "UA", "F9", "NK"];
  const base = 89;
  return {
    demo: true,
    currency: "usd",
    fares: Array.from({ length: 8 }, (_, i) => {
      const day = String(3 + i * 3).padStart(2, "0");
      return {
        origin,
        destination,
        price: base + ((i * 37) % 140),
        airline: airlines[i % airlines.length],
        flight_number: String(1000 + i * 113),
        departure_at: `${month}-${day}T0${6 + (i % 4)}:15:00-05:00`,
        return_at: null,
        transfers: i % 3 === 0 ? 1 : 0,
        duration_minutes: 70 + (i % 3) * 95,
        book_url: "https://www.aviasales.com/",
      };
    }).sort((a, b) => a.price - b.price),
  };
}
