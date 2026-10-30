# Proposal: authoritative Guided pack on the global Documents page

Status: proposal only. No migration is included, and none should be applied from this note.

## What is wrong today

`public.customer_portal_documents_v1(text)` returns published files with `serviceTrack`. It does not return a pack record.

`public.customer_portal_case_documents_v1(text, text)` does. Its `pack` object is set only when all of these are true:

- the case service track is `GUIDED`
- settlement does not hide the documents
- a `case_prepared_packs` row is `APPROVED`, has `published_at`, and has no `unpublished_at`
- `admin_private.pack_publishable_v1(pack_id)` accepts that pack

The global page previously treated every Guided case that had any published file as “Your submission pack is ready”, and it showed the customer self-submit instructions. A published file is not that pack. This change stops the claim. Downloads of the published files are unchanged.

## What a later change would add

A read-only addition to the existing global documents projection, not a new entitlement:

- For each case already returned to that customer, include either `pack: null` or the same pack object the case documents function already builds.
- Reuse `customer_portal_case_documents_v1`’s pack predicate. Do not infer the pack from `service_track = 'GUIDED'` or from the presence of files.
- Keep the function `SECURITY DEFINER`, owned-case filtering, and `service_role` execute grants as they are.
- Do not add customer write paths, and do not change signed download or archive authorisation.

The customer app would then set `guidedPack` from that pack object, the same way the case documents page does now.

## What this proposal does not do

- No schema migration.
- No replay of an applied migration.
- No change to row-level security, session scope, or download signing.
- No Production change.
