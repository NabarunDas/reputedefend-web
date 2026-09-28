# ADR 0004: Customer actions use fragment-held capability secrets, OTP verification and opaque action-specific sessions

Status: Accepted  
Date: 2026-09-18  
Step: 9A

## Decision

Customer agreement and revocation links carry a high-entropy secret in the URL fragment (`#t=`). The customer app exchanges that secret immediately for an opaque host-only cookie, then verifies the person with email OTP. Database rows store SHA-256 hashes only. The resulting session is bound to one action and lasts 15 minutes. This is not a customer dashboard login.

## Why the fragment

Query strings and path segments are commonly written to access logs, reverse proxies and analytics. A fragment is not sent in the HTTP request for the page load. The secret still must leave the URL as soon as the page is running, because it can leak through screenshots, referrer-unrelated copy/paste, or a later in-app navigation.

## Why exchange immediately

The browser reads `#t=`, POSTs `{ actionId, secret }` to a same-origin endpoint, then `history.replaceState` removes the fragment. The server checks the hash, eligibility, expiry and revocation, then sets a pending HttpOnly cookie. The raw secret is never written to `localStorage` or `sessionStorage`.

## Why hash only

A stolen database backup must not yield live capability URLs. Receipts, events and audit also omit the secret. If Admin loses the one-time copy-link response, the secret cannot be reconstructed; revoke and issue a new action.

## Why OTP is still required

Possession of the link is not enough. OTP is sent only to the verified email already bound to the action, and only while membership remains `verified` and the expected email is still current. Another customer, a revoked membership, an expired link, or an email change all fail with a generic unavailable message.

## Why the session is narrow

The action cookie is not a general customer-portal session. It cannot be reused for another action, is ignored by Admin, and does not store Supabase tokens in the browser. Admin cookies are ignored by the customer app. No `Domain=.profilerelaunch.com`.

## Why no dashboard yet

Step 9A only needs Accept / Decline / revoke for issued actions. Step 9B will reuse this session for scoped evidence and pack actions. Payments, Stripe, Resend and a catalogue are later steps.

## Future reuse

The same fragment-exchange + OTP + action session pattern can issue later capability links for evidence upload, approved-pack viewing, task responses and payment-method collection without turning those into a guessed-ID dashboard.

## Related

- [ADR 0003](0003-prepared-packs-immutable-manifests.md) — pack approval is not permission.
- [customer-actions.md](../customer-actions.md)
