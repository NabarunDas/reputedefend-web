# Telloya 05C-01 launch readiness

Checked on 4 November 2026 (UK). The site under test was a local production build of `apps/telloya` (`next build`, then `next start` on `http://127.0.0.1:3014`). `TELLOYA_LAUNCHED`, `TELLOYA_ENQUIRY_ENABLED`, and `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` were unset. Both Telloya feature flags stay disabled.

This note records what was actually checked. It does not include a Lighthouse, CrUX, WebPageTest, or axe score. No performance score was measured, so none is reported.

## Mobile responsiveness and performance

CSS breakpoints in `apps/telloya/app/globals.css` are 1150px, 1060px, 640px, 520px, and 360px. Page styles also reduce motion when `prefers-reduced-motion: reduce` is set.

A narrow browser window, reported at about 390px CSS width, was used on the local production server. The homepage hero, pricing cards, and How It Works step 05 stacked and remained readable. Visible copy matched the corrections in this review:

- Pricing showed Basic £49/month (120 minutes), the GBP settlement note, “Lead summaries, including callback preferences, by the agreed delivery method”, and “Usage visibility in a customer dashboard (planned)”.
- How It Works step 05 said lead summaries are delivered through the method agreed for the service, and that a customer dashboard is planned and is not operational.
- The homepage hero still read “Your AI Receptionist / Never Misses a Call”, with the Connected T logo in the header.

Console on those pages: 0 errors. The console did show resource preload timing warnings.

Performance limitation: no lab or field performance score was collected. Asset sizes below are file sizes and pixel dimensions only. They are not a speed score.

| Asset | File size | Pixels |
| --- | ---: | --- |
| `telloya-connected-t-lockup.webp` | 262,688 bytes | 1416×695 |
| `telloya-connected-t-lockup-dark.webp` | 262,654 bytes | 1416×695 |
| `telloya-social-share.webp` | 42,164 bytes | 1200×675 |
| `telloya-cinematic-console.webp` | 94,570 bytes | 1672×604 |
| `telloya-cinematic-console-mobile.webp` | 52,864 bytes | 925×604 |
| `telloya-icon-512.png` | 163,524 bytes | 512×512 |

## Layout shifts and image loading

The Connected T lockup files match the `next/image` width and height of 1416×695. The social share file matches the metadata size of 1200×675. The desktop cinematic file matches the declared 1672×604.

The mobile cinematic source is 925×604. That is a different aspect ratio from the desktop image reserved by the `Image` width and height. No layout-shift score was measured, so this is an observation, not a CLS number. The approved immersive hero, typography, and Connected T logo were left unchanged.

The rendered header logo uses `next/image` with explicit dimensions and a `sizes` hint. This check did not measure image decode time or cumulative layout shift.

## Accessibility, focus and keyboard navigation

Present in the source and styles:

- A skip link in the root layout points at `#main-content` and is positioned off-screen until it receives focus.
- `:focus-visible` draws a 3px outline. Homepage, pricing, features, industries, How It Works, enquire, cookies, and the consent controls add their own visible focus styles.
- The header logo link has an accessible name. Main navigation uses `aria-current="page"` on the active item.
- The narrow-viewport menu button sets `aria-expanded`, `aria-controls="mobile-menu"`, and `aria-label`. The menu panel sets `aria-modal="true"` and the close control has an accessible name.
- Consent banner and cookie-settings behaviour, including keyboard operation, is covered by the existing Telloya analytics tests. Those tests were not re-walked by hand in this audit.

Limitations: this audit did not run axe or another automated accessibility scanner, did not measure colour contrast, and did not complete a keyboard-only pass through every control, including the open mobile menu. A visible focus style in CSS is not a completed keyboard test.

## Internal links and broken-link checks

Local production responses on 4 November 2026, with flags unset:

| Path | Result |
| --- | --- |
| `/` | 200, `X-Robots-Tag: noindex, nofollow, noarchive` |
| `/how-it-works` | 200, same robots tag |
| `/features` | 200, same robots tag |
| `/industries` | 200, same robots tag |
| `/pricing` | 200, same robots tag |
| `/enquire` and `/enquire?plan=growth` | 200, same robots tag |
| `/cookies` | 200, same robots tag |
| `/demo` | 307 Temporary Redirect to `/enquire` |
| `/robots.txt` | 200, body `User-Agent: *` / `Disallow: /` |
| `/sitemap.xml` | 200, empty urlset |
| `/missing-page` | 404 |

