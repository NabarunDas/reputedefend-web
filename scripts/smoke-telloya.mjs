import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const port = 4323
const origin = `http://127.0.0.1:${port}`
const server = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: fileURLToPath(new URL("../apps/telloya", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      VERCEL_ENV: "production",
      TELLOYA_LAUNCHED: "false",
    },
  }
)

let serverLog = ""
server.stdout.on("data", (chunk) => {
  serverLog += chunk
})
server.stderr.on("data", (chunk) => {
  serverLog += chunk
})

function assertMarketingPolicy(csp) {
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self' 'unsafe-inline'/)
  assert.match(csp, /script-src-attr 'none'/)
  assert.match(csp, /style-src 'self' 'unsafe-inline'/)
  assert.match(csp, /img-src 'self' data:/)
  assert.match(csp, /font-src 'self'/)
  assert.match(csp, /frame-src 'none'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /form-action 'self'/)
}

try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Telloya server exited: ${serverLog}`)
    try {
      ready = (await fetch(`${origin}/`)).status === 200
    } catch {
      /* Wait for startup. */
    }
    if (ready) break
    await delay(250)
  }
  assert.ok(ready, `Telloya production server did not become ready\n${serverLog}`)

  // Test pre-launch state
  for (const path of ["/", "/robots.txt", "/sitemap.xml"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" })
    assert.equal(response.headers.get("content-security-policy-report-only"), null, path)
    const csp = response.headers.get("content-security-policy") ?? ""
    assert.ok(csp, path)
    assertMarketingPolicy(csp)
    assert.equal(response.headers.get("x-frame-options"), "DENY", path)
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path)

    // Pre-launch: should be noindex
    const robotsTag = response.headers.get("x-robots-tag") ?? ""
    assert.match(robotsTag, /noindex/, `${path} should have noindex in pre-launch`)

    assert.equal(response.status, 200, path)
    const content = await response.text()

    if (path === "/") {
      assert.match(content, /_next\/static\//, path)
      assert.match(content, /Telloya/, path)
      assert.match(content, /Coming Soon/, path)
      assert.match(content, /ProfileRelaunch Ltd/, path)
      assert.match(content, /17520826/, "Should include company registration number")
      assert.doesNotMatch(content, /ensures no opportunity is missed/, "Should not use absolute claims")
    }

    if (path === "/robots.txt") {
      assert.match(content, /Disallow: \//, "Pre-launch robots.txt should disallow all")
    }

    if (path === "/sitemap.xml") {
      // Pre-launch sitemap should be empty or minimal
      assert.doesNotMatch(content, /<url>/, "Pre-launch sitemap should not contain URLs")
    }
  }

  console.log("Telloya production HTTP smoke checks passed (pre-launch state)")
} finally {
  server.kill("SIGTERM")
  await once(server, "exit")
}
