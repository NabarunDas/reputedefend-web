import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { execSync } from "node:child_process"

const require = createRequire(import.meta.url)
const port = 4323
const origin = `http://127.0.0.1:${port}`
const telloyaDir = fileURLToPath(new URL("../apps/telloya", import.meta.url))

function assertMarketingPolicy(csp) {
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /script-src 'self' 'unsafe-inline'/)
  assert.match(csp, /script-src-attr 'none'/)
  assert.match(csp, /style-src 'self' 'unsafe-inline'/)
  assert.match(csp, /img-src 'self' data:/)
  assert.match(csp, /font-src 'self'/)
  assert.match(csp, /frame-src https:\/\/customer-k6b36ti9xjcfwdlg\.cloudflarestream\.com(?:;|$)/)
  assert.doesNotMatch(csp, /frame-src[^;]*(?:'none'|\*|youtube|vimeo|videodelivery)/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /form-action 'self'/)
}

async function testLaunchState(launched, description) {
  console.log(`Building Telloya with TELLOYA_LAUNCHED=${launched ? "true" : "false"}...`)
  
  // Rebuild with the correct environment variable
  try {
    execSync("npm run build", {
      cwd: telloyaDir,
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        VERCEL_ENV: "production",
        TELLOYA_LAUNCHED: launched ? "true" : "false",
      },
    })
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`)
  }

  const server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: telloyaDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        VERCEL_ENV: "production",
        TELLOYA_LAUNCHED: launched ? "true" : "false",
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

    // Test homepage, robots.txt, and sitemap
    for (const path of ["/", "/demo", "/industries", "/privacy", "/terms", "/robots.txt", "/sitemap.xml"]) {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" })
      assert.equal(response.headers.get("content-security-policy-report-only"), null, path)
      const csp = response.headers.get("content-security-policy") ?? ""
      assert.ok(csp, path)
      assertMarketingPolicy(csp)
      assert.equal(response.headers.get("x-frame-options"), "DENY", path)
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", path)

      // Check X-Robots-Tag based on launch state
      const robotsTag = response.headers.get("x-robots-tag") ?? ""
      if (launched) {
        assert.equal(robotsTag, "all", `${path} should have X-Robots-Tag: all when launched`)
      } else {
        assert.match(robotsTag, /noindex/, `${path} should have noindex when not launched`)
      }

      assert.equal(response.status, 200, path)
      const content = await response.text()

      if (path === "/") {
        assert.match(content, /_next\/static\//, path)
        assert.match(content, /Telloya/, path)
        assert.match(content, /Experience Telloya answering calls for your business/)
        assert.match(content, /\/enquire\?intent=personalised-demo/)
        assert.match(content, /Don(?:'|&#0?39;|&#x27;)t Let Missed Calls/, "Homepage should have hero headline")
        assert.match(content, /Cost You Customers/, "Homepage should have headline emphasis")
        assert.doesNotMatch(content, /Never Misses a Call/, "Homepage should not use the retired absolute claim")
        assert.match(content, /ProfileRelaunch Ltd/, path)
        assert.match(content, /17520826/, "Should include company registration number")
        assert.doesNotMatch(content, /ensures no opportunity is missed/, "Should not use absolute claims")
        
        // Check metadata robots based on launch state
        if (launched) {
          assert.doesNotMatch(content, /noindex/, "Should not have noindex meta when launched")
        } else {
          assert.match(content, /noindex/, "Should have noindex meta when not launched")
        }
      }

      if (path === "/demo") {
        assert.match(content, /Fictional browser-only walkthrough/)
        assert.match(content, /Illustrative demonstration featuring fictional characters and enquiries/)
        assert.match(content, /See how Telloya works/)
        assert.match(content, /Explore Pricing/)
        assert.match(content, /Experience Telloya answering calls for your business/)
        assert.match(content, /No payment details required/)
        assert.match(content, /Request a personalised demo/)
        assert.match(content, /\/enquire\?intent=personalised-demo/)
        assert.doesNotMatch(content, /\bfree demo\b/i)
        assert.match(content, /Enquire about Telloya/)
        assert.doesNotMatch(content, /See whether Telloya fits the way you work/)
        assert.match(content, /Hartley Plumbing/)
        assert.match(content, /See Telloya in Action/)
        assert.doesNotMatch(content, /Retell|Twilio|Stripe/)
      }

      if (path === "/privacy") {
        assert.match(content, /Draft for legal review/)
        assert.match(content, /Automatic deletion after 90 days is not operating/)
        assert.match(content, /Basic Attributes Only/)
        assert.match(content, /full call recordings and transcripts are not retained in its normal call history/)
        assert.match(content, /https:\/\/www\.retellai\.com\/legal\/privacy-policy/)
        assert.match(content, /https:\/\/www\.retellai\.com\/legal\/terms-of-service/)
        assert.doesNotMatch(content, /has not been verified|contractual opt-out|10 minutes|we do not record|recordings are not kept|this notice confirms that calls are not recorded/i)
        assert.match(content, /Supabase/)
        assert.match(content, /Resend/)
        assert.match(content, /Vercel/)
        assert.match(content, /Cloudflare Stream/)
      }

      if (path === "/terms") {
        assert.match(content, /Draft for legal review/)
        assert.match(content, /VAT is not charged on the published prices/)
        assert.match(content, /does not confirm a demonstration appointment/)
        assert.match(content, /not the agreement for a paid Telloya subscription/)
        assert.match(content, /Governing law, jurisdiction, liability and service credits are not set out/)
        assert.doesNotMatch(content, /VAT-exempt|courts of|liability cap|service credit of/i)
      }

      if (path === "/industries") {
        assert.match(content, /Illustrative example/)
        assert.match(content, /Leaking kitchen tap/)
        assert.match(content, /Heating repair enquiry/)
        assert.match(content, /Additional sockets/)
        assert.match(content, /Routine tenant repair/)
        assert.match(content, /not a real customer conversation or a testimonial/)
        assert.match(content, /\/enquire\?intent=personalised-demo/)
        assert.match(content, /Enquire now/)
        assert.doesNotMatch(content, /customers say|read our testimonials|success stories/i)
      }

      if (path === "/robots.txt") {
        if (launched) {
          assert.match(content, /Allow: \//, "Launched robots.txt should allow")
          assert.doesNotMatch(content, /Disallow: \//, "Launched robots.txt should not disallow all")
        } else {
          assert.match(content, /Disallow: \//, "Pre-launch robots.txt should disallow all")
        }
      }

      if (path === "/sitemap.xml") {
        if (launched) {
          assert.match(content, /<url>/, "Launched sitemap should contain URLs")
          assert.match(content, /telloya\.com/, "Launched sitemap should contain domain")
          assert.match(content, /telloya\.com\/demo/, "Launched sitemap should list the illustrative demo")
        } else {
          assert.doesNotMatch(content, /<url>/, "Pre-launch sitemap should not contain URLs")
        }
      }
    }

    console.log(`Telloya production HTTP smoke checks passed (${description})`)
  } finally {
    server.kill("SIGTERM")
    await once(server, "exit")
  }
}

// Test both launch states
await testLaunchState(false, "pre-launch state: TELLOYA_LAUNCHED=false")
await testLaunchState(true, "launched state: TELLOYA_LAUNCHED=true")
