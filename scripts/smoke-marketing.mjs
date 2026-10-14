import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const port = 4321
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    MONITORING_PERSISTENCE_ENABLED: "true",
  },
})
let serverLog = ""
server.stdout.on("data", chunk => { serverLog += chunk })
server.stderr.on("data", chunk => { serverLog += chunk })

function assertMarketingPolicy(csp) {
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/www\.googletagmanager\.com/)
  assert.match(csp, /script-src-attr 'none'/)
  assert.match(csp, /style-src 'self' 'unsafe-inline'/)
  assert.match(csp, /img-src 'self' data:/)
  assert.doesNotMatch(csp, /img-src[^;]*\shttps:;/)
  assert.match(csp, /font-src 'self'/)
  assert.match(csp, /connect-src 'self'/)
  assert.match(csp, /https:\/\/www\.google-analytics\.com/)
  assert.match(csp, /frame-src 'none'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /form-action 'self'/)
  assert.doesNotMatch(csp, /unsafe-eval|doubleclick|googlesyndication|fonts\.googleapis|fonts\.gstatic/)
}

try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Marketing server exited: ${serverLog}`)
    try { ready = (await fetch(`${origin}/`)).status === 200 } catch { /* Wait for startup. */ }
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, `Marketing production server did not become ready\n${serverLog}`)

  for (const path of ["/", "/get-help", "/contact", "/start-monitoring", "/pricing", "/robots.txt"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.equal(response.headers.get("content-security-policy-report-only"), null, path)
    const csp = response.headers.get("content-security-policy") ?? ""
    assert.ok(csp, path)
    assertMarketingPolicy(csp)
    assert.equal(response.headers.get("x-frame-options"), "DENY", path)
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path)
    if (path === "/robots.txt") {
      assert.equal(response.status, 200)
      await response.text()
      continue
    }
    assert.equal(response.status, 200, path)
    const html = await response.text()
    assert.match(html, /\/_next\/static\//, path)
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag|google-analytics\.com\/g\/collect/, path)
    if (path === "/") {
      assert.match(html, /application\/ld\+json/)
      assert.match(html, /ProfileRelaunch/)
    }
    if (path === "/get-help" || path === "/contact" || path === "/start-monitoring") {
      assert.match(html, /<form\b/, path)
    }
  }

  console.log("Marketing production HTTP smoke checks passed")
} finally {
  server.kill("SIGTERM")
  await once(server, "exit")
}
