# ProfileRelaunch launch readiness

This document separates **code that is ready** from **owner / external setup that this repository cannot complete**.

Do not treat unchecked external items as done. Do not treat optional analytics or Search Console as launch blockers.

Canonical public site: `https://profilerelaunch.com`

---

## CODE COMPLETE

Verified in this repository:

- Public pages use the ProfileRelaunch trading name.
- Canonical / Open Graph / structured-data / sitemap URLs use `https://profilerelaunch.com`.
- Approved published prices are sourced from `lib/pricing.ts` and match Terms: Guided Relaunch £99, Managed Relaunch £299, Guided Review £59, Managed Review £149, and Relaunch Guard £9.99 per month, per location.
- Enquiry API requires `RESEND_API_KEY`, `ENQUIRY_FROM_EMAIL` and `ENQUIRY_TO_EMAIL`. Production does not simulate success when they are missing.
- Ordinary enquiry customer acknowledgements stay off unless `ENQUIRY_SEND_CUSTOMER_ACK=true`. Monitoring setup receipts are a separate path and are **not** controlled by that flag.
- When monitoring intake runs, the request is persisted before email delivery is attempted. A failed email does not mean the saved request was lost.
- Email **display** brand is ProfileRelaunch (`From` name and subjects). Public contact is `contact@profilerelaunch.com`. Enquiry From/To mailboxes stay on the currently verified sending domain until that migration is confirmed.
- `MONITORING_PERSISTENCE_ENABLED` is server-only. Only the exact value `true` enables monitoring intake. False or unset keeps setup unavailable and Guard actions pointing to Contact. This document does not change the deployed value.
- Case and monitoring database code exists in this repository. Whether those paths are enabled in Production or Preview is deployed configuration, not a fact inferred from source.
- Optional GA4 loads only after explicit consent, sends pathname-only page views, and uses host-only cookies (`cookie_domain: "none"`).
- Optional Search Console HTML verification reads `GOOGLE_SITE_VERIFICATION` and emits nothing when unset.
- The site works with `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `GOOGLE_SITE_VERIFICATION` unset: no analytics banner, no GA script, no analytics cookies, no fake verification token.
- Preview / non-production remains noindex; production sitemap is emitted only when `VERCEL_ENV=production`.
- Connect Google is not available. How It Works shows a native disabled Connect Google control. The working manual enquiry route is Tell us what happened / Get Help.
- A controlled Preview test of monitoring intake was previously reported successful. This documentation update does not repeat that test.
- Tests never send live email. No measurement ID or verification token is committed.

### GA cookie decision

The public tracking host is the canonical apex `profilerelaunch.com`. Cross-subdomain analytics identity is not required. The gtag config therefore sets `cookie_domain: "none"` (host-only). Withdrawal still attempts to expire first-party cookies named `_ga` / `_ga_*` with and without a Domain attribute.

### Rate limiting

Enquiry rate limiting is best-effort and process-local. It is not a distributed control. Validation and a honeypot remain in place. Distributed limiting is post-launch hardening, not a launch-critical code change.

---

## TRUE LAUNCH BLOCKERS

These are the only items that actually block public production launch. Without them the public site either does not exist at its canonical domain or cannot reliably receive customer enquiries.

### 1. Production domain

Confirm externally that `https://profilerelaunch.com` is attached to the correct Vercel Production project and serves over HTTPS.

If `www.profilerelaunch.com`, `profilerelaunch.co.uk` or `www.profilerelaunch.co.uk` are used, they should **301 redirect** to `https://profilerelaunch.com` rather than operate as separate indexable sites.

Certificate / DNS / Vercel domain attachment cannot be marked complete from application source code.

### 2. Live enquiry delivery

Production must have valid:

- `RESEND_API_KEY`
- `ENQUIRY_FROM_EMAIL`
- `ENQUIRY_TO_EMAIL`

Then perform **one** real controlled enquiry smoke test and confirm the internal message arrives.

Production must continue to fail safely rather than simulate success if mail configuration is missing.

The currently verified `reputedefend.com` sending/receiving addresses may be used for this smoke test. Changing them to `@profilerelaunch.com` is **not** a true launch blocker (see below).

Do not enable `ENQUIRY_SEND_CUSTOMER_ACK` merely because launch is approaching. That flag does not control Relaunch Guard monitoring receipts.

---

## STRONGLY RECOMMENDED BEFORE PUBLIC MARKETING

### ProfileRelaunch email-domain migration

Current public contact is `contact@profilerelaunch.com`. Enquiry From/To addresses may remain on `reputedefend.com` while they are the verified working sending/receiving addresses.

