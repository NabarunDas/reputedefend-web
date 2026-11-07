# Telloya M-04A — launch quality, analytics and SEO audit

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `17abdb7d`, which includes merged Marketing M-03A (PR #449) and the usage-ledger work from PR #448 (`986f37eb`).
**Scope:** the Telloya marketing application, its tests, and this note. Admin, Customer, Supabase, legal drafts, prices, and feature flags were not changed.

This is an audit of the site as it stands before public launch. It does not launch the site, submit it to a search engine, create a GA4 property, or turn enquiry submission on.

## 1. Page-by-page audit matrix

Checked against a production build served locally with `TELLOYA_LAUNCHED` unset and `TELLOYA_ENQUIRY_ENABLED=false`. Every page returned `X-Robots-Tag: noindex, nofollow, noarchive` and `<meta name="robots" content="noindex, nofollow, noarchive">`.

| Route | Document title | Canonical | H1 | Notes |
| --- | --- | --- | --- | --- |
| `/` | AI Receptionist for Tradespeople & Local Services \| Telloya | `https://telloya.com` | Your AI Receptionist / Never Misses a Call | Hero, primary CTAs, and console image unchanged |
| `/how-it-works` | How Telloya Works – AI Receptionist for Missed Calls \| Telloya | `https://telloya.com/how-it-works` | From missed call to useful lead | Links on to the demo |
| `/demo` | See Telloya in Action \| Telloya | `https://telloya.com/demo` | See Telloya in Action | Fictional disclosure is in the HTML. No analytics script |
| `/features` | Features – Telloya AI Receptionist \| Telloya | `https://telloya.com/features` | Designed for tradespeople | Call history and usage visibility stay described as planned |
| `/industries` | Industries – Telloya for Tradespeople & Local Services \| Telloya | `https://telloya.com/industries` | Built for tradespeople | Trade examples, no booking claim |
| `/pricing` | Pricing – Telloya AI Receptionist \| Telloya | `https://telloya.com/pricing` | Choose your plan | Four plan CTAs preselect Basic, Growth, Pro, and Custom |
| `/enquire` | Enquire About Telloya – AI Receptionist for Tradespeople \| Telloya | `https://telloya.com/enquire` | Enquire about Telloya for your business | Public submission is the pre-launch notice, not a live form |
| `/cookies` | Cookies and analytics \| Telloya | `https://telloya.com/cookies` | Cookies and analytics | Explains consent. It does not load Google |

Titles and descriptions are unique. Open Graph and Twitter tags repeat the page title, description, and `https://telloya.com/brand/telloya-social-share.webp` (1200×675, large image card). Favicon files resolve: `telloya-favicon.ico`, 16, 32, and 192 PNG icons, the 180 apple icon, and `/manifest.json` (192 and 512). The share image and favicon returned HTTP 200.

`/robots.txt` is `Disallow: /` and has no sitemap line. `/sitemap.xml` is an empty urlset. Both stay empty unless `VERCEL_ENV=production` and `TELLOYA_LAUNCHED=true`. The launched sitemap, when that gate is on, lists only the eight routes above.

Internal destinations checked in the pricing and shared navigation HTML: `/`, `/how-it-works`, `/demo`, `/features`, `/industries`, `/pricing`, `/enquire`, `/cookies`, and `/enquire?plan=basic|growth|pro|custom`. Footer Privacy and Terms go to the existing ProfileRelaunch company notices. They are still described as company notices, not Telloya service terms.

## 2. SEO findings and required configuration

Canonical URLs are built from `https://telloya.com` in `apps/telloya/lib/brand.ts`. Page metadata sets a path under that host. Nothing in this audit changed DNS.

What still has to be confirmed by the owner before anyone asks Google to index the site:

- `https://telloya.com` is the only host that should be canonical. `www` and any Vercel preview host need to redirect there, or stay non-indexable. This audit did not query DNS and did not create records.
- The production Vercel deployment is the one attached to that host. Preview deployments must stay on their preview host.
- Google Search Console for `https://telloya.com` is an owner task. Do not submit the sitemap until the launch gate is intentionally opened and a fresh production build has been made.
- `TELLOYA_LAUNCHED` must stay unset until that decision. This PR does not change it.
- `X-Robots-Tag` and the metadata robots rules are fixed when the Telloya app is built. Changing the env var on an already built deployment does not retag the pages. Launch needs a production rebuild with `VERCEL_ENV=production` and `TELLOYA_LAUNCHED=true`.

Lighthouse SEO scored 69 on the measured pages. The only failed SEO audit was `is-crawlable` (“Page is blocked from indexing”). That is the pre-launch gate working. The other automated SEO checks passed, including title, meta description, link text, crawlable anchors, and tap targets.

## 3. Analytics and privacy checks

Telloya analytics read `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` and `telloya:analytics-consent:v1`. They do not read `NEXT_PUBLIC_GA_MEASUREMENT_ID` or `profilerelaunch:analytics-consent:v1`.

This environment has no Telloya measurement ID. The task also recorded that the latest Vercel environment listing did not contain `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID`. No ID was invented and GA4 was not enabled. Until a valid `G-` ID is configured, the consent banner, cookie-settings control, and gtag script do not render. The `/demo` HTML contained no `googletagmanager` request.

When an ID is present, the existing client still requires an explicit accept before any script or page view. Reject and withdraw set analytics storage to denied, set `ga-disable-<id>`, delete `_ga` cookies, and remove the gtag script. Advertising consent stays denied (`ad_storage`, `ad_user_data`, `ad_personalization`). Page views send the path and origin only, with the query string and hash removed. `generate_lead` is sent only after a persisted TY enquiry whose response sets `leadConversion`, and only with `lead_type`, an allow-listed `plan_tier`, and `guard_interested`. The event function does not accept a name, email, phone, or TY reference.

Preview is now an extra stop. `TelloyaAnalyticsRoot` is passed the server `VERCEL_ENV`. If that value is `preview`, the consent UI and gtag are not mounted even when a measurement ID is present. Local tests and a production deployment are unchanged. A preview build can still contain the ID in its JavaScript if someone sets the env var on Preview. Collection will not start, but the ID would be visible in the bundle. Keep the production ID off Preview.

### Proposed demo events, not implemented

Do not add these until they are reviewed. They would run only after analytics consent, only when collection is allowed, and never on Preview:

| Event | When | Parameters |
| --- | --- | --- |
| `demo_start` | Start the sample | `demo_version` only |
| `demo_step` | Next or previous | `demo_version`, numeric step index |
| `demo_summary` | Lead summary opened | `demo_version` |
| `demo_replay` | Replay | `demo_version` |
| `demo_cta` | Pricing or enquire link | `demo_version`, destination path with no query string |

No names, no fictional address, no stage text, and no enquiry fields. This PR does not send them.

## 4. Accessibility results and unresolved manual checks

Automated coverage: Vitest for the header, consent dialog, enquiry errors, and demo keyboard behaviour, plus Lighthouse 12.8.2 accessibility on the production build.

| Page | Lighthouse accessibility | Notes |
| --- | --- | --- |
| `/` mobile and desktop | 100 | One H1. Skip link target is now focusable |
| `/pricing` mobile | 100 | Comparison table scrolls inside its region |
| `/demo` mobile | 100 | Named buttons, live status, reduced motion |
| `/enquire` mobile, after the heading fix | 100 | Was 98 before the pre-launch title moved from `h3` to `h2` |

Contrast checked as pairs, normal text, WCAG 2.2 AA threshold 4.5:1:

| Pair | Ratio |
| --- | --- |
| `#5d6d66` on `#f7f8f3` | 5.12 |
| `#0a6e3c` on `#f7f8f3` | 5.95 |
| `#fca5a5` on `#00110e` | 10.18 |
| `#b6d0bd` on `#00110e` | 11.73 |
| `#eaf9e7` on `#00110e` | 17.67 |
| `#ffffff` on `#0a6e3c` | 6.35 |

Disabled demo controls use 45% opacity. Inactive components are exempt from the text-contrast requirement, so that treatment was left as designed.

Fixes in this pass:

- `#main-content` has `tabIndex={-1}` so “Skip to content” can move focus, not only scroll.
- The mobile menu is `aria-modal` only while open, and `aria-hidden` while closed. It was already `inert` when closed.
- Closing cookie settings returns focus to the control that opened them. If that control was the banner, and the banner has gone, focus moves to the page target.
- Choosing a plan and confirming the privacy notice expose `aria-invalid` and `aria-describedby` when those checks fail.
- The enquiry step title, error summary, and success title keep a visible outline when focus is moved onto them. Demo controls and the summary heading do the same, including after a keyboard step.
- The pre-launch enquiry title is an `h2` under the page `h1`, so the heading sequence no longer skips a level.

What this did not prove:

- VoiceOver, NVDA, TalkBack, or Dragon were not run. Live announcements, rotor headings, and the demo live region need a manual assistive-technology pass.
- Text-only zoom at 200% and a physical keyboard on iOS and Android were not run. The three viewport captures and Lighthouse tap-target checks are the substitute.
- Focus appearance was checked in CSS and unit tests. A sighted keyboard walk of every page in Chrome, Safari, and Firefox is still worth doing before launch.
- The cookie banner does not appear without a measurement ID, so its focus trap was verified in unit tests rather than in the browser on this build.

## 5. Measured performance

Lighthouse 12.8.2, Headless Chrome 156, Linux, production `next start` on `127.0.0.1:4326`. Mobile used simulated throttling and a mobile screen. Desktop used the Lighthouse desktop preset, also simulated. No GA script was on the page. Scores below are the tool’s scores, not estimates.

| Run | Fetched (UK) | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT | FCP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` mobile | 12:00 | 92 | 100 | 100 | 69 | 3.3 s | 0 | 50 ms | 1.1 s |
| `/` desktop | 12:01 | 100 | 100 | 100 | 69 | 0.7 s | 0 | 0 ms | 0.3 s |
| `/pricing` mobile | 12:01 | 95 | 100 | 100 | 69 | 2.9 s | 0 | 80 ms | 1.1 s |
| `/demo` mobile | 12:01 | 97 | 100 | 100 | 69 | 2.7 s | 0 | 40 ms | 0.9 s |
| `/enquire` mobile | 12:05 | 96 | 100 | 100 | 69 | 2.8 s | 0 | 40 ms | 0.9 s |

Homepage LCP is the approved console image. On mobile, Lighthouse loaded `/brand/telloya-cinematic-console-mobile.webp` (about 52 KiB) and estimated 34 KiB could be saved because the file is 922×604 while the layout slot was about 545×356. It also reported that `fetchpriority=high` was not applied to that `<source>`. React’s source-element type does not include that attribute, and the file is the approved artwork, so the image was not rewritten. Desktop LCP was 0.7 s and the desktop performance score was 100.

CLS was 0 on every measured page. The console image has width and height. Fonts are self-hosted through `next/font`.

Render-blocking resources were the Next.js CSS chunks, roughly 6–9 KiB each, with an estimated 150–310 ms on simulated mobile and 60 ms on desktop. Unused JavaScript was estimated at 29 KiB. Legacy JavaScript was estimated at 13–14 KiB. Those are framework leftovers. They were not patched, because the measured scores are already in the nineties and a bundler change would be wider than this audit.

Client JavaScript under `.next/static` for this build was 661,125 bytes across 15 files, 204,723 bytes gzipped. The largest file was 228,651 bytes. The enquiry route and the demo page are client components, which is where the interaction cost sits. Total blocking time on the demo and enquiry pages was 40 ms under mobile simulation. A field INP measurement on a physical phone was not taken.

The demo does not fetch, animate when `prefers-reduced-motion: reduce` is set, or add a third-party script.

## 6. Mobile, tablet, and desktop screenshots

Captured with Headless Chrome from the same production server, full page, at 390×844, 768×1024, and 1440×900. `documentElement.scrollWidth` matched `clientWidth` on every capture (390, 753, and 1425 once the scrollbar was accounted for). The only nodes whose boxes extended past the viewport were the closed mobile menu, which is translated off-screen. That is not page overflow.

| Capture | What was visible |
| --- | --- |
| Homepage at 390, 768, and 1440 | “Never Misses a Call”, both hero CTAs, the console artwork, and the plan strip. No clipped headline |
| Pricing at 390, 768, and 1440 | Four plans, Guard as optional, and the comparison region. No horizontal page scroll |
| Enquire at 390, 768, and 1440 | Pre-launch notice, `contact@profilerelaunch.com` fully visible, “What happens next”, and the no-payment copy. At 1440 the notice and the aside sit side by side |
| Demo at 390, 768, and 1440 | Disclosure, fictional names, stage list, and the five controls. At 390 the controls are full width and at least 44px tall |

The homepage composition, logo, and hero were not redesigned. Screenshot files from this run are `m04a-home-390.png`, `m04a-home-768.png`, `m04a-home-1440.png`, and the same widths for `pricing`, `enquire`, and `demo`.

## 7. Issues fixed

| Issue | Change |
| --- | --- |
| A preview deployment could start GA4 if the measurement ID was present | `telloyaAnalyticsCollectionAllowed` in `apps/telloya/lib/analytics.ts`, applied by `apps/telloya/components/analytics-root.tsx` from `VERCEL_ENV` in `apps/telloya/app/layout.tsx` |
| Skip link could scroll without moving focus | `tabIndex={-1}` on `#main-content` in `apps/telloya/app/layout.tsx` |
| Closed mobile menu was still marked as a modal dialog | `apps/telloya/components/header.tsx` |
| Cookie settings could close onto a banner button that had unmounted | `apps/telloya/components/analytics-consent.tsx` |
| Plan and privacy errors were not tied to their controls | `apps/telloya/components/telloya-enquiry-form.tsx` |
| Programmatic focus on the form and demo was drawn without an outline | `apps/telloya/components/telloya-enquiry-form.module.css`, `apps/telloya/app/demo/demo.module.css` |
| Pre-launch enquiry title skipped from `h1` to `h3` | The status title is now an `h2` in `apps/telloya/components/telloya-enquiry-form.tsx` |

Tests covering the audit live in `apps/telloya/app/metadata.test.ts`, `apps/telloya/app/app.test.tsx`, `apps/telloya/app/demo/demo.test.tsx`, `apps/telloya/lib/analytics.test.ts`, `apps/telloya/components/analytics-root.test.tsx`, `apps/telloya/components/analytics-consent.test.tsx`, and `apps/telloya/components/telloya-enquiry-form.test.tsx`.

## 8. Remaining issues

**P0 — blocks a public launch, and was intentionally left alone**

- `TELLOYA_LAUNCHED` is not set. Preview and production stay non-indexable.
- `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` is not configured. Analytics cannot collect, which is correct until an owner creates the property and sets the ID.
- `TELLOYA_ENQUIRY_ENABLED` is false. The public page cannot persist a TY enquiry.
- Telloya service terms, the privacy supplement, VAT treatment, and `productionTaxBehaviour` are unpublished and unapproved.
- DNS for the canonical host and Search Console were not verified here and were not changed.

**P1 — worth an owner decision, not changed in this PR**

- Launch indexing depends on a new production build. A runtime flag change on an old build keeps the old robots tag.
- Do not put the production measurement ID on Vercel Preview. The client now refuses preview collection, and the ID should stay off that environment anyway.
- Homepage mobile LCP is 3.3 s under simulated slow 4G because of the approved console image and a small render-blocking stylesheet. Improving it means touching that image or the font/CSS delivery. That needs a design check.
- The approved console artwork contains a fictional telephone number. The demo does not. Editing the artwork is a brand decision.
- A manual screen-reader and physical-keyboard pass is still outstanding.

**P2 — small, left as designed**

- `telloya-favicon.ico` is 81 KiB beside the smaller PNG icons.
- The “Recommended” plan badge is 11px uppercase next to a 15px name.
- Demo arrow keys apply while focus is inside the sample.
- The header does not list the demo. The example section, How It Works, and the footer do. That placement came from M-03A.
- Lighthouse’s 13–29 KiB JavaScript notes are framework output.

## 9. Launch blockers and owner decisions

Before public launch, the owner still needs to decide and then configure:

1. Set `TELLOYA_LAUNCHED=true` only on the production Vercel environment, then rebuild so robots and the sitemap can open. Do not set it on Preview.
2. Confirm DNS so `https://telloya.com` is the canonical host, and add that property in Search Console. Submit the sitemap only after that rebuild.
3. Create a Telloya GA4 property, separate from ProfileRelaunch, and set `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` on production only.
4. Approve the Telloya terms, privacy supplement, and tax treatment before any page presents them as accepted.
5. Turn on `TELLOYA_ENQUIRY_ENABLED` only when the TY intake path is ready. This website still must not take payment or create a subscription.
6. Accept or reject the proposed demo events in section 3 before any of them are implemented.
7. Commission the manual assistive-technology pass in section 4.

None of those switches were flipped here.

## 10. What was not changed

- The cinematic visual design, Connected T logo, homepage hero (“Never Misses a Call”), and primary hero CTAs.
- Approved prices, minute allowances, Guard pricing, and the one-location standard plan.
- `TELLOYA_LAUNCHED`, public indexing, and enquiry submission. The local production server used for measurement was started with both launch flags off.
- Legal drafts and `productionTaxBehaviour`.
- Supabase migrations, hosted records, Admin, Customer, Stripe, Retell, phone forwarding, and live calls.
- GA4 properties, Vercel environment variables, and DNS.
