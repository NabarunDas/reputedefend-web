# ADMIN-TY-R8-D-01A-R1 — Telloya offer mail test recipient owner provision (DRAFT runbook)

**Status:** DRAFT. Source-only. Do not apply the allowlist migration, insert grants, or send email until the owner explicitly approves each step.

## Why this exists

Ordinary Admin sessions cannot authorise Telloya offer test recipients. Enrolment requires a one-time owner grant reference, then a service-role call to `public.telloya_offer_mail_test_recipient_provision_v1`. No mailbox addresses are hardcoded in SQL.

## Preconditions (all required)

1. Owner has approved applying **only** `20261113120000_telloya_offer_mail_test_allowlist_v1.sql` to DEV (not Production).
2. A real verified DEV customer exists with matching verified email and verified business membership (do not invent).
3. Owner issues a fresh opaque `grant_ref` matching `^[A-Za-z0-9_-]{16,128}$` (not an email address).
4. Global `telloya_offer_mail_control.mail_enabled` remains OFF until a separate send decision.

## Owner grant insert (DEV SQL after approval)

Insert exactly one grant row. Do not seed recipients.

```sql
insert into admin_private.telloya_offer_mail_test_owner_grants(
  grant_ref, purpose, enabled, expires_at, note
) values (
  '<owner-issued-grant-ref>',
  'telloya_offer_mail_test',
  true,
  now() + interval '2 hours',
  'owner-approved controlled DEV mail test'
);
```

## Provision (service role only)

Call `telloya_offer_mail_test_recipient_provision_v1(grant_ref, request_id, customer_id, email, note)` with the exact verified customer id and matching email. Success consumes the grant. Failure reasons include `grant_not_found`, `grant_unusable`, `email_mismatch`, `recipient_unverified`, and `authority`.

Admin `telloya_offer_mail_test_recipient_command_v1('authorize', …)` must return `denied` / `owner_provision_required`.

## Revoke / shutdown

- `revoke` with required `customerId` (Admin session allowed) disables that row.
- `shutdown` disables every enabled allowlist row.
- Revocation after queue does not cancel the durable `SEND_EMAIL` job; `admin_dev_send_email_claim_v1` rechecks TELLOYA_OFFER permission before provider dispatch. Guided/Guard mail is unchanged.

## Explicit non-goals

No template approval, catalogue seed, Stripe, Retell, Production apply, or merge of PR #487 from this runbook.