This is **not** technically mandatory for launch if those verified addresses are working.

However, before **broad public marketing** it is strongly recommended to migrate to:

- `contact@profilerelaunch.com`
- `enquiries@profilerelaunch.com`
- `cases@profilerelaunch.com`

**ONLY after:**

- Google Workspace mailboxes / aliases exist
- `profilerelaunch.com` can receive mail
- Resend has `profilerelaunch.com` verified for sending
- SPF/DKIM for that sending domain is valid
- the cases mailbox is monitored

Until then:

- public contact is `contact@profilerelaunch.com`
- enquiry From/To stay on the verified `reputedefend.com` domain

`legalIdentity.contactEmail` is `contact@profilerelaunch.com`.

---

## OPTIONAL / NON-BLOCKING EXTERNAL SETUP

These are useful. They are **not** launch blockers. The website can launch with both environment variables unset.

### Google Analytics 4

The website can launch with `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset.

In that state:

- no analytics banner
- no GA script
- no analytics cookies
- no GA measurement

GA is useful for public-site usage analysis. It is **not** required for launch.

When GA is later enabled:

- configure the GA4 web stream for `https://profilerelaunch.com`
- **disable Enhanced Measurement** automatic collection, including scrolls, outbound clicks, site search, video engagement, file downloads, form interactions, `form_start` and `form_submit`
- disable automatic browser-history page views if they would duplicate the site’s sanitised App Router `page_view`
- keep Google Signals, advertising personalisation, Google Ads features and unnecessary advertising integrations **off**
- then add `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Production (and only there, unless a separate non-production property is intentionally used)
- run one consent smoke test: no hits before Accept; pathname-only after Accept; Reject/withdraw stops measurement

Do not invent a measurement ID. This repository does **not** claim a GA4 property exists, that Signals are disabled in the account, or that retention/internal-traffic filters are configured.

### Google Search Console

Search Console is strongly useful for SEO and indexing visibility. It is **not** required for the website to function or launch.

It may be configured immediately after production domain verification.

Preferred: Domain property `profilerelaunch.com` with **DNS** verification.

Then submit `https://profilerelaunch.com/sitemap.xml`.

`GOOGLE_SITE_VERIFICATION` remains an optional HTML-tag fallback for a URL-prefix property. Do not invent a token. This repository does **not** claim Search Console is verified or that the sitemap has been submitted.

---

## POST-LAUNCH / HARDENING

Useful after public launch; not required to go live:

- Distributed / serverless enquiry rate limiting
- Ordinary enquiry customer acknowledgement, if product later wants those receipts (`ENQUIRY_SEND_CUSTOMER_ACK`; not the monitoring receipt path)
- Safe conversion events (only after a privacy review; Stage 9/10 send page views only)
- Enforcing CSP (currently Report-Only) after a full production pass
- Evidence storage, payments and a customer portal remain later work
- Case and monitoring persistence exist as implemented code paths; enabling them in an environment is configuration, not “entirely out of scope”

---

## Before activating paid Guard monitoring

These are **operational prerequisites for service activation**, not evidence of implemented automation. Do not mark them complete from database tables or passing unit tests alone. A controlled Preview test of monitoring intake was previously reported successful; that test is not repeated here.

- [ ] A responsible operator and backup cover morning/evening checks, including weekends and bank holidays.
- [ ] Manager permission, verified access and the initial profile check are recorded before payment.
- [ ] Payment arrangements and activation confirmation are ready.
- [ ] Check results, failures, retries and customer alerts can be recorded and followed up.
- [ ] Lost access and an unusable alert channel have a defined service/billing pause procedure.
- [ ] Cancellation, unused-period refunds and price-change acceptance can be handled.
- [ ] The optional 30-day period and eligible Managed-service discount can be administered as advertised.
- [ ] Replies to monitoring receipt emails reach a monitored mailbox.
- [ ] Monitoring requests can be found even when an internal notification email fails.

---

## Environment variables

Never commit secret values. Placeholders in `.env.example` are not production credentials.

