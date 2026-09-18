import { describe, expect, it } from "vitest"
import { isPublicRead } from "./access"

describe("public admin reads", () => {
  it("allows only login, robots, static chunks and copied logo files", () => {
    expect(isPublicRead("/login", "GET")).toBe(true)
    expect(isPublicRead("/brand/profile-relaunch-logo.png", "GET")).toBe(true)
    expect(isPublicRead("/brand/profile-relaunch-logo-light.png", "HEAD")).toBe(true)
    expect(isPublicRead("/brand/profile-relaunch-logo.png", "POST")).toBe(false)
    expect(isPublicRead("/brand/profile-relaunch-lockup.png", "GET")).toBe(false)
    expect(isPublicRead("/security", "GET")).toBe(false)
    expect(isPublicRead("/", "GET")).toBe(false)
  })
})
