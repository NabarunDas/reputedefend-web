import { describe, expect, it } from "vitest"
import { parseMessageDetail, parseMessagePage, parseMessagesRequest } from "./parse"

const selector = `mc-${"ab".repeat(32)}`
const other = `mm-${"cd".repeat(32)}`
const at = "2026-09-04T12:00:00+00:00"

function thread(extra: Record<string, unknown> = {}) {
  return {
    selector,
    subject: "About your case",
    caseReference: "PR-26-ABCDEF",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    activityAt: at,
    state: "Open conversation",
    preview: "Plain update for you.",
    ...extra,
  }
}

function entry(extra: Record<string, unknown> = {}) {
  return {
    role: "ProfileRelaunch",
    at,
    subject: "About your case",
    body: "Plain update for you.",
    delivery: "Delivered by email",
    ...extra,
  }
}

describe("message projection parser", () => {
  it("accepts a customer-safe thread and rejects an unexpected key", () => {
    expect(parseMessagePage({ threads: [thread()], complete: true })?.threads[0].subject).toBe("About your case")
    expect(parseMessagePage({ threads: [thread({ conversationId: selector })], complete: true })).toBeNull()
    expect(parseMessagePage({ threads: [thread({ providerMessageId: "msg_secret" })], complete: true })).toBeNull()
    expect(parseMessagePage({ threads: [thread({ replyAlias: "a".repeat(32) })], complete: true })).toBeNull()
    expect(parseMessagePage({ threads: [thread({ state: "Unread" })], complete: true })).toBeNull()
    expect(parseMessagePage({ threads: [thread()], complete: false })).toBeNull()
    expect(parseMessagePage({ threads: [thread()], complete: true, nextCursor: { activityAt: at, selector } })).toBeNull()
  })

  it("requires the cursor to match the last row when history continues", () => {
    const threads = Array.from({ length: 20 }, (_, index) => thread({
      selector: `mm-${index.toString(16).padStart(64, "0")}`,
      activityAt: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    }))
    const last = threads[19]
    expect(parseMessagePage({
      threads,
      complete: false,
      nextCursor: { activityAt: last.activityAt, selector: last.selector },
    })?.complete).toBe(false)
    expect(parseMessagePage({
      threads,
      complete: false,
      nextCursor: { activityAt: at, selector: other },
    })).toBeNull()
    expect(parseMessagePage({ threads: threads.slice(0, 19), complete: false, nextCursor: { activityAt: at, selector } })).toBeNull()
  })

  it("accepts a thread and rejects raw delivery or html fields", () => {
    const you = { role: "You" as const, at, body: "Thanks, this is my reply." }
    expect(parseMessageDetail({
      found: true,
      thread: { ...thread(), entries: [entry(), you], complete: true },
    })?.found).toBe(true)
    expect(parseMessageDetail({ found: false })).toEqual({ found: false })
    expect(parseMessageDetail({ found: false, reason: "missing" })).toBeNull()
    expect(parseMessageDetail({
      found: true,
      thread: { ...thread(), entries: [entry({ bodyHtml: "<p>secret</p>" })], complete: true },
    })).toBeNull()
    expect(parseMessageDetail({
      found: true,
      thread: { ...thread(), entries: [entry({ delivery: "Read" })], complete: true },
    })).toBeNull()
    expect(parseMessageDetail({
      found: true,
      thread: { ...thread(), entries: [entry({ delivery: "PROVIDER_ACCEPTED" })], complete: true },
    })).toBeNull()
    expect(parseMessageDetail({
      found: true,
      thread: { ...thread(), entries: [], complete: true },
    })).toBeNull()
  })

  it("keeps the cursor pair together", () => {
    expect(parseMessagesRequest({})).toEqual({ before: null, selector: null })
    expect(parseMessagesRequest({ before: at, selector })).toEqual({ before: at, selector })
    expect(parseMessagesRequest({ before: at })).toBeNull()
    expect(parseMessagesRequest({ selector })).toBeNull()
    expect(parseMessagesRequest({ before: at, selector: "mc-short" })).toBeNull()
    expect(parseMessagesRequest({ before: [at], selector })).toBeNull()
  })
})
