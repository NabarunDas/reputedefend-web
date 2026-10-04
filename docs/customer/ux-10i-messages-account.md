# UX-10I — Customer Portal Messages and Account

Complete in source. The migration has not been applied. The Customer Portal stays disabled. UX-10J is not started.

## Routes

- `/portal/messages` lists customer-visible communication for the authenticated portal customer.
- `/portal/messages/[selector]` opens one thread.
- `/portal/account` shows the authenticated customer's own contact details and signs out the current portal session.

Navigation is Dashboard, Cases, Documents, Payments, Relaunch Guard, Messages, and Account. The disabled Account placeholder is gone. There is no UX-10J link and no launch control.

A conversation selector is `mc-` plus the SHA-256 hex of the conversation id. A standalone message selector is `mm-` plus the SHA-256 hex of the communication id. `admin_private.customer_portal_message_selector_v1` computes both. They are not stored and they are not authority. Every read resolves the selector again against the portal session customer. A selector that belongs to someone else, and a selector that does not exist, both return `{ found: false }`. The URL never contains a conversation, communication, customer, or case UUID.

## Which rows are customer-visible

The projection is computed. There is no new message table, inbox state, unread counter, or portal conversation.

An outbound `public.communications` row is visible only when all of these are true:

- direction is `OUTBOUND`
- lifecycle is `QUEUED`
- `content_locked` is true
- delivery status is `PROVIDER_ACCEPTED` or `DELIVERED`
- `body_text` is present and not blank
- `customer_id` is null or equals the portal customer
- the parent case, Guard alert, or monitoring request belongs to that customer

`DELIVERED` is shown as “Delivered by email”. `PROVIDER_ACCEPTED` is shown as “Accepted by the email provider. Delivery is not confirmed.” It is not described as delivered, received, read, or seen. Drafts, reviewed-but-unsent rows, cancelled rows, bounced rows, failed rows, `ACCEPTANCE_UNKNOWN`, `NONE`, and HTML-only rows are omitted. A legacy `SENT` status with no lifecycle is omitted.

An inbound `public.conversation_messages` row is visible only when all of these are true:

- kind is `INBOUND_EMAIL`
- import status is `IMPORTED` and loop class is `NONE`
- `body_text` is present and not blank
- the sender address equals that customer's current verified email, checked again now
- the conversation is `OPEN` or `CLOSED`, its case belongs to the portal customer, and its own `customer_id` is null or that customer

`MATCHES_VERIFIED_CONTACT` is not authority. A third party in the same conversation stays hidden even when that flag is set. Loop and rejected imports stay hidden. An `UNMATCHED` conversation stays hidden. After the customer's verified email changes, mail from the previous address is no longer shown.

`PHONE_NOTE` is internal. The schema does not record that a phone note was published to the customer, and this phase does not add that flag. Phone notes are omitted.

A case conversation appears only when it has at least one visible entry. Its label is “Open conversation” or “Previous conversation”. A visible outbound row with no conversation is its own thread, labelled “Message from ProfileRelaunch”. A visible outbound row tied to a conversation the customer cannot see is omitted rather than shown as a standalone message. Guard-alert and monitoring-request parents can satisfy ownership. Case reference, business name, and location name are shown only when the parent is a case.

Plain text is rendered as text. Raw HTML, routing headers, CC lists, provider metadata, reply aliases, RFC Message-IDs, and internal operational fields are not in the response.

## Why portal compose is not available

Portal message composition is deliberately not exposed because the existing communication model has no customer-authored portal-message authority.

The current model imports inbound email, stores admin phone notes, and lets an admin draft an outbound conversation reply. None of those is a command a portal customer is authorised to author. UX-10I does not insert into `conversation_messages`, does not pretend a portal message is `INBOUND_EMAIL` or `PHONE_NOTE`, does not create an outbound communication, and does not call the admin reply command. The customer can still reply through the existing email channel when that channel is operationally enabled. This phase does not enable mail.

## Attachments

UX-10I does not add an upload through Messages. Evidence uploads stay on the documents surface from UX-10E. Historical conversation attachments are not given a new download. Storage bucket, storage key, provider attachment id, and scan state are not returned. There is no attachment control, because no existing customer download authority covers those objects.

