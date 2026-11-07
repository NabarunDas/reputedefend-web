# Telloya M-02A — publication and acceptance mapping

**NOT APPROVED. NOT PUBLISHED. NOT LEGAL ADVICE.**

This map says where an approved document would later appear. It does not create those URLs, add those links, or change the pages that exist. The ProfileRelaunch company links stay as they are.

**Date:** 7 November 2026 (UK).

## Current links that must keep working

| Place | Current target | Stays |
| --- | --- | --- |
| Telloya footer Privacy | `https://profilerelaunch.com/privacy` | Yes. Company privacy notice |
| Telloya footer Terms | `https://profilerelaunch.com/terms` | Yes. Company website terms |
| Telloya footer Cookies | `/cookies` on the Telloya site | Yes. Cookie and analytics notice only |
| Enquire privacy acknowledgement | `https://profilerelaunch.com/privacy` | Yes, until a Telloya supplement is approved |
| Cookie banner privacy link | `https://profilerelaunch.com/privacy` | Yes |
| Company site `/privacy`, `/terms`, `/cookies` | ProfileRelaunch website notices | Yes. This phase does not edit them |

The footer and the Cookies page already say the company notices are not Telloya service terms, and that voice, recording, retention, VAT, cancellation, and refund terms await approval. That sentence stays until the owner and counsel approve a replacement.

## Proposed later placement

None of these paths is implemented. A link to one of them would imply approval. Do not add it in this phase.

| Approved document, once it exists | Proposed public place | Proposed URL | What must be true first |
| --- | --- | --- | --- |
| Telloya service agreement | Marketing footer, as its own link beside the company Terms link. The company Terms link remains | `https://telloya.com/legal/service-agreement` | One reconciled text is approved. Prices, the one-location rule, and the open commercial decisions in the register are settled or expressly left out. The page does not contain draft markers |
| Telloya privacy supplement | A Telloya privacy page. The company privacy notice remains linked for the website | `https://telloya.com/legal/privacy` | Controller roles, a recording mode, retention, subprocessors, and a transfer tool are decided. The page does not claim deletion that the provider has not confirmed |
| Pricing disclaimers | Existing Pricing page sections for currency, minutes, Guard, overage, setup, and cancellation | No new URL. Keep `/pricing` | Disclaimer text matches the approved agreement. Until then, Pricing continues to say cancellation and measurement are confirmed at acceptance, and that the dashboard is planned |
| Enquiry privacy acknowledgement | The checkbox on `/enquire` | No new URL until the supplement exists. Until then the checkbox keeps `https://profilerelaunch.com/privacy` | The acknowledgement names the Telloya supplement only after that page is published. It must still say the enquiry does not take payment |
| Customer offer acceptance | Customer portal offer at `/portal/onboarding/offer/[selector]` | No marketing URL. The portal shows an `APPROVED` agreement body, cancellation text, and the three confirmations | Read and accept flags stay off until an approved agreement and approved plan exist. The portal must not be given `TELLOYA-DRAFT-2026-11-1` or this review draft as if it were approved. Tax is shown as the stored behaviour and is not relabelled VAT |
| AI caller disclosure | Spoken at the start of a forwarded call. Not a web page | No URL. The script lives in the provider configuration after approval | The script matches the verified recording mode. It identifies an AI voice. It does not claim emergency dispatch. It is not loaded by this phase |
| Cookies | Existing `/cookies` | Unchanged | Remains the marketing-site storage notice. It does not become the voice privacy notice |

## Acceptance path, unchanged

An offer can be accepted only when an `APPROVED` agreement matches the plan’s `terms_ref` and an `APPROVED` conditions row exists. A missing agreement is `terms_pending`. Acceptance stores the agreement hash and the required confirmations. It does not take payment.

`CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED` and `CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED` are not enabled by this phase. No Telloya agreement row is inserted or approved.

## Explicit non-publication

This phase does not add:

- a Telloya `/legal/*` route
- a footer link whose label says the service agreement or the privacy supplement is available
- a change to the enquire privacy href
- a change to company `/privacy` or `/terms`
- a provider script
- a hosted agreement, plan, or tax behaviour
