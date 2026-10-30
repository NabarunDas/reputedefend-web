# Customer experience final audit

PR D review of the ProfileRelaunch Marketing site and Customer Portal. This is a presentation audit. It is not authenticated end-to-end proof, and it is not launch approval.

Head under review started at `19c738307e292f118bd64044649d833b7c8a7766` on `develop` `857c7e35ab9c30840007a2b13fa3e9be0d95759d`.

## How each surface was checked

| Method | What it means |
| --- | --- |
| Running public site | Local Marketing app or a public Customer route, with no portal session |
| Synthetic fixture | Real Customer components rendered with invented data. The capture page was not committed. Every fixture screenshot says it is not a live session |
| Source only | Read in the repository. Not photographed in this pass |
| Not tested live | No authenticated DEV browser session was available. No payment, email, subscription, case closure, or migration was run |

There was no authenticated DEV session. Do not read a fixture as a customer record.

## Paused invoice

`customer_portal_invoice_target_v1` and `customer_portal_invoice_document_v1` return `{ status: "collection_paused" }` when an OPEN or UPHELD row exists in `success_fee_collection_pauses` for the success-fee obligation. Both functions return that object before they read `payment_invoices`. The payload has no Stripe invoice status.

That result proves collection is withheld. It does not prove the provider invoice is open, void, or cancelled. The portal, the invoice PDF response, and the hosted-invoice response now share one sentence and still return 409. They do not say the invoice has not been cancelled. Checkout, invoice authorisation, and the pause check are unchanged.

## Logo

Portal CSS is `width: clamp(136px, 36vw, 208px)`, the same clamp as the Marketing header logo. The Next.js `sizes` value is `(max-width: 377px) 136px, (max-width: 577px) 36vw, 208px`, which is where that clamp changes.

Measured on the rendered header:

| Viewport | Rendered width | Header overflow | Logo overlapping the return link |
| --- | --- | --- | --- |
| 320 | 136px | 0 | No |
| 390 | 140.4px | 0 | No |
| 600 | 208px | 0 | No |
| 768 | 208px | 0 | No |
| 1024 | 208px | 0 | No |
| 1440 | 208px | 0 | No |

At a device pixel ratio of 1 the optimizer requested a 256px source. At a device pixel ratio of 2 the same 208px slot requested a 640px source. The logo link focus outline measured 3px. Account names on a real portal path use the existing ellipsis. The fixture route is not a portal path, so the header showed “Back to ProfileRelaunch” instead of an account name.

## Interaction and accessibility

Checked in Chrome on the synthetic fixture, not only by reading source.

| Check | Result |
| --- | --- |
| Login keyboard order | Pass. Tab moved through Skip to content, the logo, Back to ProfileRelaunch, the email field, Send code, then the footer logo. Each showed a green outline |
| Header focus thickness | Fixed. Header links had a 2px outline while other controls used 3px. They now use 3px |
| More menu at 390px | Pass. Open moved focus to Messages. Escape closed the menu and returned focus to More. The menu stayed inside the viewport. Overflow was 0 |
| Evidence, no file | Pass. The labelled file input reported the browser message “Please select a file.” |
| Evidence, wrong type | Pass. `notes.txt` produced the alert “Check the file type and size…” |
| Message expand | Pass. A long message started collapsed, the button became “Collapse message”, and the expanded text included the Guided submission instruction |
| Reduced motion | Pass. With `prefers-reduced-motion: reduce`, the login button transition duration was `0s` |
| Reflow | Pass. The service page had no horizontal overflow at 720, 640, 512, or 320 CSS pixels. 720 and 512 are the CSS viewports of a 1440px and 1024px window at 200% zoom |
| Contrast on the login screen | Pass for the sampled pair. Green button text measured 6.35:1. Body text on the page background measured 5.95:1 |
| Touch targets on login | Pass. No link, button, or input was under 24 by 24 CSS pixels |
| Secure-action loading | Fixed in development. Strict Mode cleared the exchange timer after the link fragment had been removed, so the screen stayed on “Checking this link…”. The secret is kept for the restarted check. The exchange still runs once |

