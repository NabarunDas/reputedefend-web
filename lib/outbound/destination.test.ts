import { describe, expect, it } from "vitest"
import {
  approveOutboundDestination,
  createConnectLookup,
  fetchGuardedHttps,
  isBlockedIp,
  outboundRequestTarget,
  selectConnectAddresses,
} from "./destination"

const publicLookup = async () => ["8.8.8.8"]

describe("outbound destinations", () => {
  it("approves a public hostname and a public address literal", async () => {
    const named = await approveOutboundDestination("https://example.test/att_1", publicLookup)
    expect(named).toEqual({ state: "approved", href: "https://example.test/att_1" })
    const defaultPort = await approveOutboundDestination("https://example.test:443/att", publicLookup)
    expect(defaultPort).toEqual({ state: "approved", href: "https://example.test/att" })
    const literal = await approveOutboundDestination("https://8.8.8.8/path", async () => {
      throw new Error("lookup should not run for an address literal")
    })
    expect(literal).toEqual({ state: "approved", href: "https://8.8.8.8/path" })
    const v6 = outboundRequestTarget("https://[2001:4860:4860::8888]/dns")
    expect(v6).toMatchObject({ host: "2001:4860:4860::8888", literal: true })
  })

  it("rejects loopback, private, metadata, and unusual address spellings before lookup", async () => {
    let lookups = 0
    const lookup = async () => {
      lookups += 1
      return ["8.8.8.8"]
    }
    const blocked = [
      "https://127.0.0.1/",
      "https://127.1/",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://0177.0.0.1/",
      "https://017700000001/",
      "https://0x7f.0.0.1/",
      "https://0/",
      "https://0.0.0.0/",
      "https://10.1.2.3/",
      "https://100.64.1.1/",
      "https://172.16.0.1/",
      "https://192.168.1.20/",
      "https://169.254.169.254/latest/meta-data/",
      "https://192.0.2.1/",
      "https://198.18.0.1/",
      "https://198.51.100.1/",
      "https://203.0.113.1/",
      "https://224.0.0.1/",
      "https://240.0.0.1/",
      "https://[::1]/",
      "https://[::]/",
      "https://[fc00::1]/",
      "https://[fd00:ec2::254]/",
      "https://[fe80::1]/",
      "https://[ff02::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:7f00:1]/",
      "https://[0:0:0:0:0:ffff:127.0.0.1]/",
      "https://[::ffff:169.254.169.254]/",
      "https://[::7f00:1]/",
      "https://[2002:7f00:1::]/",
      "https://[64:ff9b::127.0.0.1]/",
      "https://localhost/",
      "https://localhost./",
      "https://foo.localhost/",
      "https://printer.local/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://example.test@127.0.0.1/",
      "https://user:pass@example.test/a",
      "http://example.test/a",
      "https://example.test:8443/a",
      "https://example.test/%00",
      "https://example.test/\n",
    ]
    for (const url of blocked) {
      const decision = await approveOutboundDestination(url, lookup)
      expect(decision.state, url).toBe("rejected")
    }
    expect(lookups).toBe(0)
  })

  it("rejects a lookup that returns a private address, no address, or a mixed set", async () => {
    await expect(approveOutboundDestination("https://example.test/a", async () => ["127.0.0.1"])).resolves.toEqual({ state: "rejected" })
    await expect(approveOutboundDestination("https://example.test/a", async () => ["8.8.8.8", "10.0.0.1"])).resolves.toEqual({ state: "rejected" })
    await expect(approveOutboundDestination("https://example.test/a", async () => ["::ffff:a9fe:a9fe"])).resolves.toEqual({ state: "rejected" })
    await expect(approveOutboundDestination("https://example.test/a", async () => [])).resolves.toEqual({ state: "rejected" })
    expect(selectConnectAddresses(["localhost"])).toBeNull()
    expect(selectConnectAddresses(["8.8.8.8", "10.0.0.1"])).toBeNull()
    expect(selectConnectAddresses(["8.8.8.8", "2001:4860:4860::8888"])).toEqual(["8.8.8.8", "2001:4860:4860::8888"])
  })

  it("reports a resolver failure without the resolver error text", async () => {
    const decision = await approveOutboundDestination("https://example.test/a", async () => {
      throw new Error("getaddrinfo EAI_AGAIN 169.254.169.254")
    })
    expect(decision).toEqual({ state: "unresolved" })
    expect(JSON.stringify(decision)).not.toContain("169.254")
  })

  it("gives the connector only addresses checked at call time", async () => {
    const listed = await new Promise<unknown>((resolve, reject) => {
      createConnectLookup(async () => ["8.8.8.8", "2001:4860:4860::8888"])("example.test", { all: true }, (error, addresses) => {
        if (error) reject(error)
        else resolve(addresses)
      })
    })
    expect(listed).toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ])

    const rebound = await new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>(resolve => {
      createConnectLookup(async () => ["8.8.8.8", "127.0.0.1"])("example.test", {}, (error, address) => {
        resolve({ error, address })
      })
    })
    expect(rebound.error?.code).toBe("ENOTFOUND")
    expect(rebound.error?.message).toBe("unavailable")
    expect(rebound.address).not.toBe("127.0.0.1")
    expect(JSON.stringify(rebound)).not.toContain("127.0.0.1")

    const thrown = await new Promise<NodeJS.ErrnoException | null>(resolve => {
      createConnectLookup(async () => {
        throw new Error("connect 10.1.2.3")
      })("example.test", {}, error => {
        resolve(error)
      })
    })
    expect(thrown?.message).toBe("unavailable")
    expect(JSON.stringify(thrown)).not.toContain("10.1.2.3")
  })

  it("refuses a forbidden address literal before opening a connection", async () => {
    const refused = [
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "http://example.test/a",
    ]
    for (const url of refused) {
      let rejected = false
      const pending = fetchGuardedHttps(url).then(() => {
        throw new Error(`connected to ${url}`)
      }, error => {
        rejected = true
        expect(error).toMatchObject({ message: "unavailable" })
        expect(String(error)).not.toContain(url)
      })
      await Promise.resolve()
      expect(rejected, url).toBe(true)
      await pending
    }
  })

  it("keeps embedded private addresses blocked when BlockList sees the outer form", () => {
    expect(isBlockedIp("::ffff:7f00:1")).toBe(true)
    expect(isBlockedIp("::ffff:a9fe:a9fe")).toBe(true)
    expect(isBlockedIp("2002:7f00:1::")).toBe(true)
    expect(isBlockedIp("64:ff9b::7f00:1")).toBe(true)
    expect(isBlockedIp("::7f00:1")).toBe(true)
    expect(isBlockedIp("fd00:ec2::254")).toBe(true)
    expect(isBlockedIp("8.8.8.8")).toBe(false)
    expect(isBlockedIp("::ffff:808:808")).toBe(false)
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false)
    expect(isBlockedIp("172.15.255.255")).toBe(false)
    expect(isBlockedIp("172.31.255.255")).toBe(true)
    expect(isBlockedIp("172.32.0.1")).toBe(false)
    expect(isBlockedIp("192.167.1.1")).toBe(false)
    expect(isBlockedIp("11.0.0.1")).toBe(false)
  })
})
