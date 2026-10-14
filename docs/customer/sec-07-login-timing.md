# SEC-07 portal login timing

GitHub issue [#183](https://github.com/NabarunDas/reputedefend-web/issues/183) tracks this risk. These notes are synthetic evidence from mocked services. They are not a Production exploit and they do not close SEC-07.

The Customer Portal stays off (`CUSTOMER_PORTAL_ENABLED` is unset) until a reviewed mitigation, or an accepted residual-risk decision, exists.

## What the code does

`startLogin` and `resendLogin` return one generic HTTP 200 for every syntactically valid email. The body is the shared login sentence. Cache and robots headers match. Start sets the same opaque pending cookie. Resend sets none.

Only an `ok` result that includes an email awaits `sendTrustedOtp`. That function awaits auth-user provisioning, `signInWithOtp` with `shouldCreateUser: false`, and, after the provider accepts, `customer_portal_confirm_otp_sent_v1`. Unknown, unverified, admin, rate-limited, and missing-cookie resend paths return without that call.

The provider call stays awaited so a serverless invocation does not finish the response and drop the send. No sleep, detached send, or OTP to an ineligible address was added.

## Synthetic measurements

Harness, 2026-10-14, on the SEC-07 branch before the default suite dropped the wall-clock samples. No production customer was queried and no OTP was sent. The database RPC and a new-user `createUser` resolved immediately. Injected delay: 100ms. Each figure is 30 interleaved rounds after 2 discarded warmup rounds. Times are milliseconds.

### Deterministic timer

`setTimeout` inside the mocked `signInWithOtp`, and inside `listUsers` for an existing auth user. Not a network measurement.

| Path | Median | p95 | p95 − min |
| --- | ---: | ---: | ---: |
| Start unknown | 0.31 | 0.63 | 0.49 |
| Start unverified | 0.23 | 0.48 | 0.34 |
| Start admin | 0.30 | 0.56 | 0.43 |
| Start cooldown | 0.37 | 0.61 | 0.48 |
| Start provider success | 100.67 | 101.07 | 1.03 |
| Start provider error | 100.68 | 100.94 | 0.49 |
| Start existing auth user | 201.11 | 201.40 | 0.71 |
| Resend missing cookie | 0.27 | 0.42 | 0.31 |
| Resend unavailable | 0.21 | 0.67 | 0.54 |
| Resend cooldown | 0.34 | 0.53 | 0.41 |
| Resend provider success | 100.86 | 101.16 | 0.54 |
| Resend provider error | 100.92 | 101.26 | 0.58 |

Eligible start minus unknown: 100.36ms on success and 100.37ms on provider error. Cooldown minus unknown: 0.06ms. Existing auth user minus new-user success: 100.44ms (one awaited `listUsers` page). Resend success minus missing cookie: 100.59ms.

### Local HTTP

`signInWithOtp` and the existing-user `listUsers` awaited `fetch` to `127.0.0.1`, where the server held the response for 100ms. Local socket time only, not Production Supabase.

| Path | Median | p95 | p95 − min |
| --- | ---: | ---: | ---: |
| Start unknown | 0.21 | 0.58 | 0.46 |
| Start cooldown | 0.32 | 0.46 | 0.34 |
| Start provider success | 101.50 | 101.94 | 1.24 |
| Start provider error | 101.51 | 101.97 | 1.35 |
| Start existing auth user | 202.77 | 205.04 | 3.42 |
| Resend missing cookie | 0.21 | 0.37 | 0.26 |
| Resend provider success | 101.53 | 101.93 | 1.47 |
| Resend provider error | 101.67 | 101.89 | 0.92 |

Eligible medians sat about 101.3ms above the matching fast path. The extra directory lookup added about 101.3ms.

Every sample was HTTP 200 with the same generic message and the same cache and robots headers. Start cookie attributes matched. Resend set no cookie. Bodies and cookies did not contain the address, customer id, or branch status.

## Not established

- Exploitability against Production Supabase or a real network path.
- The SQL cost difference inside `customer_portal_begin_login_v1`: the admin address returns before the customer lookup, an unknown or unverified address does a locked lookup, and an eligible address also reserves a send and inserts a challenge.
- Further `listUsers` pages. The harness waited for one page. A full page of 200 users schedules another awaited read.

Customer-action OTP is a different contract. The caller already holds a secret link, and rate-limit or provider failure uses a different HTTP status.

## Tests that stay in CI

`apps/customer/lib/portal/login-handoff.test.ts` uses deferred promises. An eligible start or resend stays pending until the provider promise settles. Ineligible and cooldown paths resolve without calling `signInWithOtp`. Those tests do not require a timing gap. The wall-clock samples above are not part of the default Vitest suite.