Automated customer component tests still cover labels, `aria-expanded`, and the More menu keyboard path. This browser pass does not replace an authenticated screen-reader session.

## Route matrix

Severity is what remained before this correction, or “None” where the reviewed state was already clear. “Fixed in” names the PR that holds the current behaviour.

| Page or journey | Verification | Widths | Visual | Interaction | Accessibility | Severity | Fixed in | Remaining limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Marketing home, Get Help, recovery, Guard | Running public site | 1440, 390, 320, and recovery at 390 | Shared logo, ink, and green. No overflow | Source and public render | Skip and focus styles exist on Marketing | None | Earlier marketing work | 768 and 1024 were not re-shot in this pass |
| Public customer root and `/pay/return` | Running public site, no backend | 1440, 390 | “Secure action” and “Payment is being confirmed” | Source | One heading, no paid claim | None | PR C | Not an authenticated return |
| Login and OTP | Synthetic fixture of `LoginClient` | 320, 390, 600, 768, 1024, 1440 | Same logo scale as Marketing | Tab order recorded | Labels, alert on the invalid code, 3px focus | P1 header ring | PR A, PR D | Not a live email delivery |
| Dashboard, cases, Guided and Managed case | Synthetic fixture in the first PR D pass, plus source | 1440, 390, 320 for the action dashboard | Action leads the dashboard. Completed Guided says preparation is complete | Source and existing tests | One h1, current nav item | None found in the fixture | PR A, PR B | Not a live case |
| Service and quotation | Synthetic fixture | 1440, 1024, 768, 390 | Quote, agreement, and permission are separate. Decline is secondary | Source | Breadcrumb and headings | None | PR C, PR D | Two accept actions can both be open. That is the recorded state, not a merged decision |
| Case documents and evidence | Synthetic fixture | 1440, 1024, 768, 390 | Upload, file name, download, and earlier submission are separate. No pack is inferred | Empty and invalid upload checked | Label, description, and alert | None | PR B, PR D | Upload was not sent to storage |
| Global documents | Synthetic fixture in the first pass, plus source | 1440 | Published files do not say a Guided pack is ready | Source | Existing tests | None | PR B | Pack projection proposal stays unapplied |
| Messages | Synthetic fixture | 1440, 768, 390 | Team and customer entries differ. Reply says to use email | Expand and collapse checked | Button name and `aria-expanded` | None for the control | PR B | Provider delivery sentence is a parse contract. See follow-up |
| Payments due | Synthetic fixture | 1440, 1024, 768, 390, 320 | Order total and the recorded due amount are separate. The case identity sits in its own card | Source and payment tests | Pay button is the primary action | P1 identity was loose | PR C, PR D | Caption remains “Outstanding” for the recorded due figure |
| Receipt and invoice | Synthetic billing document | 1440, 768, 390 | Download is outside the document. Figures stack on a narrow screen | Source | Table headers remain | None | PR C | “Outstanding” on the document is the shared billing renderer |
| Paused invoice | Source of both RPCs, plus fixture of the page | 1440, 390 | Says collection is paused and the link is unavailable | 409 covered by tests | No cancellation claim | P0 wording | PR D | Does not show Stripe’s invoice status, because the RPC does not return it |
| Secure payment, invoice, and Guard consent | Synthetic `ActionClient` after the code step | 1440, 768, 390 | Amount due, unpaid warning, Decline as secondary | Code step reached the review screen | Checkbox label, visible focus | P0 provider jargon removed earlier | PR D | Consent checkbox still shows `GUARD_PERMISSION_V1` |
| Expired secure link and checking state | Synthetic `ActionClient` | 1440, 390, loading at 1440 | Expired state tells the customer to request a new link | Timer restart checked | Status text is in the page | P1 stuck checking state in dev | PR D | Not a live expired token |
| Payment return pending and failed | Synthetic return screen, plus the public return route | 1024, 768 | Pending is not paid. Failure offers Payments and contact | Source | Heading plus status | None | PR C | No live Stripe return |
| Relaunch Guard location | Synthetic subscribed location | 1440, 1024, 768, 390 | Scheduled checks, no Google outcome promise, receipt links | Source | Status text | None | PR C | Not a live subscription |
| Account | Synthetic fixture | 1440, 1024, 768, 390, 320 | Contact details, verification, and a sign-out explanation | Source | Error state uses h1 then h2 | None | PR C | Not a live profile |
| Error and loading panels | Synthetic unavailable and loading components | 1440 and 390 where listed | Each panel names the failure and a next step | Source | `role="status"` on loading | None | PR A–C | Not a forced backend outage |

