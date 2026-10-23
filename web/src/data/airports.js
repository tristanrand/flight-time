// Airports travelers search for most: every large and medium US airport plus the
// international gateways people fly to from North America.
// [iata, icao, city, airport, country, lat, lon, time zone]
const RAW = [
  // ---- United States ----
  ["ABQ", "KABQ", "Albuquerque", "Albuquerque Sunport", "US", 35.04, -106.61, "America/Denver"],
  ["ANC", "PANC", "Anchorage", "Ted Stevens Anchorage", "US", 61.17, -149.99, "America/Anchorage"],
  ["ATL", "KATL", "Atlanta", "Hartsfield-Jackson", "US", 33.64, -84.43, "America/New_York"],
  ["AUS", "KAUS", "Austin", "Austin-Bergstrom", "US", 30.19, -97.67, "America/Chicago"],
  ["BDL", "KBDL", "Hartford", "Bradley Intl", "US", 41.94, -72.68, "America/New_York"],
  ["BHM", "KBHM", "Birmingham", "Birmingham-Shuttlesworth", "US", 33.56, -86.75, "America/Chicago"],
  ["BNA", "KBNA", "Nashville", "Nashville Intl", "US", 36.13, -86.68, "America/Chicago"],
  ["BOI", "KBOI", "Boise", "Boise Airport", "US", 43.56, -116.22, "America/Boise"],
  ["BOS", "KBOS", "Boston", "Logan Intl", "US", 42.37, -71.01, "America/New_York"],
  ["BUF", "KBUF", "Buffalo", "Buffalo Niagara", "US", 42.94, -78.73, "America/New_York"],
  ["BUR", "KBUR", "Burbank", "Hollywood Burbank", "US", 34.2, -118.36, "America/Los_Angeles"],
  ["BWI", "KBWI", "Baltimore", "BWI Marshall", "US", 39.18, -76.67, "America/New_York"],
  ["BZN", "KBZN", "Bozeman", "Bozeman Yellowstone", "US", 45.78, -111.15, "America/Denver"],
  ["CHS", "KCHS", "Charleston", "Charleston Intl", "US", 32.9, -80.04, "America/New_York"],
  ["CLE", "KCLE", "Cleveland", "Cleveland Hopkins", "US", 41.41, -81.85, "America/New_York"],
  ["CLT", "KCLT", "Charlotte", "Charlotte Douglas", "US", 35.21, -80.94, "America/New_York"],
  ["CMH", "KCMH", "Columbus", "John Glenn Columbus", "US", 39.998, -82.89, "America/New_York"],
  ["COS", "KCOS", "Colorado Springs", "Colorado Springs Airport", "US", 38.81, -104.7, "America/Denver"],
  ["CVG", "KCVG", "Cincinnati", "Cincinnati/Northern Kentucky", "US", 39.05, -84.67, "America/New_York"],
  ["DAL", "KDAL", "Dallas", "Love Field", "US", 32.85, -96.85, "America/Chicago"],
  ["DCA", "KDCA", "Washington", "Reagan National", "US", 38.85, -77.04, "America/New_York"],
  ["DEN", "KDEN", "Denver", "Denver Intl", "US", 39.86, -104.67, "America/Denver"],
  ["DFW", "KDFW", "Dallas-Fort Worth", "DFW Intl", "US", 32.9, -97.04, "America/Chicago"],
  ["DSM", "KDSM", "Des Moines", "Des Moines Intl", "US", 41.53, -93.66, "America/Chicago"],
  ["DTW", "KDTW", "Detroit", "Detroit Metro", "US", 42.21, -83.35, "America/Detroit"],
  ["ELP", "KELP", "El Paso", "El Paso Intl", "US", 31.81, -106.38, "America/Denver"],
  ["EWR", "KEWR", "Newark", "Newark Liberty", "US", 40.69, -74.17, "America/New_York"],
  ["FAT", "KFAT", "Fresno", "Fresno Yosemite", "US", 36.78, -119.72, "America/Los_Angeles"],
  ["FLL", "KFLL", "Fort Lauderdale", "Fort Lauderdale-Hollywood", "US", 26.07, -80.15, "America/New_York"],
  ["GEG", "KGEG", "Spokane", "Spokane Intl", "US", 47.62, -117.53, "America/Los_Angeles"],
  ["GRR", "KGRR", "Grand Rapids", "Gerald R. Ford", "US", 42.88, -85.52, "America/Detroit"],
  ["GSP", "KGSP", "Greenville", "Greenville-Spartanburg", "US", 34.9, -82.22, "America/New_York"],
  ["HNL", "PHNL", "Honolulu", "Daniel K. Inouye", "US", 21.32, -157.92, "Pacific/Honolulu"],
  ["HOU", "KHOU", "Houston", "Hobby", "US", 29.65, -95.28, "America/Chicago"],
  ["IAD", "KIAD", "Washington", "Dulles Intl", "US", 38.95, -77.46, "America/New_York"],
  ["IAH", "KIAH", "Houston", "Bush Intercontinental", "US", 29.99, -95.34, "America/Chicago"],
  ["ICT", "KICT", "Wichita", "Eisenhower National", "US", 37.65, -97.43, "America/Chicago"],
  ["IND", "KIND", "Indianapolis", "Indianapolis Intl", "US", 39.72, -86.29, "America/Indiana/Indianapolis"],
  ["JAX", "KJAX", "Jacksonville", "Jacksonville Intl", "US", 30.49, -81.69, "America/New_York"],
  ["JFK", "KJFK", "New York", "John F. Kennedy", "US", 40.64, -73.78, "America/New_York"],
  ["KOA", "PHKO", "Kona", "Ellison Onizuka Kona", "US", 19.74, -156.05, "Pacific/Honolulu"],
  ["LAS", "KLAS", "Las Vegas", "Harry Reid Intl", "US", 36.08, -115.15, "America/Los_Angeles"],
  ["LAX", "KLAX", "Los Angeles", "Los Angeles Intl", "US", 33.94, -118.41, "America/Los_Angeles"],
  ["LGA", "KLGA", "New York", "LaGuardia", "US", 40.78, -73.87, "America/New_York"],
  ["LGB", "KLGB", "Long Beach", "Long Beach Airport", "US", 33.82, -118.15, "America/Los_Angeles"],
  ["LIH", "PHLI", "Lihue", "Lihue Airport", "US", 21.98, -159.34, "Pacific/Honolulu"],
  ["LIT", "KLIT", "Little Rock", "Clinton National", "US", 34.73, -92.22, "America/Chicago"],
  ["MCI", "KMCI", "Kansas City", "Kansas City Intl", "US", 39.3, -94.71, "America/Chicago"],
  ["MCO", "KMCO", "Orlando", "Orlando Intl", "US", 28.43, -81.31, "America/New_York"],
  ["MDW", "KMDW", "Chicago", "Midway", "US", 41.79, -87.75, "America/Chicago"],
  ["MEM", "KMEM", "Memphis", "Memphis Intl", "US", 35.04, -89.98, "America/Chicago"],
  ["MIA", "KMIA", "Miami", "Miami Intl", "US", 25.8, -80.29, "America/New_York"],
  ["MKE", "KMKE", "Milwaukee", "Milwaukee Mitchell", "US", 42.95, -87.9, "America/Chicago"],
  ["MSN", "KMSN", "Madison", "Dane County Regional", "US", 43.14, -89.34, "America/Chicago"],
  ["MSP", "KMSP", "Minneapolis", "Minneapolis-St Paul", "US", 44.88, -93.22, "America/Chicago"],
  ["MSY", "KMSY", "New Orleans", "Louis Armstrong", "US", 29.99, -90.26, "America/Chicago"],
  ["MYR", "KMYR", "Myrtle Beach", "Myrtle Beach Intl", "US", 33.68, -78.93, "America/New_York"],
  ["OAK", "KOAK", "Oakland", "Oakland Intl", "US", 37.72, -122.22, "America/Los_Angeles"],
  ["OGG", "PHOG", "Maui", "Kahului", "US", 20.9, -156.43, "Pacific/Honolulu"],
  ["OKC", "KOKC", "Oklahoma City", "Will Rogers", "US", 35.39, -97.6, "America/Chicago"],
  ["OMA", "KOMA", "Omaha", "Eppley Airfield", "US", 41.3, -95.89, "America/Chicago"],
  ["ONT", "KONT", "Ontario", "Ontario Intl", "US", 34.06, -117.6, "America/Los_Angeles"],
  ["ORD", "KORD", "Chicago", "O'Hare Intl", "US", 41.97, -87.91, "America/Chicago"],
  ["ORF", "KORF", "Norfolk", "Norfolk Intl", "US", 36.89, -76.2, "America/New_York"],
  ["PBI", "KPBI", "West Palm Beach", "Palm Beach Intl", "US", 26.68, -80.1, "America/New_York"],
  ["PDX", "KPDX", "Portland", "Portland Intl", "US", 45.59, -122.6, "America/Los_Angeles"],
  ["PHL", "KPHL", "Philadelphia", "Philadelphia Intl", "US", 39.87, -75.24, "America/New_York"],
  ["PHX", "KPHX", "Phoenix", "Sky Harbor", "US", 33.43, -112.01, "America/Phoenix"],
  ["PIT", "KPIT", "Pittsburgh", "Pittsburgh Intl", "US", 40.49, -80.23, "America/New_York"],
  ["PNS", "KPNS", "Pensacola", "Pensacola Intl", "US", 30.47, -87.19, "America/Chicago"],
  ["PSP", "KPSP", "Palm Springs", "Palm Springs Intl", "US", 33.83, -116.51, "America/Los_Angeles"],
  ["PVD", "KPVD", "Providence", "Rhode Island T.F. Green", "US", 41.73, -71.43, "America/New_York"],
  ["PWM", "KPWM", "Portland", "Portland Intl Jetport", "US", 43.65, -70.31, "America/New_York"],
  ["RDU", "KRDU", "Raleigh-Durham", "Raleigh-Durham Intl", "US", 35.88, -78.79, "America/New_York"],
  ["RIC", "KRIC", "Richmond", "Richmond Intl", "US", 37.51, -77.32, "America/New_York"],
  ["RNO", "KRNO", "Reno", "Reno-Tahoe", "US", 39.5, -119.77, "America/Los_Angeles"],
  ["RSW", "KRSW", "Fort Myers", "Southwest Florida", "US", 26.54, -81.76, "America/New_York"],
  ["SAN", "KSAN", "San Diego", "San Diego Intl", "US", 32.73, -117.19, "America/Los_Angeles"],
  ["SAT", "KSAT", "San Antonio", "San Antonio Intl", "US", 29.53, -98.47, "America/Chicago"],
  ["SAV", "KSAV", "Savannah", "Savannah/Hilton Head", "US", 32.13, -81.2, "America/New_York"],
  ["SDF", "KSDF", "Louisville", "Muhammad Ali Intl", "US", 38.17, -85.74, "America/Kentucky/Louisville"],
  ["SEA", "KSEA", "Seattle", "Seattle-Tacoma", "US", 47.45, -122.31, "America/Los_Angeles"],
  ["SFO", "KSFO", "San Francisco", "San Francisco Intl", "US", 37.62, -122.38, "America/Los_Angeles"],
  ["SJC", "KSJC", "San Jose", "Mineta San Jose", "US", 37.36, -121.93, "America/Los_Angeles"],
  ["SJU", "TJSJ", "San Juan", "Luis Muñoz Marín", "PR", 18.44, -66.0, "America/Puerto_Rico"],
  ["SLC", "KSLC", "Salt Lake City", "Salt Lake City Intl", "US", 40.79, -111.98, "America/Denver"],
  ["SMF", "KSMF", "Sacramento", "Sacramento Intl", "US", 38.7, -121.59, "America/Los_Angeles"],
  ["SNA", "KSNA", "Santa Ana", "John Wayne", "US", 33.68, -117.87, "America/Los_Angeles"],
  ["SRQ", "KSRQ", "Sarasota", "Sarasota-Bradenton", "US", 27.4, -82.55, "America/New_York"],
  ["STL", "KSTL", "St. Louis", "Lambert", "US", 38.75, -90.37, "America/Chicago"],
  ["TPA", "KTPA", "Tampa", "Tampa Intl", "US", 27.98, -82.53, "America/New_York"],
  ["TUL", "KTUL", "Tulsa", "Tulsa Intl", "US", 36.2, -95.89, "America/Chicago"],
  ["TUS", "KTUS", "Tucson", "Tucson Intl", "US", 32.12, -110.94, "America/Phoenix"],
  ["XNA", "KXNA", "Bentonville", "Northwest Arkansas", "US", 36.28, -94.31, "America/Chicago"],
  // ---- Canada ----
  ["YEG", "CYEG", "Edmonton", "Edmonton Intl", "CA", 53.31, -113.58, "America/Edmonton"],
  ["YOW", "CYOW", "Ottawa", "Macdonald-Cartier", "CA", 45.32, -75.67, "America/Toronto"],
  ["YUL", "CYUL", "Montréal", "Trudeau Intl", "CA", 45.47, -73.74, "America/Toronto"],
  ["YVR", "CYVR", "Vancouver", "Vancouver Intl", "CA", 49.19, -123.18, "America/Vancouver"],
  ["YYC", "CYYC", "Calgary", "Calgary Intl", "CA", 51.13, -114.01, "America/Edmonton"],
  ["YYZ", "CYYZ", "Toronto", "Pearson", "CA", 43.68, -79.62, "America/Toronto"],
  // ---- Mexico, Caribbean, Central America ----
  ["CUN", "MMUN", "Cancún", "Cancún Intl", "MX", 21.04, -86.88, "America/Cancun"],
  ["GDL", "MMGL", "Guadalajara", "Miguel Hidalgo", "MX", 20.52, -103.31, "America/Mexico_City"],
  ["MEX", "MMMX", "Mexico City", "Benito Juárez", "MX", 19.44, -99.07, "America/Mexico_City"],
  ["PVR", "MMPR", "Puerto Vallarta", "Gustavo Díaz Ordaz", "MX", 20.68, -105.25, "America/Mexico_City"],
  ["SJD", "MMSD", "Los Cabos", "Los Cabos Intl", "MX", 23.15, -109.72, "America/Mazatlan"],
  ["NAS", "MYNN", "Nassau", "Lynden Pindling", "BS", 25.04, -77.47, "America/Nassau"],
  ["MBJ", "MKJS", "Montego Bay", "Sangster Intl", "JM", 18.5, -77.91, "America/Jamaica"],
  ["PUJ", "MDPC", "Punta Cana", "Punta Cana Intl", "DO", 18.57, -68.36, "America/Santo_Domingo"],
  ["AUA", "TNCA", "Aruba", "Queen Beatrix", "AW", 12.5, -70.02, "America/Aruba"],
  ["SJO", "MROC", "San José", "Juan Santamaría", "CR", 9.99, -84.2, "America/Costa_Rica"],
  ["LIR", "MRLB", "Liberia", "Guanacaste", "CR", 10.59, -85.54, "America/Costa_Rica"],
  ["PTY", "MPTO", "Panama City", "Tocumen", "PA", 9.07, -79.38, "America/Panama"],
  // ---- South America ----
  ["BOG", "SKBO", "Bogotá", "El Dorado", "CO", 4.7, -74.15, "America/Bogota"],
  ["LIM", "SPJC", "Lima", "Jorge Chávez", "PE", -12.02, -77.11, "America/Lima"],
  ["GRU", "SBGR", "São Paulo", "Guarulhos", "BR", -23.43, -46.47, "America/Sao_Paulo"],
  ["EZE", "SAEZ", "Buenos Aires", "Ezeiza", "AR", -34.82, -58.54, "America/Argentina/Buenos_Aires"],
  ["SCL", "SCEL", "Santiago", "Arturo Merino Benítez", "CL", -33.39, -70.79, "America/Santiago"],
  // ---- Europe ----
  ["LHR", "EGLL", "London", "Heathrow", "GB", 51.47, -0.45, "Europe/London"],
  ["LGW", "EGKK", "London", "Gatwick", "GB", 51.15, -0.18, "Europe/London"],
  ["MAN", "EGCC", "Manchester", "Manchester Airport", "GB", 53.35, -2.28, "Europe/London"],
  ["EDI", "EGPH", "Edinburgh", "Edinburgh Airport", "GB", 55.95, -3.36, "Europe/London"],
  ["DUB", "EIDW", "Dublin", "Dublin Airport", "IE", 53.43, -6.25, "Europe/Dublin"],
  ["KEF", "BIKF", "Reykjavík", "Keflavík", "IS", 63.99, -22.61, "Atlantic/Reykjavik"],
  ["CDG", "LFPG", "Paris", "Charles de Gaulle", "FR", 49.01, 2.55, "Europe/Paris"],
  ["NCE", "LFMN", "Nice", "Côte d'Azur", "FR", 43.66, 7.21, "Europe/Paris"],
  ["AMS", "EHAM", "Amsterdam", "Schiphol", "NL", 52.31, 4.77, "Europe/Amsterdam"],
  ["BRU", "EBBR", "Brussels", "Brussels Airport", "BE", 50.9, 4.48, "Europe/Brussels"],
  ["FRA", "EDDF", "Frankfurt", "Frankfurt am Main", "DE", 50.04, 8.56, "Europe/Berlin"],
  ["MUC", "EDDM", "Munich", "Munich Airport", "DE", 48.35, 11.79, "Europe/Berlin"],
  ["BER", "EDDB", "Berlin", "Brandenburg", "DE", 52.36, 13.5, "Europe/Berlin"],
  ["ZRH", "LSZH", "Zürich", "Zürich Airport", "CH", 47.46, 8.55, "Europe/Zurich"],
  ["VIE", "LOWW", "Vienna", "Vienna Intl", "AT", 48.11, 16.57, "Europe/Vienna"],
  ["CPH", "EKCH", "Copenhagen", "Kastrup", "DK", 55.62, 12.65, "Europe/Copenhagen"],
  ["ARN", "ESSA", "Stockholm", "Arlanda", "SE", 59.65, 17.92, "Europe/Stockholm"],
  ["OSL", "ENGM", "Oslo", "Gardermoen", "NO", 60.19, 11.1, "Europe/Oslo"],
  ["HEL", "EFHK", "Helsinki", "Helsinki-Vantaa", "FI", 60.32, 24.96, "Europe/Helsinki"],
  ["MAD", "LEMD", "Madrid", "Barajas", "ES", 40.49, -3.57, "Europe/Madrid"],
  ["BCN", "LEBL", "Barcelona", "El Prat", "ES", 41.3, 2.08, "Europe/Madrid"],
  ["LIS", "LPPT", "Lisbon", "Humberto Delgado", "PT", 38.77, -9.13, "Europe/Lisbon"],
  ["FCO", "LIRF", "Rome", "Fiumicino", "IT", 41.8, 12.25, "Europe/Rome"],
  ["MXP", "LIMC", "Milan", "Malpensa", "IT", 45.63, 8.72, "Europe/Rome"],
  ["VCE", "LIPZ", "Venice", "Marco Polo", "IT", 45.51, 12.35, "Europe/Rome"],
  ["ATH", "LGAV", "Athens", "Athens Intl", "GR", 37.94, 23.94, "Europe/Athens"],
  ["IST", "LTFM", "Istanbul", "Istanbul Airport", "TR", 41.26, 28.74, "Europe/Istanbul"],
  ["PRG", "LKPR", "Prague", "Václav Havel", "CZ", 50.1, 14.26, "Europe/Prague"],
  ["WAW", "EPWA", "Warsaw", "Chopin", "PL", 52.17, 20.97, "Europe/Warsaw"],
  // ---- Middle East & Africa ----
  ["DXB", "OMDB", "Dubai", "Dubai Intl", "AE", 25.25, 55.36, "Asia/Dubai"],
  ["AUH", "OMAA", "Abu Dhabi", "Zayed Intl", "AE", 24.43, 54.65, "Asia/Dubai"],
  ["DOH", "OTHH", "Doha", "Hamad Intl", "QA", 25.27, 51.61, "Asia/Qatar"],
  ["TLV", "LLBG", "Tel Aviv", "Ben Gurion", "IL", 32.01, 34.89, "Asia/Jerusalem"],
  ["CAI", "HECA", "Cairo", "Cairo Intl", "EG", 30.12, 31.41, "Africa/Cairo"],
  ["JNB", "FAOR", "Johannesburg", "O.R. Tambo", "ZA", -26.13, 28.24, "Africa/Johannesburg"],
  ["CPT", "FACT", "Cape Town", "Cape Town Intl", "ZA", -33.97, 18.6, "Africa/Johannesburg"],
  ["ADD", "HAAB", "Addis Ababa", "Bole Intl", "ET", 8.98, 38.8, "Africa/Addis_Ababa"],
  ["NBO", "HKJK", "Nairobi", "Jomo Kenyatta", "KE", -1.32, 36.93, "Africa/Nairobi"],
  ["CMN", "GMMN", "Casablanca", "Mohammed V", "MA", 33.37, -7.59, "Africa/Casablanca"],
  // ---- Asia & Pacific ----
  ["HND", "RJTT", "Tokyo", "Haneda", "JP", 35.55, 139.78, "Asia/Tokyo"],
  ["NRT", "RJAA", "Tokyo", "Narita", "JP", 35.77, 140.39, "Asia/Tokyo"],
  ["KIX", "RJBB", "Osaka", "Kansai Intl", "JP", 34.43, 135.24, "Asia/Tokyo"],
  ["ICN", "RKSI", "Seoul", "Incheon", "KR", 37.46, 126.44, "Asia/Seoul"],
  ["TPE", "RCTP", "Taipei", "Taoyuan", "TW", 25.08, 121.23, "Asia/Taipei"],
  ["HKG", "VHHH", "Hong Kong", "Hong Kong Intl", "HK", 22.31, 113.91, "Asia/Hong_Kong"],
  ["PEK", "ZBAA", "Beijing", "Capital Intl", "CN", 40.08, 116.6, "Asia/Shanghai"],
  ["PVG", "ZSPD", "Shanghai", "Pudong", "CN", 31.14, 121.81, "Asia/Shanghai"],
  ["MNL", "RPLL", "Manila", "Ninoy Aquino", "PH", 14.51, 121.02, "Asia/Manila"],
  ["SIN", "WSSS", "Singapore", "Changi", "SG", 1.36, 103.99, "Asia/Singapore"],
  ["BKK", "VTBS", "Bangkok", "Suvarnabhumi", "TH", 13.69, 100.75, "Asia/Bangkok"],
  ["DEL", "VIDP", "Delhi", "Indira Gandhi Intl", "IN", 28.56, 77.1, "Asia/Kolkata"],
  ["BOM", "VABB", "Mumbai", "Chhatrapati Shivaji", "IN", 19.09, 72.87, "Asia/Kolkata"],
  ["SYD", "YSSY", "Sydney", "Kingsford Smith", "AU", -33.95, 151.18, "Australia/Sydney"],
  ["MEL", "YMML", "Melbourne", "Tullamarine", "AU", -37.67, 144.84, "Australia/Melbourne"],
  ["BNE", "YBBN", "Brisbane", "Brisbane Airport", "AU", -27.38, 153.12, "Australia/Brisbane"],
  ["AKL", "NZAA", "Auckland", "Auckland Airport", "NZ", -37.01, 174.79, "Pacific/Auckland"],
  ["PPT", "NTAA", "Papeete", "Faa'a Intl", "PF", -17.55, -149.61, "Pacific/Tahiti"],
];

