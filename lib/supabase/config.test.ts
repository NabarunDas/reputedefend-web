import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readEnquiryEmailConfig } from "@/lib/enquiry-config"
import { readSupabaseConfig, requireSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

describe("readSupabaseConfig", () => {
  it("is not ready when values are missing", () => {
    const config = readSupabaseConfig({
      SUPABASE_URL: "",
      SUPABASE_SECRET_KEY: "  ",
    })
    expect(config.ready).toBe(false)
    expect(config.url).toBe("")
    expect(config.secretKey).toBe("")
  })

  it("trims values and is ready when both exist", () => {
    const config = readSupabaseConfig({
      SUPABASE_URL: " https://example.supabase.co ",
      SUPABASE_SECRET_KEY: " test-secret-key ",
    })
    expect(config.ready).toBe(true)
    expect(config.url).toBe("https://example.supabase.co")
    expect(config.secretKey).toBe("test-secret-key")
  })

  it("does not require credentials to import unrelated modules", () => {
    const enquiry = readEnquiryEmailConfig({})
    const supabase = readSupabaseConfig({})
    expect(enquiry.ready).toBe(false)
    expect(supabase.ready).toBe(false)
  })
})

describe("requireSupabaseConfig", () => {
  it("rejects missing values without exposing secrets", () => {
    const secret = "do-not-leak-this-secret"
    expect(() =>
      requireSupabaseConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: secret,
      }),
    ).not.toThrow()

    expect(() =>
      requireSupabaseConfig({
        SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: secret,
      }),
    ).toThrow(/SUPABASE_URL and SUPABASE_SECRET_KEY/)

    try {
      requireSupabaseConfig({
        SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: secret,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toContain(secret)
    }
  })
})

describe("createSupabaseServerClient", () => {
  it("is a server-only module", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./server.ts", import.meta.url)),
      "utf8",
    )
    expect(source).toMatch(/^import "server-only"/m)
    expect(source).not.toContain("NEXT_PUBLIC_")
  })

  it("fails clearly when credentials are absent", () => {
    const previousUrl = process.env.SUPABASE_URL
    const previousKey = process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SECRET_KEY
    try {
      expect(() => createSupabaseServerClient()).toThrow(/SUPABASE_URL and SUPABASE_SECRET_KEY/)
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL
      else process.env.SUPABASE_URL = previousUrl
      if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY
      else process.env.SUPABASE_SECRET_KEY = previousKey
    }
  })
})
