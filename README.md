# ProfileRelaunch

A Next.js App Router marketing site for Google Business Profile recovery, review protection and reputation monitoring.

The public trading brand is **ProfileRelaunch**. Legal operator remains Saswati Das, a UK sole trader. Canonical site: `https://profilerelaunch.com`.

Launch status, environment variables and **owner / external setup** are in [`docs/launch-readiness.md`](docs/launch-readiness.md).

## Architecture

- Next.js 16, React 19 and Tailwind CSS v4.
- Public pages are server-rendered with reusable section components.
- `/api/enquiry` validates and normalizes input, applies a honeypot check, applies a process-local rate-limit boundary, then delegates delivery to `lib/enquiry-delivery.ts`.
- Email sending is confined to a server-side `EnquiryProvider`. The Resend implementation lives in `lib/providers/resend-enquiry-provider.ts` and is never imported by browser components.
- Optional consent-gated Google Analytics 4 and Search Console HTML verification are environment-driven. They do nothing unless configured.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

With no Resend configuration, development returns a clearly labelled simulated success. Tests and production never simulate successful delivery.

## Enquiry email (Resend)

Live delivery requires all three of:

- `RESEND_API_KEY`
- `ENQUIRY_FROM_EMAIL` — a verified sending address, not the customer’s email
- `ENQUIRY_TO_EMAIL` — the internal inbox that should receive enquiries

Optional:

- `ENQUIRY_REPLY_TO_EMAIL` — extra Reply-To in addition to the customer’s validated email
- `ENQUIRY_SEND_CUSTOMER_ACK=true` — send a customer receipt. Leave this off unless you have explicitly chosen to enable it.

The From **display name** is ProfileRelaunch. Reply-To on the internal notification is the customer’s validated email so you can reply directly. The From **address** must stay on the currently verified sending domain.

### Pending mailbox / domain migration

Customer-facing pages use the ProfileRelaunch trading name and `https://profilerelaunch.com`. Operational mailboxes have **not** been migrated in code because Workspace/Resend for `profilerelaunch.com` has not been verified here.

Until that migration is confirmed:

- public contact remains `contact@reputedefend.com`
- enquiry From/To addresses stay on the verified `reputedefend.com` domain
- do not invent a `@profilerelaunch.com` mailbox in source
- customer acknowledgement stays disabled

### Resend setup

1. Create a Resend account and an API key. Store the key only in the host environment, never in the repository.
2. Add and verify the sending domain in Resend (currently `reputedefend.com` until migration).
3. Publish the DNS records Resend shows for that domain, typically:
   - domain verification TXT
   - DKIM CNAME records
   - SPF include for Resend
4. Use a From address on that verified domain, such as `enquiries@reputedefend.com`.
5. Set `ENQUIRY_TO_EMAIL` to the inbox that should receive case and contact notifications.
6. Send a test enquiry from a non-production environment with the variables set, and confirm the message arrives before relying on production.

If required configuration is missing, or Resend does not accept the message, the API returns failure and the form keeps the entered values. Production never reports success unless Resend confirms acceptance.

## Environment and deployment

- Resend credentials are server-only and must not be prefixed with `NEXT_PUBLIC_`.
- `VERCEL_ENV=production` enables the production sitemap, indexing and canonical behavior.
- Preview and development environments are noindex and excluded from the sitemap.
- Production canonical URLs resolve to `https://profilerelaunch.com`.
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `GOOGLE_SITE_VERIFICATION` are optional. Do not invent values.

See [`docs/launch-readiness.md`](docs/launch-readiness.md) for the Production vs Preview matrix and external launch blockers.
