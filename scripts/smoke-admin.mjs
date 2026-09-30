import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const port = 4319
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("../apps/admin", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ADMIN_AUTH_ENABLED: "false" },
})
let serverLog = ""
server.stdout.on("data", chunk => { serverLog += chunk })
server.stderr.on("data", chunk => { serverLog += chunk })
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Admin server exited: ${serverLog}`)
    try { ready = (await fetch(`${origin}/login`)).status === 200 } catch { /* Wait for startup. */ }
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, "Admin production server did not become ready")
  for (const path of ["/login", "/", "/security", "/clients/private?email=hidden@example.com", "/api/clients", "/activity", "/cases", "/documents", "/tasks", "/communications", "/conversations", "/commercial", "/operations/jobs", "/api/cases/command", "/api/evidence/command", "/api/packs/command", "/api/authorization/command", "/api/manager-access/command", "/api/operations/jobs", "/api/operations/communications", "/api/operations/conversations", "/api/operations/catalogue", "/api/operations/quotes", "/enquiries", "/enquiries/new", "/api/enquiries/options", "/records/client", "/records/business/new", "/records/location", "/api/records/save", "/api/sessions/revoke", "/robots.txt", "/brand/profile-relaunch-logo.png"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.equal(response.headers.get("x-frame-options"), "DENY")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    if (path === "/login") {
      const html = await response.text()
      assert.equal(response.status, 200)
      assert.match(html, /Sign-in is not available yet/)
      assert.doesNotMatch(html, /googletagmanager|google-analytics|<form/)
      assert.doesNotMatch(html, /admin@profilerelaunch\.com/)
      assert.match(html, /Admin Portal/)
    } else if (path.startsWith("/brand/")) {
      assert.equal(response.status, 200)
    } else if (path.startsWith("/api")) {
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: "Staff sign-in is required." })
    } else if (path === "/robots.txt") {
      assert.match(await response.text(), /Disallow: \//)
    } else {
      assert.equal(response.status, 303)
      assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login")
      assert.equal(new URL(response.headers.get("location"), origin).search, "")
    }
  }
  const cron = await fetch(`${origin}/api/internal/jobs/run`, { redirect: "manual" })
  assert.match(cron.headers.get("x-robots-tag") ?? "", /noindex/)
  assert.match(cron.headers.get("cache-control") ?? "", /no-store/)
  assert.equal(cron.status, 503)
  assert.equal((await cron.json()).status, "disabled")
  const webhook = await fetch(`${origin}/api/webhooks/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
  assert.match(webhook.headers.get("x-robots-tag") ?? "", /noindex/)
  assert.match(webhook.headers.get("cache-control") ?? "", /no-store/)
  assert.equal(webhook.status, 503)
  assert.equal((await webhook.json()).status, "disabled")
  const inbound = await fetch(`${origin}/api/webhooks/resend/inbound`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
  assert.match(inbound.headers.get("x-robots-tag") ?? "", /noindex/)
  assert.match(inbound.headers.get("cache-control") ?? "", /no-store/)
  assert.equal(inbound.status, 503)
  assert.equal((await inbound.json()).status, "disabled")
  assert.equal((await fetch(`${origin}/login`, { method: "POST" })).status, 401)
  assert.equal((await fetch(`${origin}/api/sessions/revoke`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ sessionId: "33333333-3333-4333-8333-333333333333" }) })).status, 401)
  console.log("Admin production HTTP smoke checks passed")
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit")
    server.kill("SIGTERM")
    await stopped
  }
}
