import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { afterEach, describe, expect, it, vi } from "vitest"

const fake = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("node:https", () => ({ request: fake.request }))

import { fetchGuardedHttps } from "./destination"

function simulateHttpResponse(status: number) {
  let destroyed = 0
  const incoming = Object.assign(new Readable({ read() {} }), {
    statusCode: status,
    headers: {} as Record<string, string>,
  })
  const emitter = new EventEmitter()
  fake.request.mockImplementation((_options: unknown, onResponse: (stream: typeof incoming) => void) => {
    return Object.assign(emitter, {
      end() {
        queueMicrotask(() => {
          onResponse(incoming)
          if (status === 204 || status === 205) incoming.push(null)
        })
      },
      destroy(reason?: Error) {
        destroyed += 1
        incoming.destroy(reason)
        emitter.emit("close")
      },
    })
  })
  return { get destroyed() { return destroyed } }
}

afterEach(() => fake.request.mockReset())

describe("guarded HTTPS response lifecycle", () => {
  it.each([204, 205])("safely handles a no-body HTTP %i response", async status => {
    simulateHttpResponse(status)
    const response = await fetchGuardedHttps("https://8.8.8.8/attachment")
    expect(response.status).toBe(status)
    expect(response.body).toBeNull()
  })

  it("aborts a response that stalls after headers instead of leaving the body pending", async () => {
    const simulated = simulateHttpResponse(200)
    const response = await fetchGuardedHttps("https://8.8.8.8/attachment", {
      signal: AbortSignal.timeout(35),
    })
    expect(response.status).toBe(200)
    const read = response.body!.getReader().read().then(() => "completed", () => "failed")
    const result = await Promise.race([
      read,
      new Promise<string>(resolve => setTimeout(() => resolve("stalled"), 400)),
    ])
    expect(result).toBe("failed")
    expect(simulated.destroyed).toBeGreaterThan(0)
  })
})
