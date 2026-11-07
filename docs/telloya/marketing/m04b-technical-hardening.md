# Telloya M-04B — analytics hardening and mobile performance

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `22ab3957`, which is merged Marketing M-04A (PR #450).
**Scope:** the Telloya marketing application, its tests, and this note. Admin, Customer, Supabase, legal drafts, prices, feature flags, Vercel environment variables, and DNS were not changed.

This note records the analytics fail-closed contract and the homepage LCP investigation. It does not launch the site, create a GA4 property, set a measurement ID, or turn enquiry submission on.

**Public launch is not authorised.**

## 1. Analytics environment matrix

`telloyaAnalyticsCollectionAllowed` returns true only when `VERCEL_ENV` trims to the exact string `production`. The server layout passes `process.env.VERCEL_ENV` into the analytics root and the footer. The client publishes that same string for page-view and `generate_lead` helpers, which do not receive an environment argument of their own. An unset value is no longer treated as eligible.

| `VERCEL_ENV` | Eligible to collect | Consent UI and gtag mount | Page view | `generate_lead` |
| --- | --- | --- | --- | --- |
| `production` | Yes, and only with a valid Telloya GA4 ID and an explicit accept | Yes, when the ID is valid | After accept, path and origin only | After accept, a persisted TY enquiry with `leadConversion`, and a valid ID that has not been disabled |
| ` production ` | Yes, same conditions. Surrounding whitespace is trimmed | Same as `production` | Same as `production` | Same as `production` |
| unset / `undefined` | No | No | No | No |
| empty string | No | No | No | No |
| `preview` | No | No | No | No |
| `development` | No | No | No | No |
| `staging` and any other value, including `Production` | No | No | No | No |

A valid ID matches `^G-[A-Z0-9]+$`. `UA-` IDs, a lowercase `g-` ID, and a missing value stay invalid. No measurement ID is configured in this change, and none was written to Vercel.

What stays in place:

- Consent is explicit. Reject and withdraw set analytics storage to denied, set `ga-disable-<id>`, delete `_ga` cookies, and remove the gtag script.
- Advertising consent stays denied: `ad_storage`, `ad_user_data`, and `ad_personalization`.
- Telloya reads `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` and `telloya:analytics-consent:v1`. It does not read `NEXT_PUBLIC_GA_MEASUREMENT_ID` or `profilerelaunch:analytics-consent:v1`.
- Page views drop the query string and the hash. `generate_lead` carries `lead_type`, an allow-listed `plan_tier`, and `guard_interested`. It does not accept a name, email, phone, TY reference, or submission key.
- The cookie-settings control in the footer is shown only when the deployment is production and a valid Telloya ID is present.
- Demo analytics events were not added.

The production ID must stay off Preview and Development. This client refuses those environments even if the variable is present, and the ID would still be visible in a bundle that was built with it.

## 2. Homepage mobile LCP

The approved files were left byte-for-byte:

- `/brand/telloya-cinematic-console-mobile.webp` — VP8 WebP, 925×604, 52,864 bytes.
- `/brand/telloya-cinematic-console.webp` — 1672×604, 94,570 bytes.

M-04A’s mobile LCP element was that mobile file. The previous homepage markup preloaded the desktop `next/image` srcset with no media query, and the mobile file had no `fetchpriority`. React’s `<source>` type does not include `fetchPriority`, so the priority was applied with `react-dom` `preload` instead of an attribute on `<source>`.

The homepage now preloads the approved mobile file only for `(max-width: 639px)` and the desktop derivative only for `(min-width: 640px)`. Both preloads use `fetchpriority=high`. The `<img>` keeps width 1672, height 604, `loading="eager"`, the same CSS class, and `object-fit: cover`. The artwork, colours, glow, and visible dimensions were not regenerated or recompressed.

### Conditions

Both runs below used Lighthouse 12.8.2, Headless Chrome, Linux, simulated throttling, and a production `next start` on `127.0.0.1:4327` with `TELLOYA_LAUNCHED` unset and `TELLOYA_ENQUIRY_ENABLED=false`. Mobile used `--form-factor=mobile --screenEmulation.mobile=true`. Desktop used `--preset=desktop`. Chrome flags were `--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage`, with `--no-enable-error-reporting`. The before run is the M-04A tree at `22ab3957`. The after run is this branch. No GA script was on the page.

| Run | Fetched (UK) | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT | FCP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` mobile, before | 16:13 | 91 | 100 | 100 | 69 | 3.4 s | 0 | 70 ms | — |
| `/` desktop, before | 16:14 | 100 | 100 | 100 | 69 | 0.8 s | 0 | 10 ms | — |
| `/` mobile, after | 16:17 | 93 | 100 | 100 | 69 | 3.2 s | 0 | 30 ms | 1.1 s |
| `/` desktop, after | 16:17 | 100 | 100 | 100 | 69 | 0.8 s | 0 | 0 ms | 0.3 s |

M-04A, earlier the same day on port 4326, recorded homepage mobile performance 92 and LCP 3.3 s, and desktop performance 100 and LCP 0.7 s. SEO 69 is the intentional `is-crawlable` failure from `noindex`.

### What the after trace shows

On mobile, Lighthouse selected `/brand/telloya-cinematic-console-mobile.webp` (transfer about 54 KiB, priority High, request from about 26 ms to 65 ms in the unthrottled trace). `fetchpriority=high` was applied, the request is in the initial document, and lazy loading was not applied. CLS stayed 0. The element box was about 544×356 CSS pixels, the same slot as the before run.

Simulated mobile timings for that element: time to first byte 462 ms, image load finished at 1.1 s, Largest Contentful Paint at 3.2 s. The remaining time is element render delay under the simulated CPU and the render-blocking Next.js CSS (two chunks, about 8.7 KiB and 6.3 KiB, estimated 310 ms). Unused JavaScript was estimated to save 260 ms of LCP. The image-delivery audit still estimates 34 KiB because the 925×604 file is larger than the 545×356 slot.

That 34 KiB reduction would require a smaller or more heavily compressed file. The image has already finished loading at 1.1 s in the simulation, so cutting those bytes does not close the gap from 3.2 s to 2.5 s. The gap is render delay after the approved file has arrived. Recompressing or resizing the artwork was not done. Inlining or removing the cinematic CSS would change the approved scene for a few tenths of a second and was not done.

**Mobile LCP of 2.5 s was not reached.** The safe change moved this machine’s paired mobile LCP from 3.4 s to 3.2 s and performance from 91 to 93, with desktop staying at 100 and CLS at 0. A further cut needs an owner decision about the approved artwork or the critical CSS, and this change does not make that cut.

## 3. Screenshot comparison

Full-page captures used Headless Chrome against the after server. `documentElement.scrollWidth` matched `clientWidth` at 390, 768, and 1440 on `/`, `/pricing`, `/enquire`, and `/demo` (753 and 1425 once the scrollbar was accounted for). No image was broken. At 390 the homepage requested the approved mobile WebP at its native 925×604. At 768 and 1440 it requested the desktop derivative.

Pixel comparison with the M-04A homepage captures, same content width:

| Width | Result |
| --- | --- |
| 390 | Same 390×9854 frame. Mean channel difference 0. Maximum channel difference 1. |
| 768 | Same 753×7195 frame when the viewport is 768×1024, matching the M-04A capture height. Mean channel difference 0.0003. Maximum 1. |
| 1440 | Same 1425-wide frame at a 900px viewport height. Mean channel difference 0.001. Maximum 2. |

A first 768 capture at a 900px viewport height sat about 11px higher in the hero. That is `padding-top: clamp(112px, 12vh, 136px)` at a shorter viewport, and the rest of that page matched. The matched-height capture is the comparison that counts. The headline “Never Misses a Call”, both primary CTAs, the console artwork, and the logo are unchanged.

## 4. Regression and accessibility

| Check | Result |
| --- | --- |
| 390, 768, and 1440 on home, pricing, enquire, and demo | No horizontal overflow. No broken images. |
| Homepage hero and primary CTAs | Pixel match with M-04A at the same viewport, section 3. |
| Keyboard focus | Existing focus outlines and the programmatic-focus tests still pass. A sighted keyboard walk of every page in Chrome, Safari, and Firefox was not repeated in this pass. |
| Cookie-consent focus restoration | Covered by `apps/telloya/components/analytics-consent.test.tsx`. The banner does not render on this build because there is no measurement ID and the local server is not `VERCEL_ENV=production`. |
| Demo keyboard navigation and summary announcements | Covered by `apps/telloya/app/demo/demo.test.tsx`. |
| Reduced motion | Homepage, demo, enquiry, cookies, and consent CSS still contain a `prefers-reduced-motion: reduce` rule. The demo test still requires that rule. |
| Layout shift | CLS 0 on the before and after homepage audits. The console image still has width and height. |

**Manual screen-reader testing is outstanding.** VoiceOver, NVDA, TalkBack, and Dragon were not run. Live announcements, rotor headings, and the demo live region still need that pass. Text-only zoom at 200% and a physical keyboard on iOS and Android were not run.

## 5. Tests run for this change

`npm run test:telloya` on 7 November 2026 at 16:17 UK: 20 files, 189 tests, passed. `npm run typecheck:telloya` passed.

The new cases cover:

- collection allowed only for `production` and whitespace-trimmed `production`
- collection denied for unset, empty, `preview`, `development`, `staging`, and `Production`
- page view and `generate_lead` denied in those non-production values even after accept, including a path that contains an email query
- production page view still strips that query
- the Google Analytics script stays unmounted for unset, `preview`, `development`, and `staging` after accept
- the analytics root stays empty for unset, empty, `preview`, `development`, `staging`, and `Production`
- the footer cookie-settings button stays hidden for preview, development, and an unset environment
- the homepage source preloads the approved mobile file for the mobile media query and sets `fetchPriority: "high"`

The full GitHub `verify` job is the release check for this branch. Its result belongs in the pull request, not as a substitute for the matrix above.

## 6. Still required before any launch

- DNS and the canonical host were not queried and were not changed. `https://telloya.com` is still the canonical host in code. `www` and preview hosts still need an owner check so they redirect there or stay non-indexable. Search Console was not opened and the sitemap was not submitted.
- A Telloya GA4 property does not exist in this change. `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` is still unset. When an owner creates the property, the ID belongs on Vercel Production only.
- Enquiry end-to-end verification is still required. `TELLOYA_ENQUIRY_ENABLED` stays false. This build shows the pre-launch notice and does not persist a TY enquiry.
- Legal, privacy, and tax approvals are still required. The Telloya terms, privacy supplement, and `productionTaxBehaviour` were not edited and are not approved.
- `TELLOYA_LAUNCHED` stays unset. Robots remain `noindex, nofollow, noarchive`. Opening indexing needs a new production build with `VERCEL_ENV=production` and `TELLOYA_LAUNCHED=true`, after the owner decides to launch.
- The manual assistive-technology pass in section 4 is still outstanding.
- Demo analytics events remain unimplemented.

**Public launch is not authorised by this change.**
