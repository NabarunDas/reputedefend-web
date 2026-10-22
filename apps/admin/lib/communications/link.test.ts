import { describe, expect, it } from "vitest"
import {
  communicationAccessTokenHash,
  currentLinkKeyVersion,
  deriveCommunicationAccessToken,
  deriveCommunicationActionId,
  linkSecretForVersion,
  materializeUploadUrl,
  prepareCommunicationAccessLink,
  deriveQuoteAcceptanceActionId,
  deriveQuoteAcceptanceToken,
  prepareQuoteAcceptanceLink,
  snapshotUploadUrl,
} from "./link"

const secret = "communication-link-secret-for-tests-32b"
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("secure communication access links", () => {
  it("derives a stable token and never puts it in the snapshot URL", () => {
    const first = deriveCommunicationAccessToken(actionId, secret)
    const second = deriveCommunicationAccessToken(actionId, secret)
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshotUploadUrl("https://customer.profilerelaunch.com", actionId)).toBe(
      `https://customer.profilerelaunch.com/action/${actionId}`,
    )
    const body = `Please upload using https://customer.profilerelaunch.com/action/${actionId}`
    const materialised = materializeUploadUrl(body, actionId, "https://customer.profilerelaunch.com", first)
    expect(materialised).toBe(`${body}#t=${first}`)
    expect(materializeUploadUrl(`${body}#t=already`, actionId, "https://customer.profilerelaunch.com", first)).toBeNull()
    const html = `<a href="https://customer.profilerelaunch.com/action/${actionId}">Upload your documents securely</a>`
    const sentHtml = materializeUploadUrl(html, actionId, "https://customer.profilerelaunch.com", first)
    expect(sentHtml).toBe(`<a href="https://customer.profilerelaunch.com/action/${actionId}#t=${first}">Upload your documents securely</a>`)
    expect(sentHtml?.match(/#t=/g)).toHaveLength(1)
    expect(prepareCommunicationAccessLink(actionId, { COMMUNICATIONS_LINK_SECRET: secret })?.tokenHash).toBe(communicationAccessTokenHash(first))
    expect(prepareCommunicationAccessLink(actionId, {})).toBeNull()
  })

  it("derives the same action UUID from the same Admin request and keeps versioned secrets", () => {
    const requestId = "33333333-3333-4333-8333-333333333333"
    expect(deriveCommunicationActionId(requestId)).toBe(deriveCommunicationActionId(requestId))
    expect(deriveCommunicationActionId(requestId)).not.toBe(deriveCommunicationActionId("44444444-4444-4444-8444-444444444444"))
    const v1 = "communication-link-secret-for-tests-32b"
    const v2 = "rotated-link-secret-for-version-two-32b"
    expect(currentLinkKeyVersion({ COMMUNICATIONS_LINK_KEY_VERSION: "2" })).toBe(2)
    expect(linkSecretForVersion(1, { COMMUNICATIONS_LINK_SECRET: v2, COMMUNICATIONS_LINK_KEY_VERSION: "2", COMMUNICATIONS_LINK_SECRET_V1: v1 })).toBe(v1)
    expect(linkSecretForVersion(2, { COMMUNICATIONS_LINK_SECRET: v2, COMMUNICATIONS_LINK_KEY_VERSION: "2", COMMUNICATIONS_LINK_SECRET_V1: v1 })).toBe(v2)
    const old = prepareCommunicationAccessLink(actionId, { COMMUNICATIONS_LINK_SECRET: v1, COMMUNICATIONS_LINK_KEY_VERSION: "1" }, 1)
    const afterRotation = prepareCommunicationAccessLink(actionId, {
      COMMUNICATIONS_LINK_SECRET: v2,
      COMMUNICATIONS_LINK_KEY_VERSION: "2",
      COMMUNICATIONS_LINK_SECRET_V1: v1,
    }, 1)
    expect(afterRotation?.token).toBe(old?.token)
    expect(prepareCommunicationAccessLink(actionId, {
      COMMUNICATIONS_LINK_SECRET: v2,
      COMMUNICATIONS_LINK_KEY_VERSION: "2",
    }, 1)).toBeNull()
  })

  it("keeps quotation acceptance in a separate domain from communication access", () => {
    const requestId = "33333333-3333-4333-8333-333333333333"
    const quoteAction = deriveQuoteAcceptanceActionId(requestId)
    expect(quoteAction).toBe(deriveQuoteAcceptanceActionId(requestId))
    expect(quoteAction).not.toBe(deriveCommunicationActionId(requestId))
    const quoteToken = deriveQuoteAcceptanceToken(actionId, secret)
    const evidenceToken = deriveCommunicationAccessToken(actionId, secret)
    expect(quoteToken).not.toBe(evidenceToken)
    expect(prepareQuoteAcceptanceLink(actionId, {})).toBeNull()
    const prepared = prepareQuoteAcceptanceLink(actionId, { COMMUNICATIONS_LINK_SECRET: secret })
    expect(prepared?.token).toBe(quoteToken)
    expect(prepared?.tokenHash).toBe(communicationAccessTokenHash(quoteToken))
    const rotated = prepareQuoteAcceptanceLink(actionId, {
      COMMUNICATIONS_LINK_SECRET: "rotated-link-secret-for-version-two-32b",
      COMMUNICATIONS_LINK_KEY_VERSION: "2",
      COMMUNICATIONS_LINK_SECRET_V1: secret,
    }, 1)
    expect(rotated?.token).toBe(quoteToken)
  })
})