## Account

`public.customer_portal_account_v1` reads the portal session and returns only:

- `name` — the customer full name
- `email` — the session's current verified email
- `phone` — the stored phone, omitted when blank
- `emailVerified` — true, because the session already required the current verified email
- `phoneVerified` — the existing `contact_verified_v1` phone fact

The browser does not supply a customer id, email, or auth user id. Customer UUID, auth user UUID, verification evidence, the verifier, record version, membership evidence, audit rows, session token, and OTP data are not in the response. TypeScript rejects any unexpected key.

There is no account mutation. The page does not call `admin_record_save_v1` or `admin_contact_verify_v1`. Name, email, phone, business membership, and verification stay read-only. Contact-detail changes currently require ProfileRelaunch assistance. Self-service email change is omitted because the portal session is bound to the customer's current verified email.

If the customer email, the current verified email, and the session email snapshot no longer agree, the existing session function returns no actor. Account does not look up a customer row on its own and does not weaken that check.

## Sign out

The Account page reuses the existing Sign out control. It posts to `/api/portal/auth/sign-out`, which calls `customer_portal_sign_out_v1` for the current token only. There is no second session system and no “sign out all sessions” customer command. Session ids and other devices are not shown.

## Bounds

The list returns at most 20 threads, newest activity first, with the selector as the tie-breaker. A 21st row sets `complete` false and returns `nextCursor`. The page says older messages are not shown and links to the next page. The detail returns the newest 50 entries, oldest first within that page. When more exist, `complete` is false and the page says earlier messages in the conversation are not shown. An empty successful read says “You don't have any messages yet.” A failed read is an error with a retry, not that empty sentence.

## Migration and grants

`supabase/migrations/20261004080853_customer_portal_messages_account_v1.sql` is additive. It creates no table, no index, and no message or profile state. It has not been applied to `profilerelaunch-dev`.

The applied development head remains `20261004000625_customer_portal_relaunch_guard_v1.sql`. The repository head is `20261004080853_customer_portal_messages_account_v1.sql`. `pendingMigrations()` contains that migration alone.

Public functions, granted only to `service_role`:

- `public.customer_portal_messages_v1(text, timestamptz, text)`
- `public.customer_portal_message_v1(text, text)`
- `public.customer_portal_account_v1(text)`

Private helpers, with no execute for `PUBLIC`, `anon`, `authenticated`, or `service_role`:

- `admin_private.customer_portal_message_selector_v1(text, uuid)`
- `admin_private.customer_portal_outbound_visible_v1(public.communications, uuid)`
- `admin_private.customer_portal_inbound_visible_v1(public.conversation_messages, uuid)`
- `admin_private.customer_portal_message_threads_v1(uuid)`
- `admin_private.customer_portal_message_entries_v1(uuid, uuid, uuid)`

Each public function is `SECURITY DEFINER` with an empty `search_path` and resolves the customer from `admin_private.customer_portal_actor_v1`.

## Tests

`apps/admin/lib/customer-portal/messages-account.database.test.ts` covers ownership, the same business and location, guessed selectors, session failure, a changed verified email, hidden drafts, unsent reviews, phone notes, loops, rejected imports, third-party senders, provider and storage identifiers, delivery wording, bounded pages, account fields, the absence of a mutation command, current-session sign-out, and grants.

Customer parser, loader, and view tests reject unexpected keys and render message text as text.

## Provider boundary

`CUSTOMER_PORTAL_ENABLED` stays unset. Outgoing mail, inbound mail, Resend, webhooks, the job worker, email cron, and `COMMUNICATIONS_SEND_ENABLED` are unchanged. No notification preference, SMS, WhatsApp, or push surface is added. Stripe, Google API, and Guard automation are unchanged. Production is untouched.

## Known gaps

- Portal compose and reply are not available, for the reason above.
- Phone notes are not shown.
- Inbound mail is shown only from the customer's current verified email, on a case that customer owns.
- HTML-only messages are omitted.
- Conversation attachments are not downloadable.
- There is no unread count.
- Account editing, email change, and phone verification are not available.
- There is no sign-out of every session.