Rendered internal links on the public pages were `#main-content`, `/`, `/how-it-works`, `/features`, `/industries`, `/pricing`, `/enquire`, `/enquire?plan=basic`, `/enquire?plan=growth`, `/enquire?plan=pro`, `/enquire?plan=custom`, `/cookies`, and `mailto:contact@profilerelaunch.com`. Each in-app path above returned 200, except that this crawl did not submit the enquiry form.

External HTTP checks the same day:

| URL | Result |
| --- | --- |
| `https://profilerelaunch.com/` | 200 |
| `https://profilerelaunch.com/privacy` | 200 |
| `https://profilerelaunch.com/terms` | 200 |
| `https://profilerelaunch.com/relaunch-guard` | 200 |
| `https://customer.profilerelaunch.com/portal` | 303 to `/`, then 200 on the customer host root |

The customer portal link is not a 404. It currently redirects away from `/portal`. Telloya customer and admin behaviour was not changed to address that.

## SEO metadata, sitemap, robots and indexing

Indexing stays closed unless `VERCEL_ENV=production` and `TELLOYA_LAUNCHED=true`. On this server, and in any preview or unset-flag build, pages send `noindex, nofollow, noarchive`, `robots.txt` disallows `/`, and `sitemap.xml` is an empty urlset. The launched sitemap and robots responses are covered by tests and were not enabled here.

`/demo` uses Next.js `redirect("/enquire")`. The live response is **307 Temporary Redirect**. A permanent redirect was not added. The sitemap lists `/enquire` and does not list `/demo`.

Sitemap entries no longer set `lastModified`. The previous `new Date()` value changed on every generation and did not represent a real content modification time.

Page titles use an absolute title so the root `%s | Telloya` template does not produce a doubled suffix. Pages that set their own social title and description also repeat the 1200×675 Connected T share image and `summary_large_image`. The not-found page stays `noindex`.

## Capability and commercial wording checked in this review

Usage visibility and the customer dashboard are described as planned, not operational, on the pricing cards, the comparison table, the features note, and How It Works. Lead summaries are described as delivered through the agreed method. Customer and Admin product behaviour was not changed.

Published prices remain Basic £49, Growth £79, Pro £120, Custom by quotation, Relaunch Guard £9.99 per location, and opt-in overage £0.25 per minute. The pricing page states that prices are published in GBP and that settlement currency and other payment terms are confirmed before proceeding. It no longer offers local-currency checkout or conversion, and it no longer states an unused-minute rollover policy.

## Owner review: homepage headline

The visible homepage headline remains the approved absolute claim **“Never Misses a Call”**. The supporting line still says Telloya can help when the owner cannot answer. This audit records that claim for owner review. The immersive hero, typography, and Connected T logo were not redesigned.

## Outstanding launch blockers

- The homepage absolute claim above still needs an owner decision. It was not rewritten in this change.
- There is no customer dashboard and no usage visibility in production. Both are labelled planned. Lead delivery depends on the method agreed for the service.
- There is no Telloya checkout. Stripe, billing, emails, and customer or admin workflows were not changed. Enquiry submission stays off while `TELLOYA_ENQUIRY_ENABLED` is unset.
- Voice, call recording, and retention legal review remains a later phase. This change does not add that review.
- Call forwarding, telephone numbers, and supported languages still depend on provider configuration. There is no live demo. `/demo` only redirects to `/enquire`.
- Analytics stays off. No GA4 measurement ID is set, and advertising consent is not granted by this site.
- The site must stay `noindex` until a deliberate production launch sets `TELLOYA_LAUNCHED=true`. Product structured data was not added while the service is not purchasable.
- The customer-host `/portal` link redirects to the customer site root. That host was not modified.
- No performance score and no contrast score exist for this build. Those checks are still open if a launch gate requires them.

## Testing limitations

- Browser checks used a local production server in a narrow desktop window. They were not a physical device lab and not a full set of viewport widths.
- No Lighthouse, CrUX, WebPageTest, or other performance score was run.
- No cumulative layout shift number was captured.
- No axe scan, contrast measurement, or complete keyboard traversal was run.
- External link checks are point-in-time HTTP responses on 4 November 2026. They are not a monitored uptime check.
- The launched indexing mode was exercised in unit tests by setting environment variables inside the test process. It was not enabled on the server used for the browser check, and the flags were not changed in Vercel.
