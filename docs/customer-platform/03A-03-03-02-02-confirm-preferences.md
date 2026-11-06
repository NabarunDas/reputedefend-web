# 03A-03-03-02-02 — Audited confirm business preferences

`20261105144256_admin_commercial_confirm_preferences_v1.sql` was applied once to hosted DEV. The verified DEV ledger contains 112 entries and ends at `20261106003939`. Begin setup `20261105130000` is applied earlier. Do not replay `20261105144256`. Do not apply `20261105144256` to Production.

## What this command stores

`public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)` records one customer-confirmed preference for one selected Telloya location after Begin Setup. It is service-role only. The Admin route also requires `ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED` and `ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED`. Both default off. The database does not read either flag.

A preference is confirmed only when the command stores a `CONFIRMED` row. A missing location and a `DRAFT` row do not complete the checklist. `PROFILE_REQUIRED` does not complete it either.

The row references the customer, business, commercial subscription, onboarding request, selected location, and the Telloya entitlement whose provision is `PROFILE_REQUIRED`. It stores the IANA timezone, local wall-clock opening hours, exceptional-hours behaviour, out-of-hours handling, greeting, enquiry details, callback instructions and windows, urgent-call rules, direct-contact rules, optional special instructions, voice presentation (`female`, `male`, or `no_preference`), accent, spoken language, additional languages, and optional pronunciation notes. Hours are not converted to a UTC offset. No provider voice identifier is stored.

Confirmation records the source (`recorded_email`, `recorded_message`, or `telephone`), the existing communication or message identifier when that source is used, a staff attestation, the customer confirmation time, the staff actor, the server timestamp, the preference version, and the request id. Telephone confirmation requires the staff attestation and does not invent a call reference. A recorded email must carry its own customer and business, an inbound sent status, and the customer’s verified email address. A recorded message must be an imported inbound message whose `sender_match` is `MATCHES_VERIFIED_CONTACT`, with no loop or automation marker. An unmatched message, another business, or a location on the evidence that is not the selected location is rejected. The staff attestation states that the referenced evidence confirms these preferences for this location. Email and message bodies are not copied.

Confirmed rows are append-only. A correction inserts the next version and leaves the earlier version in place. The same request id and payload returns the stored result. The same request id with a different payload conflicts.

The command does not change billing, subscription ownership, Guard, or the provision state. It does not call a provider, buy a number, configure an agent, enable forwarding, send mail, or move a provision to `LIVE`.

## Checklist

The setup read model is replaced in this migration. It is not edited in the applied handover file. Business and service preferences are complete only when every selected Telloya location has a latest row whose status is `CONFIRMED`. The operational status stays **Setup in progress**. The next action becomes **Confirm AI configuration**. A partial set stays incomplete and names the remaining locations.

The Customer Portal shows the recorded preferences by location and says the receptionist is not configured or active. That display is the team’s record of the customer’s confirmation. It is not the later customer confirmation required before activation.
