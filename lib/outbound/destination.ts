/**
 * Destination checks for a server-side HTTPS fetch.
 *
 * This is not a form validator. Customer website and profile URLs are stored
 * and displayed; they are not fetched. Callers that do open a connection use
 * these checks so a provider-supplied URL cannot reach loopback, private
 * networks, link-local addresses, or cloud metadata.
 */

import { lookup as dnsLookup } from "node:dns/promises"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP, type LookupFunction } from "node:net"
import { Readable } from "node:stream"

export const OUTBOUND_MAX_URL_LENGTH = 2048
export const OUTBOUND_MAX_REDIRECTS = 3
export const OUTBOUND_TIMEOUT_MS = 8000

const CONTROL = /[\u0000-\u001F\u007F]/
const BAD_PERCENT = /%(?![0-9A-Fa-f]{2})/
const ENCODED_CONTROL = /%(?:0[0-9A-Fa-f]|1[0-9A-Fa-f]|7[Ff])/

const blocked = new BlockList()
blocked.addSubnet("0.0.0.0", 8, "ipv4")
blocked.addSubnet("10.0.0.0", 8, "ipv4")
blocked.addSubnet("100.64.0.0", 10, "ipv4")
blocked.addSubnet("127.0.0.0", 8, "ipv4")
blocked.addSubnet("169.254.0.0", 16, "ipv4")
blocked.addSubnet("172.16.0.0", 12, "ipv4")
blocked.addSubnet("192.0.0.0", 24, "ipv4")
blocked.addSubnet("192.0.2.0", 24, "ipv4")
blocked.addSubnet("192.168.0.0", 16, "ipv4")
blocked.addSubnet("198.18.0.0", 15, "ipv4")
blocked.addSubnet("198.51.100.0", 24, "ipv4")
blocked.addSubnet("203.0.113.0", 24, "ipv4")
blocked.addSubnet("224.0.0.0", 4, "ipv4")
blocked.addSubnet("240.0.0.0", 4, "ipv4")
blocked.addAddress("::", "ipv6")
blocked.addAddress("::1", "ipv6")
blocked.addSubnet("fc00::", 7, "ipv6")
blocked.addSubnet("fe80::", 10, "ipv6")
blocked.addSubnet("ff00::", 8, "ipv6")
blocked.addAddress("fd00:ec2::254", "ipv6")

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
])

export type AddressLookup = (hostname: string) => Promise<readonly string[]>

export type OutboundDestination =
  | { state: "approved"; href: string }
  | { state: "rejected" }
  | { state: "unresolved" }

export type OutboundTarget = {
  href: string
  host: string
  literal: boolean
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
}

function dnsHost(hostname: string): string {
  const bare = stripBrackets(hostname).toLowerCase()
  return bare.endsWith(".") ? bare.slice(0, -1) : bare
}

function expandGroups(value: string, length: number): number[] | null {
  const halves = value.split("::")
  if (halves.length > 2) return null
  const side = (part: string) => (part ? part.split(":") : [])
  const left = side(halves[0] ?? "")
  const right = halves.length === 2 ? side(halves[1] ?? "") : []
  if (halves.length === 1 && left.length !== length) return null
  const missing = length - left.length - right.length
  if (missing < 0) return null
  const raw = [...left, ...Array.from({ length: missing }, () => "0"), ...right]
  if (raw.length !== length) return null
  const groups: number[] = []
  for (const part of raw) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null
    groups.push(Number.parseInt(part, 16))
  }
  return groups
}

function parseIpv6(address: string): number[] | null {
  let value = address.toLowerCase()
  const dotted = value.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null
    const [a, b, c, d] = dotted[2].split(".").map(part => Number(part))
    const hi = ((a << 8) | b).toString(16)
    const lo = ((c << 8) | d).toString(16)
    value = `${dotted[1]}${hi}:${lo}`
  }
  return expandGroups(value, 8)
}

function ipv4FromGroups(high: number, low: number): string {
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
}

function embeddedIpv4(groups: readonly number[]): string | null {
  const leadingZero = (count: number) => groups.slice(0, count).every(part => part === 0)
  if (leadingZero(5) && groups[5] === 0xffff) return ipv4FromGroups(groups[6], groups[7])
  if (leadingZero(4) && groups[4] === 0xffff && groups[5] === 0) return ipv4FromGroups(groups[6], groups[7])
  if (groups[0] === 0x2002) return ipv4FromGroups(groups[1], groups[2])
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    return ipv4FromGroups(groups[6], groups[7])
  }
  if (leadingZero(6) && !(groups[6] === 0 && groups[7] <= 1)) return ipv4FromGroups(groups[6], groups[7])
  return null
}

export function isBlockedHostname(hostname: string): boolean {
  const host = dnsHost(hostname)
  if (!host) return true
  if (BLOCKED_HOSTS.has(host)) return true
  if (host === "local" || host.endsWith(".local")) return true
  if (host.endsWith(".localhost") || host.endsWith(".localhost.localdomain")) return true
  return false
}

