import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const port = 4320
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: fileURLToPath(new URL("../apps/customer", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CUSTOMER_AUTH_ENABLED: "false" },
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
  for (const path of ["/", "/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/api/action/exchange", "/api/action/otp", "/api/action/verify", "/api/action/command", "/robots.txt"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/)
    assert.match(response.headers.get("cache-control") ?? "", /no-store/)
    assert.equal(response.headers.get("x-frame-options"), "DENY")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    if (path === "/robots.txt") {
      assert.match(await response.text(), /Disallow: \//)
    } else if (path.startsWith("/api")) {
      assert.equal(response.status, 401)
      const payload = await response.json()
      assert.match(payload.message, /unavailable or has expired/)
    } else {
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.match(html, /unavailable or has expired|Checking this link|Secure action/)
      assert.doesNotMatch(html, /googletagmanager|google-analytics|Customer Login|admin@profilerelaunch/)
    }
  }
  console.log("Customer production HTTP smoke checks passed")
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit")
    server.kill("SIGTERM")
    await stopped
  }
}