export const AIRPORTS = RAW.map(([code, icao, city, name, country, lat, lon, tz]) => ({ code, icao, city, name, country, lat, lon, tz }));

const index = new Map();
for (const a of AIRPORTS) {
  index.set(a.code, a);
  index.set(a.icao, a);
}

/** Look up by IATA or ICAO code. */
export const airport = (code) => (code ? index.get(String(code).toUpperCase()) ?? null : null);

/** "Dallas-Fort Worth (DFW)" when known, the bare code otherwise. */
export const placeName = (code) => {
  const a = airport(code);
  return a ? a.city : code ?? "";
};

/** Best matches for what someone typed: exact code first, then city and airport name. */
export function searchAirports(q, limit = 7) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (a) => {
    if (a.code.toLowerCase() === s) return 0;
    if (a.city.toLowerCase().startsWith(s)) return 1;
    if (a.code.toLowerCase().startsWith(s)) return 2;
    if (a.name.toLowerCase().includes(s)) return 3;
    if (a.city.toLowerCase().includes(s)) return 4;
    if (a.icao.toLowerCase() === s) return 5;
    return 99;
  };
  return AIRPORTS.map((a) => [score(a), a])
    .filter(([n]) => n < 99)
    .sort((x, y) => x[0] - y[0] || (x[1].country === "US" ? -1 : 1))
    .slice(0, limit)
    .map(([, a]) => a);
}
