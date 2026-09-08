# ReputeDefend

A Next.js App Router marketing site for independent reputation support.

## Architecture

- Next.js 16, React 19 and Tailwind CSS v4.
- Public pages are server-rendered with reusable section components.
- `/api/enquiry` validates and normalizes input, applies a honeypot check and delegates delivery to `lib/enquiry.ts`.
- The provider contract is intentionally server-side: replace `deliverEnquiry` with a Resend or CRM adapter later without changing the form UI.

## Local development

```bash
npm install
npm run dev
```

With no provider configured, development returns a clearly labeled simulated success. Production returns a temporary-unavailable response and never claims delivery.

## Environment and deployment

- `ENQUIRY_PROVIDER_URL` is reserved for the future server-side provider adapter and is never exposed to the browser.
- `VERCEL_ENV=production` enables the production sitemap, indexing and canonical behavior.
- Preview and development environments are noindex and excluded from the sitemap.
- Production canonical URLs resolve to `https://reputedefend.com`.

No analytics, tracking, cookies, CAPTCHA, authentication, database, payments or unnecessary SaaS integrations are included in V1.

## Manual V1 operating model

Enquiries are reviewed manually. Before launch, connect and test the chosen email/CRM provider, complete legal pages, verify delivery monitoring, and replace the temporary-unavailable fallback with a provider adapter that only returns success after confirmed delivery.
