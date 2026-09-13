# ProfileRelaunch launch readiness

This document separates **code that is ready** from **owner / external setup that this repository cannot complete**.

Do not treat unchecked external items as done.

Canonical public site: `https://profilerelaunch.com`

---

## CODE COMPLETE

Verified in this repository:

- Public pages use the ProfileRelaunch trading name.
- Canonical / Open Graph / structured-data / sitemap URLs use `https://profilerelaunch.com`.
- Approved Early Access prices are sourced from `lib/pricing.ts` and match Terms.
- Enquiry API requires `RESEND_API_KEY`, `ENQUIRY_FROM_EMAIL` and `ENQUIRY_TO_EMAIL`. Production does not simulate success when they are missing.
- Customer acknowledgement stays off unless `ENQUIRY_SEND_CUSTOMER_ACK=true`.
- Email **display** brand is ProfileRelaunch (`From` name and subjects). The mailbox **domain** is unchanged until migration is verified.
- Optional GA4 loads only after explicit consent, sends pathname-only page views, and uses host-only cookies (`cookie_domain: "none"`).
- Optional Search Console HTML verification reads `GOOGLE_SITE_VERIFICATION` and emits nothing when unset.
- Preview / non-production remains noindex; production sitemap is emitted only when `VERCEL_ENV=production`.
- Connect Google remains Coming Soon. Tell us what happened is the live route.
- Tests never send live email. No measurement ID or verification token is committed.

### GA cookie decision

The public tracking host is the canonical apex `profilerelaunch.com`. Cross-subdomain analytics identity is not required. The gtag config therefore sets `cookie_domain: "none"` (host-only). Withdrawal still attempts to expire first-party cookies named `_ga` / `_ga_*` with and without a Domain attribute.

### Rate limiting

Enquiry rate limiting is best-effort and process-local. It is not a distributed control. Validation and a honeypot remain in place. Distributed limiting is post-launch hardening, not a launch-critical code change.

---

## Environment variables

Never commit secret values. Placeholders in `.env.example` are not production credentials.

| Variable | Purpose | Required | Production | Preview | Secret | If absent |
| --- | --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Resend API authentication for enquiry email | For live delivery | Required for live mail | Operational choice if Preview should send mail | Yes | Production API fails safely. Local/dev may simulate. Tests never send. |
| `ENQUIRY_FROM_EMAIL` | Verified sending address (From mailbox) | For live delivery | Required | Same if Preview sends | No (address) | Not ready; production fails safely |
| `ENQUIRY_TO_EMAIL` | Internal inbox for notifications | For live delivery | Required | Same if Preview sends | No (address) | Not ready; production fails safely |
| `ENQUIRY_REPLY_TO_EMAIL` | Extra Reply-To besides the customer | Optional | Optional | Optional | No | Customer email remains Reply-To |
| `ENQUIRY_SEND_CUSTOMER_ACK` | Send a customer receipt | Optional; leave unset | Leave unset/false unless explicitly approved | Leave unset | No | Internal delivery only (preferred for launch) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 web stream ID | Optional | Only after the GA4 stream is configured | Usually unset | No, but do not invent an ID | No banner, no script, no analytics cookies |
| `GOOGLE_SITE_VERIFICATION` | Optional HTML-tag Search Console token | Optional | Only if using URL-prefix HTML verification | Usually unset | No | No verification meta tag |

Display name on sent mail is `ProfileRelaunch <ENQUIRY_FROM_EMAIL>`. Changing that name does not change the mailbox domain.

If Preview currently has live Resend variables in Vercel, that is an operational choice. This PR does not silently disable Preview mail.

---

## OWNER / EXTERNAL SETUP REQUIRED

These cannot be marked complete from application source code.

### Domains (Vercel / DNS)

- Attach `profilerelaunch.com` as the primary production domain.
- If `www.profilerelaunch.com`, `profilerelaunch.co.uk` or `www.profilerelaunch.co.uk` are used, they should **301 redirect** to `https://profilerelaunch.com` rather than index as separate sites.
- Confirm HTTPS on the production hostname. Certificate status was not independently inspected from this environment.