export function isBlockedIp(address: string): boolean {
  const bare = dnsHost(address)
  const kind = isIP(bare)
  if (kind === 4) return blocked.check(bare, "ipv4")
  if (kind !== 6) return false
  const groups = parseIpv6(bare)
  if (!groups) return true
  const embedded = embeddedIpv4(groups)
  if (embedded && blocked.check(embedded, "ipv4")) return true
  return blocked.check(bare, "ipv6")
}

export function selectConnectAddresses(addresses: readonly string[] | null | undefined): readonly string[] | null {
  if (!addresses || addresses.length === 0) return null
  const selected: string[] = []
  for (const address of addresses) {
    if (typeof address !== "string" || isIP(dnsHost(address)) === 0 || isBlockedIp(address)) return null
    selected.push(dnsHost(address))
  }
  return selected
}

export function outboundRequestTarget(value: string): OutboundTarget | null {
  if (typeof value !== "string" || value.length === 0 || value.length > OUTBOUND_MAX_URL_LENGTH) return null
  if (CONTROL.test(value) || /\s/.test(value) || value.includes("\\")) return null
  if (BAD_PERCENT.test(value) || ENCODED_CONTROL.test(value)) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:") return null
  if (parsed.username || parsed.password) return null
  if (parsed.port) return null
  if (isBlockedHostname(parsed.hostname)) return null
  const host = dnsHost(parsed.hostname)
  if (!host) return null
  const literal = isIP(host) !== 0
  if (literal && isBlockedIp(host)) return null
  return { href: parsed.href, host, literal }
}

export async function approveOutboundDestination(
  value: string,
  lookup: AddressLookup,
): Promise<OutboundDestination> {
  const target = outboundRequestTarget(value)
  if (!target) return { state: "rejected" }
  if (target.literal) return { state: "approved", href: target.href }
  try {
    const addresses = await lookup(target.host)
    if (!selectConnectAddresses(addresses)) return { state: "rejected" }
    return { state: "approved", href: target.href }
  } catch {
    return { state: "unresolved" }
  }
}

export async function defaultAddressLookup(hostname: string): Promise<readonly string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map(record => record.address)
}

function unavailable(): NodeJS.ErrnoException {
  return Object.assign(new Error("unavailable"), { code: "ENOTFOUND" })
}

/** Connection-time lookup. The address passed to Node is the one just checked. */
export function createConnectLookup(lookup: AddressLookup): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname).then(addresses => {
      const selected = selectConnectAddresses(addresses)
      const family = options.family
      const filtered = selected && (family === 4 || family === 6)
        ? selected.filter(address => isIP(address) === family)
        : selected
      if (!filtered || filtered.length === 0) {
        callback(unavailable(), "")
        return
      }
      if (options.all) {
        callback(null, filtered.map(address => ({ address, family: isIP(address) })))
        return
      }
      callback(null, filtered[0], isIP(filtered[0]))
    }).catch(() => {
      callback(unavailable(), "")
    })
  }
}

/**
 * HTTPS GET that does not follow redirects and resolves through the guarded lookup.
 * IP literals never reach DNS, so they are rejected here before connect.
 */
export function fetchGuardedHttps(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const target = outboundRequestTarget(raw)
  if (!target) return Promise.reject(new Error("unavailable"))
  const signal = init?.signal ?? null
  const parsed = new URL(target.href)
  if (signal?.aborted) return Promise.reject(new Error("unavailable"))
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (request: ReturnType<typeof httpsRequest>) => {
      if (settled) return
      settled = true
      request.destroy()
      reject(new Error("unavailable"))
    }
    const req = httpsRequest({
      protocol: "https:",
      hostname: target.host,
      port: 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: { accept: "*/*" },
      timeout: OUTBOUND_TIMEOUT_MS,
      servername: target.literal ? undefined : target.host,
      lookup: createConnectLookup(defaultAddressLookup),
    }, incoming => {
      if (settled) {
        incoming.destroy()
        return
      }
      settled = true
      const headers = new Headers()
      for (const [key, header] of Object.entries(incoming.headers)) {
        if (header == null) continue
        const values = Array.isArray(header) ? header : [header]
        for (const item of values) headers.append(key, item)
      }
      const status = incoming.statusCode ?? 0
      if (status >= 300 && status < 400) {
        incoming.destroy()
        resolve(new Response(null, { status, headers }))
        return
      }
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers }))
    })
    const stop = () => fail(req)
    req.on("timeout", stop)
    req.on("error", () => {
      if (!settled) stop()
    })
    signal?.addEventListener("abort", stop, { once: true })
    req.on("close", () => signal?.removeEventListener("abort", stop))
    req.end()
  })
}