## Journeys

These were reviewed from the components and fixtures. They were not walked as one signed-in DEV customer.

Guided: Marketing explains preparation help. The dashboard asks for evidence when that is the recorded next step. Documents keep the upload separate from published files. The quotation states the amount before acceptance. Payment says opening checkout does not mark the order paid. A completed Guided case says the preparation is complete and that the customer submits the pack. Nothing in that path says Google restored the profile.

Managed: The service and payment copy say the success fee is invoiced only after documented success, and that a card is not charged automatically. A paused collection does not say the invoice was cancelled and does not say it remains open. Outcome copy still depends on a recorded outcome.

Guard: The introduction states the monthly price, scheduled checks, and that checks are not continuous and do not change the Google profile. The subscribed location shows the last recorded check, billing, and a cancellation sentence that does not promise a refund. Consent stays a checkbox.

Returning customer: Portal navigation is Dashboard, Cases, Documents, then More for Messages, Payments, Guard, and Account below 768px. At 768px and above those items are in the bar. Sign-out is in the portal bar and on Account.

Errors: An expired secure link says it is unavailable and to request a new link. A payment that was not collected says the case is unchanged. Load failures say to refresh and contact ProfileRelaunch. A payment return without confirmation says the payment is being confirmed.

## Manual DEV walkthrough

Use a DEV customer that already has the records below. Do not create a payment, send a customer email, start a subscription, or close a case.

1. Open Marketing, then the customer login. Confirm the logo and green button feel like the same product.
2. Sign in with the DEV email and one-time code. Land on the dashboard. Confirm the first panel is the current case or the required action.
3. Open the active Guided case. Confirm the stage does not say Google has restored the profile unless a decision is recorded.
4. Open that case’s documents. Download one published file. Confirm evidence already sent is separate from files ready for the customer.
5. Open Payments. Confirm the order total and any amount still due are labelled separately, and that a processing payment is not marked paid.
6. Open the receipt or invoice only if one is already recorded. Do not start checkout.
7. Open Messages. Expand a long message. Confirm the reply instruction points to email.
8. Open Relaunch Guard. Confirm an active location does not promise continuous monitoring or a Google outcome.
9. Open Account, then sign out, then sign in again.
10. Open an already-expired secure link. Confirm it does not show a payment form.

## Performance

No new dependency, polling loop, or client bundle was added. The portal header was already a client component so it can mark itself when the page scrolls.

On the local development login render, the document had no `layout-shift` entries after load, and the 2x logo request was a 640px image for a 208px slot. That resource count includes the development server, so it is not a production LCP or CLS score. Production Core Web Vitals were not measured. No hydration error was observed on the fixture pages that reached a settled heading.

## Follow-ups that need a separate approval

- Message text “Accepted by the email provider. Delivery is not confirmed.” is an allowed value from the message reader. Changing the visible words without the read model would hide the message.
- `docs/customer/global-documents-pack-projection-proposal.md` is still not applied. Global Documents must not treat published files as a finished Guided pack.
- Acceptance checkboxes still name versions such as `GUARD_PERMISSION_V1`. That text is part of what the customer confirms. It should change only with the acceptance copy, not in a presentation pass.
- The shared billing-document renderer still labels the unpaid remainder “Outstanding”. The portal payment card uses the same word for a recorded due amount, next to a separate order total. Renaming it would touch PDFs as well as the page.

## What this audit does not prove

It does not prove a signed-in journey across DEV, a Stripe return, an email delivery, a screen reader pass, or production Core Web Vitals. Those remain the manual walkthrough above and the CI preview check for this pull request.
