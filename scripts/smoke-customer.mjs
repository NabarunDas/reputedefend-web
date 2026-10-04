import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

function assertCustomerBrand(html) {
  assert.match(html, /profile-relaunch-logo\.png/)
  assert.match(html, /profile-relaunch-logo-light\.png/)
  assert.match(html, /ProfileRelaunch home/)
  assert.match(html, /Restore visibility\. Protect your reputation\./)
  assert.match(html, /independent of Google/)
  assert.doesNotMatch(html, /class="brand"|Cookie Settings|Get Help|googletagmanager|google-analytics|Customer Login|admin@profilerelaunch/)
}

const port = 4320
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("../apps/customer", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    CUSTOMER_AUTH_ENABLED: "false",
    CUSTOMER_PORTAL_ENABLED: "",
  },
})
let serverLog = ""
server.stdout.on("data", chunk => { serverLog += chunk })
server.stderr.on("data", chunk => { serverLog += chunk })
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Customer server exited: ${serverLog}`)
    try { ready = (await fetch(`${origin}/`)).status === 200 } catch { /* Wait for startup. */ }
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, "Customer production server did not become ready")
  for (const asset of ["/icon.png", "/apple-icon.png", "/brand/profile-relaunch-logo.png", "/brand/profile-relaunch-logo-light.png"]) {
    const assetResponse = await fetch(`${origin}${asset}`, { redirect: "manual" })
    assert.equal(assetResponse.status, 200, asset)
    assert.match(assetResponse.headers.get("content-type") ?? "", /image\/png/)
    assert.match(assetResponse.headers.get("x-robots-tag") ?? "", /noindex/)
    const bytes = Buffer.from(await assetResponse.arrayBuffer())
    assert.ok(bytes.byteLength > 1000, asset)
  }
  const optimised = await fetch(`${origin}/_next/image?url=${encodeURIComponent("/brand/profile-relaunch-logo.png")}&w=256&q=75`, {
    redirect: "manual",
    headers: { accept: "image/avif,image/webp,image/png,*/*" },
  })
  assert.equal(optimised.status, 200)
  assert.equal(optimised.headers.get("location"), null)
  const optimisedType = optimised.headers.get("content-type") ?? ""
  assert.match(optimisedType, /^image\//)
  const optimisedBytes = Buffer.from(await optimised.arrayBuffer())
  assert.ok(optimisedBytes.byteLength > 0)
  if (/image\/(avif|webp|jpe?g)/.test(optimisedType)) {
    assert.ok(optimisedBytes.byteLength < 283215, `optimised logo was ${optimisedBytes.byteLength} bytes`)
  }
  const remote = await fetch(`${origin}/_next/image?url=${encodeURIComponent("https://example.com/logo.png")}&w=256&q=75`, { redirect: "manual" })
  assert.notEqual(remote.status, 200)
  assert.doesNotMatch(remote.headers.get("content-type") ?? "", /^image\//)
  await remote.arrayBuffer()
  for (const path of ["/", "/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/pay/return", "/case", "/api/action/exchange", "/api/action/otp", "/api/action/verify", "/api/action/command", "/api/action/payment", "/api/case/evidence/access", "/api/case/evidence/upload", "/robots.txt"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.equal(response.headers.get("x-frame-options"), "DENY")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    const csp = response.headers.get("content-security-policy") ?? ""
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self'/)
    assert.match(csp, /connect-src 'self'/)
    assert.match(csp, /frame-src 'none'/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /base-uri 'self'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /form-action 'self'/)
    assert.match(csp, /font-src 'self'/)
    assert.doesNotMatch(csp, /googletagmanager|google-analytics|fonts\.googleapis|fonts\.gstatic|unsafe-eval/)
    if (path === "/robots.txt") {
      assert.match(await response.text(), /Disallow: \//)
    } else if (path.startsWith("/api")) {
      assert.equal(response.status, 401)
      const payload = await response.json()
      assert.match(payload.message, /unavailable or has expired/)
    } else if (path === "/case") {
      assert.equal(response.status, 303)
    } else if (path === "/pay/return") {
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.match(html, /confirming your payment/i)
      assertCustomerBrand(html)
      assert.doesNotMatch(html, /Payment successful/)
    } else {
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.match(html, /unavailable or has expired|Checking this link|Secure action/)
      assertCustomerBrand(html)
    }
  }
  const portalPages = [
    "/login",
    "/portal",
    "/portal/cases",
    "/portal/cases/PR-26-AAAAAA",
    "/portal/cases/PR-26-AAAAAA/documents",
    "/portal/cases/PR-26-AAAAAA/service",
    "/portal/cases/PR-26-AAAAAA/payments",
    "/portal/documents",
    "/portal/payments",
    "/portal/guard",
    `/portal/guard/gd-${"ab".repeat(32)}`,
    "/portal/messages",
    `/portal/messages/mc-${"ab".repeat(32)}`,
    "/portal/account",
  ]
  for (const path of portalPages) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.equal(response.status, 303, path)
    assert.equal(response.headers.get("location"), `${origin}/`)
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.equal(response.headers.get("x-frame-options"), "DENY")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    assert.equal(response.headers.get("set-cookie"), null)
    const html = await response.text()
    assert.doesNotMatch(html, /Welcome to My ProfileRelaunch|ALEX_BUSINESS_SECRET|Sign in to your ProfileRelaunch account/)
  }
  const portalPosts = [
    ["/api/portal/auth/start", { email: "alex@example.com" }],
    ["/api/portal/auth/resend", {}],
    ["/api/portal/auth/verify", { code: "000000" }],
    ["/api/portal/auth/sign-out", {}],
    ["/api/portal/evidence", { operation: "begin" }],
    ["/api/portal/service", { operation: "accept_quote" }],
    ["/api/portal/payments", { operation: "start_checkout" }],
    ["/api/portal/guard", { operation: "accept" }],
  ]
  for (const [path, body] of portalPosts) {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 404, path)
    const payload = await response.json()
    assert.match(payload.message, /unavailable/)
    assert.equal(response.headers.get("set-cookie"), null)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.doesNotMatch(JSON.stringify(payload), /alex@example.com|stripe|supabase/i)
  }
  const portalReads = [
    "/api/portal/documents/download?reference=PR-26-AAAAAA&selector=pd-1",
    `/api/portal/payments/receipt?selector=rc-${"ab".repeat(32)}`,
    `/api/portal/payments/invoice?reference=PR-26-AAAAAA&selector=ca-${"ab".repeat(32)}`,
    "/api/portal/not-a-route",
  ]
  for (const path of portalReads) {
    const response = await fetch(`${origin}${path}`, {
      redirect: "manual",
      headers: { cookie: "__Host-pr-portal=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    })
    assert.equal(response.status, 404, path)
    assert.equal(response.headers.get("set-cookie"), null)
    const payload = await response.text()
    assert.doesNotMatch(payload, /Welcome to My ProfileRelaunch|storageKey|storageBucket/)
  }
  console.log("Customer production HTTP smoke checks passed")
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit")
    server.kill("SIGTERM")
    await stopped
  }
}
