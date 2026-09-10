# ReputeDefend

A Next.js App Router marketing site for independent reputation support.

## Architecture

- Next.js 16, React 19 and Tailwind CSS v4.
- Public pages are server-rendered with reusable section components.
- `/api/enquiry` validates and normalizes input, applies a honeypot check, applies a process-local rate-limit boundary, then delegates delivery to `lib/enquiry-delivery.ts`.
- Email sending is confined to a server-side `EnquiryProvider`. The Resend implementation lives in `lib/providers/resend-enquiry-provider.ts` and is never imported by browser components.

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
- `ENQUIRY_FROM_EMAIL` — a verified ReputeDefend sending address, not the customer’s email
- `ENQUIRY_TO_EMAIL` — the internal inbox that should receive enquiries

Optional:

- `ENQUIRY_REPLY_TO_EMAIL` — extra Reply-To in addition to the customer’s validated email
- `ENQUIRY_SEND_CUSTOMER_ACK=true` — send a customer receipt. Leave this off unless you have explicitly chosen to enable it.

Reply-To on the internal notification is the customer’s validated email so you can reply directly. The From address must stay on the verified ReputeDefend domain.

### Resend setup

1. Create a Resend account and an API key. Store the key only in the host environment, never in the repository.
2. Add and verify the sending domain (for example `reputedefend.com`) in Resend.
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
- Production canonical URLs resolve to `https://reputedefend.com`.

No analytics, tracking, cookies, CAPTCHA, authentication, database, payments or CRM integrations are included in V1.

## Manual V1 operating model

Enquiries are reviewed from the internal Resend-delivered email. Before launch, complete domain verification, confirm `ENQUIRY_TO_EMAIL` is monitored, and verify a live test submission.
