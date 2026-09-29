import { describe, expect, it } from "vitest"
import {
  communicationAccessTokenHash,
  deriveCommunicationAccessToken,
  materializeUploadUrl,
  prepareCommunicationAccessLink,
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
    expect(prepareCommunicationAccessLink(actionId, { COMMUNICATIONS_LINK_SECRET: secret })?.tokenHash).toBe(communicationAccessTokenHash(first))
    expect(prepareCommunicationAccessLink(actionId, {})).toBeNull()
  })
})
