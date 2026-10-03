# UX-8 — Communications and conversations

The case page `/cases/[id]/communications` is where an operator reads and acts on communication for one case. UX-1 to UX-8 are complete. UX-9 is not started.

`CASE_COMMUNICATIONS` now resolves to that route. The path is built only by `caseDestination` after the case id has passed the existing UUID check. `/communications` remains the outbound queue. `/conversations` remains the inbox and the unmatched-triage surface. A global row with a valid case id links back to the case workspace. Neither global page is removed, and neither is filtered down in the browser to stand in for the case page.

## What this workspace shows

The header names the case by its public reference, the customer and the business. The next action is `resolveCaseFlow(...).primaryAction`. When that action belongs to `CASE_COMMUNICATIONS` and its state is `ACTION_REQUIRED`, the matching control is shown here. When CaseFlow says the next action belongs somewhere else, the page says so and links to the destination CaseFlow already validated. It does not invent a second recommendation from the communication rows.

The contact line is `evidenceContactState`, labelled without collapsing the states:

| Contact reading | What the operator sees |
| --- | --- |
| `NOT_PREPARED` | Message not prepared |
| `DRAFTED` | Draft waiting for review |
| `REVIEWED` | Reviewed and ready to queue |
| `QUEUED` | Waiting for email provider |
| `ACCEPTANCE_UNKNOWN` | Provider acceptance unknown — reconciliation required |
| `PROVIDER_ACCEPTED` | Accepted by provider — delivery not confirmed |
| `DELIVERED` | Delivered to customer |
| `FAILED` | Delivery failed — contact recovery required |

`PROVIDER_ACCEPTED` is also labelled on the row as “Accepted by email provider — delivery not yet confirmed”. That is not delivery, not “email sent”, and not “customer contacted”. The customer is treated as reached only when delivery is `DELIVERED`.

Outbound history shows purpose, the recipient snapshot, subject, lifecycle, delivery, the timestamps the row actually has, recent delivery events, and whether the row is the current evidence-request message, superseded, or earlier. Provider message ids and communication ids sit in a disclosure. Missing timestamps are omitted.

Case-linked conversations show sender, subject, state, the sender-match label, received date, attachment presence, attention and assignment. Opening one shows the thread: inbound email, outbound replies, phone notes and attachments. An outbound reply uses the same lifecycle and delivery labels. `MATCHES_VERIFIED_CONTACT` stays “Matches a verified contact — not authentication”. Promoting an attachment stays “Record for evidence follow-up” and does not call the file accepted evidence.

## Case-scoped reads

`admin_communication_list_v1(p_case)` can filter by case, but it stops at 50 rows and 8 events and does not say that anything was left out. `admin_conversation_list_v1` has no case argument, so using it for one case would mean reading the global inbox and dropping other cases in the application. `admin_case_flow_facts_v1` also caps communications at 50, which is enough for the queue projection and not a case history.

`20261003120000_case_communications_workspace_v1.sql` adds two reads and nothing else in the way of tables:

- `admin_case_communications_v1(token, case)` returns that case’s communications, newest first, at most 100, with `complete`, `total` and `returned`. Each row carries at most 24 delivery events and `eventsTruncated` when older events remain.
- `admin_case_conversations_v1(token, case)` returns conversations whose `case_id` is that case, same bound and the same completeness fields. Unmatched conversations stay on the global inbox.

A missing read is “could not be loaded”. `complete: false` is “the history is incomplete”. Neither is shown as “Message not prepared” or as “not sent”. When the history is incomplete, or the rows disagree with each other or with CaseFlow’s contact reading, the page does not choose a current message and does not offer the journey commands that depend on one. A selected conversation whose case is different, or which a complete case list does not contain, is not rendered.

## Journey controls

A journey button is shown only when CaseFlow’s primary action is that step and its state is `ACTION_REQUIRED`, and the case history agrees.

