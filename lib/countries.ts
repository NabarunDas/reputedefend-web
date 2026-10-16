/** ISO 3166-1 alpha-2 codes officially assigned for international business location.
 * This list is not a commercial eligibility, sanctions, or purchasing-establishment gate.
 */
const ISO_ALPHA2 = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })

/** Common labels already stored or typed for a canonical alpha-2 code. UK is not itself an alpha-2 code. */
const EXTRA_ALIASES: Record<string, readonly string[]> = {
  AE: ["UAE", "U.A.E."],
  CZ: ["Czech Republic"],
  GB: ["UK", "U.K.", "Great Britain", "Britain"],
  NL: ["Holland", "The Netherlands"],
  TR: ["Turkey"],
  US: ["USA", "U.S.A.", "United States of America"],
}

export type CountryOption = {
  code: string
  name: string
  aliases: readonly string[]
}

function englishRegionName(code: string) {
  const name = regionNames.of(code)
  return name && name.toUpperCase() !== code ? name : code
}

export const COUNTRIES: readonly CountryOption[] = ISO_ALPHA2.map((code) => ({
  code,
  name: englishRegionName(code),
  aliases: EXTRA_ALIASES[code] ?? [],
})).sort((a, b) => a.name.localeCompare(b.name, "en"))

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]))

const BY_LABEL = new Map<string, string>()
for (const country of COUNTRIES) {
  BY_LABEL.set(country.name.toLowerCase(), country.code)
  for (const alias of country.aliases) BY_LABEL.set(alias.toLowerCase().replace(/\./g, ""), country.code)
}

export function countryName(code: string) {
  return BY_CODE.get(code)?.name ?? ""
}

/** Map a typed code, UK alias, or English country name to an alpha-2 code. Unknown text is rejected. */
export function canonicalBusinessCountry(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ")
  if (!trimmed) return null
  const compact = trimmed.toUpperCase().replace(/\./g, "").replace(/\s+/g, "")
  if (compact === "UK") return "GB"
  if (/^[A-Z]{2}$/.test(compact) && BY_CODE.has(compact)) return compact
  return BY_LABEL.get(trimmed.toLowerCase().replace(/\./g, "")) ?? null
}

export function countryLabel(value: string) {
  const code = canonicalBusinessCountry(value)
  return code ? countryName(code) : value
}

export function filterCountries(query: string) {
  const q = query.trim().toLowerCase().replace(/\./g, "")
  if (!q) return COUNTRIES
  const ranked: { country: CountryOption; rank: number }[] = []
  for (const country of COUNTRIES) {
    const name = country.name.toLowerCase()
    const code = country.code.toLowerCase()
    const aliasHit = country.aliases.some((alias) => alias.toLowerCase().replace(/\./g, "").includes(q))
    if (name.startsWith(q) || code.startsWith(q)) ranked.push({ country, rank: 0 })
    else if (name.includes(q) || aliasHit) ranked.push({ country, rank: 1 })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name))
  return ranked.map((item) => item.country)
}
