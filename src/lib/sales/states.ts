export const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export const CA_PROVINCES: string[] = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
];

// Countries a marketing order can ship to. `code` is ISO 3166-1 alpha-2 (what
// the address lookup filters on); US first, since it's nearly every order.
export const SHIP_COUNTRIES: { code: string; name: string; group: "North America" | "South America" }[] = [
  { code: "US", name: "United States", group: "North America" },
  { code: "CA", name: "Canada", group: "North America" },
  { code: "MX", name: "Mexico", group: "North America" },
  { code: "AR", name: "Argentina", group: "South America" },
  { code: "BO", name: "Bolivia", group: "South America" },
  { code: "BR", name: "Brazil", group: "South America" },
  { code: "CL", name: "Chile", group: "South America" },
  { code: "CO", name: "Colombia", group: "South America" },
  { code: "EC", name: "Ecuador", group: "South America" },
  { code: "GY", name: "Guyana", group: "South America" },
  { code: "PY", name: "Paraguay", group: "South America" },
  { code: "PE", name: "Peru", group: "South America" },
  { code: "SR", name: "Suriname", group: "South America" },
  { code: "UY", name: "Uruguay", group: "South America" },
  { code: "VE", name: "Venezuela", group: "South America" },
];
