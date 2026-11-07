# Telloya M-05A — release and rollback

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `fe2e946317d680ad3659f15eb2cb082c798ec5fa`.

This sequence is the safe order for a later marketing launch. It is not an instruction to run the steps now. Public launch is not authorised. ChatGPT runs hosted steps only after the owner approves that step.

Three releases stay separate:

1. **Marketing enquiry launch.** The public site can accept a TY enquiry. It still takes no payment and starts no call.
2. **Paid-subscription activation.** A customer accepts an offer and a subscription can be created. That needs the tax decision, the agreement, and Stripe. It is not part of enquiry launch.
3. **Live AI call routing.** A receptionist number answers a forwarded call. That needs provider confirmation, the emergency script, and Retell routing. It is not part of enquiry launch or of this package. The C-06B workstream is separate and was not edited here.

## 1. Preconditions before enabling enquiry

All of these are required before `TELLOYA_ENQUIRY_ENABLED=true` on hosted DEV:

- The owner names the DEV project and the test recipient.
- `TELLOYA_LAUNCHED` stays unset on that test. Indexing is not part of the enquiry test.
- No Stripe key, Retell route, or forwarding change is included.
- The database target is hosted DEV, not Production.
- The usage-ledger migration `20261107110000` stays unapplied.
- A rollback owner is named who can set `TELLOYA_ENQUIRY_ENABLED` back to false.

**Gate now: BLOCKED.** None of those approvals was given in this phase.

## 2. DEV end-to-end verification

ChatGPT, after approval:

1. Confirm the flag is on for the DEV Telloya deployment only, then rebuild if the server reads it at build time. The submit control reads `TELLOYA_ENQUIRY_ENABLED` on the server.
2. Walk Homepage → Demo → Pricing → Enquire in a browser. Confirm the demo places no call and pricing preselects Basic, Growth, Pro, and Custom.
3. Submit one enquiry with Guard interest, voice preferences, and privacy accepted. Record the TY reference from the page.
4. Submit the same browser session again only if the first request is finished. A retry of the same submission key must reuse the reference.
5. Open that reference in Admin on DEV. Confirm plan, Guard, custom fields if used, and that the row is an enquiry rather than a subscription.
6. Confirm the internal notification and the customer acknowledgement, including a forced failure if the mail provider can be pointed at a sink. Do not use a real customer inbox.
7. Set the flag false again at the end of the test and confirm the pre-launch notice returned.

**Gate now: NOT TESTED.**

## 3. Production domain verification

Do this before any indexing build. Do not do it as part of the enquiry DEV test.

1. Confirm the registrar account owns the apex that will be canonical.
2. Read DNS for the apex and `www`.
3. Attach the domain to project `prj_T3KKfna1SSwbtRI59KwLVVtkpOY8` (`telloya-marketing`, team `clientcove`).
4. Wait for the certificate.
5. Request `https://telloya.com` and `https://www.telloya.com`. One redirects to the other. Preview URLs stay on their preview host.
6. Confirm the HTML canonical is `https://telloya.com`.

The supplied finding is that `telloya.com` is not attached today. **Gate: FAIL** until that attachment is verified. This document does not perform it.

## 4. Environment configuration review

Read, do not change, until the owner accepts a value:

| Variable | Required state before enquiry launch | Required state before indexing |
| --- | --- | --- |
| `TELLOYA_ENQUIRY_ENABLED` | `true` only on the environment under test, and only for the approved window | Independent. Indexing does not require it |
| `TELLOYA_LAUNCHED` | Unset or not `true` during the enquiry-only test | `true` only on Vercel Production, then a new build |
| `VERCEL_ENV` | `preview` or `production` as selected. Preview never becomes indexable | `production` for the indexable build |
| `NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID` | Unset until the GA4 property exists. Production only | Same. Never on Preview |
| Stripe, Retell, forwarding | Off for both marketing releases | Off |

