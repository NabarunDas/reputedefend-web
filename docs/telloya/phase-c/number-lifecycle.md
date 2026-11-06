# Telloya receptionist-number lifecycle

Status: assessment only. No provider release is implemented. No number-owner row is deleted by the location-cap migration. No Retell, forwarding, or Guard monitoring call is added.

## Three states

1. Authoritative number. One operating location has one current allocation. `service_provisions.provider_binding_ref` is `alloc:` plus that allocation id. Recording a number does not mark a voice binding active and does not make the provision `LIVE`.
2. Historical reservation. `admin_commercial_record_number_allocation_v1` inserts a new `commercial_location_allocations` row and a new `commercial_provider_number_owners` row when an operator corrects the number. The provision then points at the new allocation. The previous E.164 stays in `commercial_provider_number_owners`. Another business cannot take it. The allocation comment says the previous number remains reserved, and forwarding evidence blocks the correction update. Keeping that row is deliberate. A replacement is not a release.
3. Provider-confirmed released number. A number may be reassigned only after an audited retirement says the provider allocation and the external routing have ended. That state does not exist in the schema today. Operator attestation is not provider confirmation.

## Why a correction does not delete the old owner

Deleting the old owner row when the replacement is recorded would let another business take a number that may still be routed. The current command has no proof that the provider has released the previous number. This phase does not add that delete, and it does not add an automatic provider-side release.

## Retirement, not implemented

A later change can add an audited retirement. It is not part of `20261106140000`.

States, in order:

- `RESERVED`. The owner row exists and the number must not be reassigned.
- `RELEASE_REQUESTED`. An admin actor records a request id, a reason, and the allocation being retired. The owner row stays.
- `PROVIDER_CONFIRMED`. A stored provider reference shows that the provider allocation has ended and that external routing no longer points at this platform. A note typed by an operator is not this evidence.
- `RELEASED`. Only this state allows another business to take the number.

Authorisation: an admin actor, a reason, and a request id. The customer portal does not retire a number.

Concurrency:

- Lock the owner row and the provision for that location.
- Refuse while `provider_binding_ref` still points at the allocation being retired.
- Refuse while `forwarding_instructed_at` is set, while an active `telloya_voice_number_bindings` row uses the number, or while the provision is `LIVE`.
- Refuse a second retirement of the same owner row.
- Release the owner row only after `PROVIDER_CONFIRMED`.

## Unresolved provider dependency

There is no provider client in this repository that can prove a Retell or carrier allocation has ended. Until that evidence can be stored and checked, a reserved number stays reserved. Do not treat a successful correction as that proof.