| Variable | Purpose | Required | Production | Preview | Secret | If absent |
| --- | --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Resend API authentication for enquiry email | For live delivery | **True launch blocker** if Production should receive enquiries | Operational choice if Preview should send mail | Yes | Production API fails safely. Local/dev may simulate. Tests never send. |
| `ENQUIRY_FROM_EMAIL` | Verified sending address (From mailbox) | For live delivery | **True launch blocker** for live mail | Same if Preview sends | No (address) | Not ready; production fails safely |
| `ENQUIRY_TO_EMAIL` | Internal inbox for notifications | For live delivery | **True launch blocker** for live mail | Same if Preview sends | No (address) | Not ready; production fails safely |
| `ENQUIRY_REPLY_TO_EMAIL` | Extra Reply-To besides the customer | Optional | Optional | Optional | No | Customer email remains Reply-To |
| `ENQUIRY_SEND_CUSTOMER_ACK` | Send an ordinary enquiry customer acknowledgement | Optional; leave unset | Leave unset/false unless explicitly approved | Leave unset | No | Internal enquiry delivery only (preferred for launch). Does **not** control monitoring receipts |
| `CASE_PERSISTENCE_ENABLED` | DB-backed Get Help case intake | Optional; exact `true` only | Exact `true` enables persistent case intake. Deployed value is an operational choice; this document does not change it | May be `true` in Preview after the relevant migration is applied | No | Get Help stays on the email-only path |
| `MONITORING_PERSISTENCE_ENABLED` | Enables `/start-monitoring` and `/api/monitoring` intake | Optional; exact `true` only | Exact `true` enables monitoring intake. False/unset keeps setup unavailable and Guard actions pointing to Contact. Do not change the deployed value from this task | Same rule; Preview may already have been used for a controlled test | No | Guard sales page remains public; setup CTAs go to Contact |
| `SUPABASE_URL` | Server Supabase project URL | Only when a persistence path runs | Required when the corresponding persistence path is enabled | Required where Preview persistence is enabled | No | If that flag is enabled without this, intake cannot persist and must fail rather than succeed |
| `SUPABASE_SECRET_KEY` | Server Supabase privileged key | Only when a persistence path runs | Required when the corresponding persistence path is enabled | Required where Preview persistence is enabled | Yes | If that flag is enabled without this, intake cannot persist and must fail rather than succeed. Never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 web stream ID | **Optional / non-blocking** | Only after the GA4 stream is configured | Usually unset | No, but do not invent an ID | No banner, no script, no analytics cookies. Site launches normally. |
| `GOOGLE_SITE_VERIFICATION` | Optional HTML-tag Search Console token | **Optional / non-blocking** | Only if using URL-prefix HTML verification | Usually unset | No | No verification meta tag. Site launches normally. |

Display name on sent mail is `ProfileRelaunch <ENQUIRY_FROM_EMAIL>`. Changing that name does not change the mailbox domain.

When a persistence flag is enabled but required Supabase configuration is missing, that intake cannot persist and must report failure rather than success. With case persistence disabled, Get Help uses its existing email-only route. With monitoring persistence disabled, monitoring setup is unavailable and Guard actions lead to Contact.

If Preview currently has live Resend variables in Vercel, that is an operational choice. This PR does not silently disable Preview mail.

---

## Production env checklist (no secret values)

| Variable | Expected launch state | Blocks launch? | Where | External prerequisite |
| --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Set in host, never in git | **Yes** for live enquiry delivery | Production | Resend account + currently verified sending domain |
| `ENQUIRY_FROM_EMAIL` | Verified From address | **Yes** for live enquiry delivery | Production | Same verified domain (may still be `reputedefend.com`) |
| `ENQUIRY_TO_EMAIL` | Monitored internal inbox | **Yes** for live enquiry delivery | Production | Working mailbox |
| `ENQUIRY_REPLY_TO_EMAIL` | Unset unless needed | No | Optional | — |
| `ENQUIRY_SEND_CUSTOMER_ACK` | Unset / not `true` | No | Production | Explicit product decision for ordinary enquiry acknowledgements only. Does not control monitoring receipts |
| `CASE_PERSISTENCE_ENABLED` | Exact `true` only if persistent case intake should run | No | Production | Deployed value is an operational choice; this document does not change it |
| `MONITORING_PERSISTENCE_ENABLED` | Exact `true` only if monitoring intake should run; otherwise unset/false | No | Production | Server-only. Do not change the deployed value from this task. Paid Guard activation still needs the operational checklist in “Before activating paid Guard monitoring” |
| `SUPABASE_URL` | Set when the corresponding persistence path is enabled | **Yes, when that persistence path is enabled** | Production / Preview as configured | Required for the enabled path; not a launch blocker when the matching flag is unset |
| `SUPABASE_SECRET_KEY` | Set when the corresponding persistence path is enabled | **Yes, when that persistence path is enabled** | Production / Preview as configured | Required for the enabled path; never in git |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Unset is a valid launch state | **No** | Production after optional GA setup | GA4 stream + Enhanced Measurement off |
| `GOOGLE_SITE_VERIFICATION` | Unset is a valid launch state | **No** | Production if using HTML-tag verification | Search Console token |

Preview: keep noindex. Do not put a production GA ID on Preview unless using a separate non-production property.