Near-miss values (`TRUE`, `1`, `yes`, `on`) do not enable the code gates. The live value must be the exact lowercase `true`.

**Gate now: NOT TESTED** against the hosted variable list.

## 5. Legal and commercial sign-off

Before a customer can be told that terms apply:

- Accountant confirms VAT registration. `productionTaxBehaviour` stays null until a later, separate decision.
- Counsel approves one agreement text. The published page must repeat the one-location and one-number limit.
- Counsel and the provider confirm recording, retention, and the emergency script.
- The owner decides whether “Never Misses a Call” remains, with the limitation visible.

Enquiry launch can be discussed before that sign-off only if the page still says Telloya terms are not approved and the form takes no payment. That is the current copy. It is not permission to turn the flag on.

**Gate now: BLOCKED.**

## 6. Production deployment verification

After the owner approves a production marketing deploy, and before indexing:

1. Deploy the reviewed commit.
2. Read the deployment URL and the canonical host if it is attached.
3. Confirm `X-Robots-Tag` still contains `noindex` while `TELLOYA_LAUNCHED` is unset.
4. Confirm `/` , `/demo`, `/pricing`, `/enquire`, and `/cookies` return 200.
5. Confirm the enquire page shows the pre-launch notice when the enquiry flag is off.
6. Confirm the page source has no `googletagmanager` request while the measurement ID is unset.
7. Confirm the homepage hero is still “Never Misses a Call” with the two existing primary CTAs.

**Gate now: NOT TESTED.** M-04B measured a local production build and a login-protected Vercel preview. That is not this check.

## 7. Monitoring and customer contact

Before the enquiry flag stays on:

- Name the inbox that receives the internal Telloya notification.
- Name who watches Admin for an unassigned Telloya row.
- Confirm `contact@profilerelaunch.com` still appears on the pre-launch notice and the footer.
- Agree the time box. If the inbox or Admin is not being watched, set the flag false.

**Gate now: NOT TESTED.**

## 8. Controlled indexing

Only after domain verification, the production deploy check, and the owner’s indexing decision:

1. Set `TELLOYA_LAUNCHED=true` on Vercel Production only.
2. Rebuild. An old build keeps the previous robots tag.
3. Read `/robots.txt` and `/sitemap.xml` on `https://telloya.com`.
4. The sitemap may list `/`, `/how-it-works`, `/demo`, `/features`, `/industries`, `/pricing`, `/enquire`, and `/cookies`.
5. Submit the sitemap in Search Console after that read.
6. Leave Preview deployments on `Disallow: /`.

**Gate now: BLOCKED.**

## 9. Rollback

Rollback of a marketing deploy:

1. Promote the previous verified Vercel deployment of `telloya-marketing`. Do not rebuild an unknown commit to “undo” a bad one.
2. Record the deployment ID that was restored and the commit SHA it serves.
3. Read `/` and `/enquire` on that deployment. Confirm the hero and the pre-launch notice, or the enquiry form if that deployment had the flag on.
4. If the bad deploy changed environment variables, restore the previous values in the same step. A deployment rollback does not always restore variables.

Rollback of indexing:

1. Remove `TELLOYA_LAUNCHED` or set it to a value other than `true` on Production.
2. Rebuild so robots and the sitemap close. The previous HTML will stay indexable until that rebuild and until search engines recrawl.
3. Do not submit a new sitemap.

Rollback of enquiries:

1. Set `TELLOYA_ENQUIRY_ENABLED` to false on the environment that was opened.
2. Confirm a POST to `/api/telloya/enquiry` returns 503 and the page shows the pre-launch notice.
3. Leave any DEV rows in place for the owner to delete. This package does not delete hosted data.

Rollback of a paid subscription or a live call is not this procedure. Those controls belong to their own release, and this package does not switch them on.

## 10. Stop line

Do not merge this documentation as if it were launch approval. Do not enable a flag, attach a domain, or send an enquiry from this change.
