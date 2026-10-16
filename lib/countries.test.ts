import { describe, expect, it } from "vitest"
import { COUNTRIES, canonicalBusinessCountry, countryLabel, countryName, filterCountries } from "./countries"

describe("business location countries", () => {
  it("lists every officially assigned ISO alpha-2 code once, with an English name", () => {
    expect(COUNTRIES).toHaveLength(249)
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(249)
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
      expect(country.name).not.toBe("")
      expect(country.name.toUpperCase()).not.toBe(country.code)
    }
  })

  it("canonicalizes UK and English country names without treating them as an eligibility gate", () => {
    expect(canonicalBusinessCountry("UK")).toBe("GB")
    expect(canonicalBusinessCountry("U.K.")).toBe("GB")
    expect(canonicalBusinessCountry("United Kingdom")).toBe("GB")
    expect(canonicalBusinessCountry("great britain")).toBe("GB")
    expect(canonicalBusinessCountry("gb")).toBe("GB")
    expect(canonicalBusinessCountry("Ireland")).toBe("IE")
    expect(canonicalBusinessCountry("IE")).toBe("IE")
    expect(canonicalBusinessCountry("United States")).toBe("US")
    expect(canonicalBusinessCountry("USA")).toBe("US")
    expect(countryName("GB")).toBe("United Kingdom")
    expect(countryLabel("UK")).toBe("United Kingdom")
    expect(countryLabel("IE")).toBe("Ireland")
    expect(canonicalBusinessCountry("KP")).toBe("KP")
    expect(canonicalBusinessCountry("")).toBeNull()
    expect(canonicalBusinessCountry("Atlantis")).toBeNull()
    expect(canonicalBusinessCountry("EU")).toBeNull()
  })

  it("searches by name, code, and the UK alias", () => {
    expect(filterCountries("ire").map((country) => country.code)).toContain("IE")
    expect(filterCountries("GB")[0]?.code).toBe("GB")
    expect(filterCountries("UK").some((country) => country.code === "GB")).toBe(true)
    expect(filterCountries("not-a-country")).toEqual([])
  })
})