- `PREPARE_EVIDENCE_REQUEST_MESSAGE` opens a draft for this case. The case id is not typed. Open evidence requests for this case are a titled list (`Waiting for evidence`, and the other existing request labels). Fulfilled and cancelled requests are not offered. The draft command is unchanged.
- `REVIEW_EVIDENCE_REQUEST_MESSAGE` reviews the current draft.
- `SEND_EVIDENCE_REQUEST` queues only when live mail is already enabled and the recipient is not suppressed. When CaseFlow reports the step as `BLOCKED` because live mail is off, the reviewed draft stays and the page says queueing is closed. It does not enable `COMMUNICATIONS_SEND_ENABLED`, the worker, or a provider.
- `WAIT_FOR_EMAIL_DELIVERY` shows the waiting state. It does not offer another send.
- `RECONCILE_EMAIL_DELIVERY` records provider acceptance. It does not resend.
- `RECOVER_CUSTOMER_CONTACT` is the contact-recovery panel below.

A case update can still be drafted from this page. It is not presented as the next action, and it is withheld when the case is closed or cancelled, the history failed to load, or the records disagree. Closed and cancelled cases do not receive journey commands. CaseFlow already clears the primary action on those cases; the workspace withholds the controls even if a caller passes one.

## Contact recovery

Permanent bounce, complaint, suppression and a permanent `FAILED` delivery are “Contact recovery required”. The failed row keeps the recipient it was sent to. The page does not offer a normal send to that address, and it does not offer a free-text replacement of the customer’s verified email.

The existing `contact_recovery` conversation command creates a task. It does not change the customer email, and creating the task is not the end of recovery. The command inserts a task and has no way to see whether an equivalent task is already open, so this workspace does not invent a duplicate check. If the case has no conversation, the task cannot be created from here; the customer record is still where a new address is verified.

`canReplace` is computed in the case read from the same checks `resend_draft` already applies: the delivery is a permanent failure, the case is not closed or cancelled, the authoritative verified email is a different usable address, that address is not suppressed, and an evidence-request message still points at an open request. Only then, and only while CaseFlow’s action is `RECOVER_CUSTOMER_CONTACT`, does the page offer the existing replacement draft. The replacement is a draft. The original row stays in the history with its original recipient. The read does not itself decide that the template is approved; the draft command still does, and it checks the address rule again.

## Provider acceptance reconciliation

`ACCEPTANCE_UNKNOWN` means a provider call may have happened and acceptance was not established. Inside the 23-hour idempotency window the worker retries the same idempotency key. Outside that window it stops, because a second provider call can send a duplicate. This workspace does not clear that state in order to send again, and it does not add an admin outcome for “the provider did not accept this, send it again”. That outcome cannot be proved safe from the current send-once rules, so it fails closed.

`admin_communication_reconcile_acceptance_v1` is the admin command for the other outcome: the provider message id is known. It requires the current record version, a provider message id and a reason. It is idempotent through the existing communication command receipt. It updates a queued `ACCEPTANCE_UNKNOWN` row to `PROVIDER_ACCEPTED`, stores the message id, writes the existing provider-accepted delivery event, and audits that this is not delivery. It then calls the existing private `communication_reconcile_webhooks_v1`. Delivery changes only if that function applies a stored provider webhook. There is no parameter and no branch that sets `DELIVERED` by itself. A bounce, a complaint, a suppression, a failure, or a message that is not queued, is denied. Replaying the same provider message id on an already accepted row only re-runs webhook reconciliation.

## What UX-8 does not change

Outgoing mail, inbound mail, the job worker, production provider mode and Resend production sending stay off. No test turns them on. Sender match is still not authentication. An attachment recorded for follow-up is still not accepted evidence. Unmatched linking stays on `/conversations`. The global draft form can still ask for a case id; the case workspace does not.

## Known limits

The case reads stop at 100 communications and 100 conversations, and at 24 delivery events, and they say so. They do not treat the first 50 rows of the older list functions as the history.

`canReplace` does not repeat the template-approval check. The replacement command still does. Approval state is not on the template row in every database this function has to run against, and copying that check into the read would have made the read fail on the communications suite.

Contact recovery cannot tell whether an equivalent task is already open. A second task can be created. The page says that.

There is no admin action that marks a message delivered, and no admin action that authorises a second provider send after `ACCEPTANCE_UNKNOWN`. If the provider can be shown not to have accepted the message, an operator still cannot safely create a new send from this workspace.

`admin_case_flow_facts_v1` is unchanged and still caps its communication projection at 50 rows. The workspace compares that reading with its own history when the history is complete. If they disagree, it stops and says the records disagree rather than picking a row.

The migration is in the repository and is not applied to `profilerelaunch-dev`. Apply `20261003120000_case_communications_workspace_v1.sql` there before production cutover. Do not replay migrations that are already applied.
