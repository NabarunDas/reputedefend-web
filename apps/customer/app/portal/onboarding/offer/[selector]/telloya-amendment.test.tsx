// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TelloyaAmendmentRequest } from "./telloya-amendment"

afterEach(() => cleanup())

describe("Telloya amendment request", () => {
  it("stays closed until a customer revision is explicitly enabled", () => {
    render(<TelloyaAmendmentRequest enabled={false} />)
    expect(screen.getByText(/does not change the offer you were sent/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", true)
  })
})