### Email / Workspace / Resend

**CONTACT EMAIL MIGRATION PENDING.** `legalIdentity.contactEmail` remains `contact@reputedefend.com` because `contact@profilerelaunch.com` has not been verified here as a working public mailbox.

Until verified, leave actual addresses on the current sending/receiving domain:

- Public contact: `contact@reputedefend.com`
- Intended later From: `enquiries@profilerelaunch.com` (only after Resend verifies `profilerelaunch.com`)
- Intended later To: `cases@profilerelaunch.com` (only after that mailbox exists)

Owner checks before changing addresses:

- Google Workspace mailboxes / aliases exist
- `profilerelaunch.com` can receive mail
- Resend has `profilerelaunch.com` verified for sending
- SPF/DKIM for that sending domain is valid
- The intended case mailbox is monitored

Then set Vercel Production `RESEND_API_KEY`, `ENQUIRY_FROM_EMAIL` and `ENQUIRY_TO_EMAIL`, and run **one real enquiry smoke test**.

Do not enable `ENQUIRY_SEND_CUSTOMER_ACK` merely because launch is approaching.

### Google Analytics 4

Stage 9/10 code is ready. **Do not set `NEXT_PUBLIC_GA_MEASUREMENT_ID` until the web stream is configured.**

Required external GA4 setup for `https://profilerelaunch.com`:

- Create the GA4 property / web stream (not done in this PR)
- **Disable Enhanced Measurement** automatic collection, including scrolls, outbound clicks, site search, video engagement, file downloads, form interactions, `form_start` and `form_submit`
- Disable automatic browser-history page views if they would duplicate the site’s sanitised App Router `page_view`
- Keep Google Signals, advertising personalisation, Google Ads features and unnecessary advertising integrations **off**
- Then add `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Production (and only there, unless a separate non-production property is intentionally used)
- Run one production consent smoke test: no hits before Accept; pathname-only after Accept; Reject/withdraw stops measurement

This PR does **not** claim a GA4 property exists, that Signals are disabled in the account, or that retention/internal-traffic filters are configured.

### Search Console

Preferred: Domain property `profilerelaunch.com` with **DNS** verification.

If using a URL-prefix HTML tag instead, set `GOOGLE_SITE_VERIFICATION` (do not invent a token).

After verification, submit `https://profilerelaunch.com/sitemap.xml`.

This PR does **not** claim Search Console is verified or that the sitemap has been submitted.

---

## POST-LAUNCH / HARDENING

Useful, not required to launch the public brochure + enquiry site:

- Distributed / serverless enquiry rate limiting
- Customer acknowledgement, if product later wants receipts
- Mailbox and Resend migration to `@profilerelaunch.com` once verified
- Safe conversion events (only after a privacy review; Stage 9/10 send page views only)
- Enforcing CSP (currently Report-Only) after a full production pass
- Shared case database, evidence storage, payments, customer portal — out of scope

---

## Production env checklist (no secret values)

| Variable | Expected launch state | Required | Where | External prerequisite |
| --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Set in host, never in git | Yes for live mail | Production | Resend account + verified sending domain |
| `ENQUIRY_FROM_EMAIL` | Verified From address | Yes for live mail | Production | Same verified domain |
| `ENQUIRY_TO_EMAIL` | Monitored internal inbox | Yes for live mail | Production | Working mailbox |
| `ENQUIRY_REPLY_TO_EMAIL` | Unset unless needed | No | Optional | — |
| `ENQUIRY_SEND_CUSTOMER_ACK` | Unset / not `true` | No | Production | Explicit product decision |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Unset until GA4 stream is ready | No | Production after GA setup | GA4 stream + Enhanced Measurement off |
| `GOOGLE_SITE_VERIFICATION` | Unset unless using HTML-tag verification | No | Production if used | Search Console token |

Preview: keep noindex. Do not put a production GA ID on Preview unless using a separate non-production property.
