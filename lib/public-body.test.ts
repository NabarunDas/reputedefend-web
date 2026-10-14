import { describe, expect, it } from "vitest"
import { PUBLIC_BODY_LIMIT_BYTES, readBoundedJson } from "@/lib/public-body"

function jsonRequest(body: BodyInit, extra?: { duplex?: "half" }) {
  return new Request("https://profilerelaunch.com/api/enquiry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...extra,
  })
}

describe("readBoundedJson", () => {
  it("accepts a JSON body of exactly 64 KiB", async () => {
    const pad = "a".repeat(PUBLIC_BODY_LIMIT_BYTES - JSON.stringify({ ok: true, pad: "" }).length)
    const raw = JSON.stringify({ ok: true, pad })
    expect(Buffer.byteLength(raw)).toBe(PUBLIC_BODY_LIMIT_BYTES)
    const result = await readBoundedJson(jsonRequest(raw))
    expect(result).toEqual({ ok: true, value: { ok: true, pad } })
  })

  it("rejects one extra byte and a streamed body that crosses the limit", async () => {
    const exact = "a".repeat(PUBLIC_BODY_LIMIT_BYTES - JSON.stringify({ ok: true, pad: "" }).length)
    const over = JSON.stringify({ ok: true, pad: `${exact}b` })
    expect(Buffer.byteLength(over)).toBe(PUBLIC_BODY_LIMIT_BYTES + 1)
    expect(await readBoundedJson(jsonRequest(over))).toEqual({ ok: false, status: 413 })

    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(40_000))
      },
      cancel() {
        cancelled = true
      },
    })
    const streamed = await readBoundedJson(jsonRequest(stream, { duplex: "half" }))
    expect(streamed).toEqual({ ok: false, status: 413 })
    expect(cancelled).toBe(true)
  })

  it("rejects malformed JSON without throwing", async () => {
    expect(await readBoundedJson(jsonRequest("{not-json"))).toEqual({ ok: false, status: 400 })
    expect(await readBoundedJson(jsonRequest(""))).toEqual({ ok: false, status: 400 })
  })
})
