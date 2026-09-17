# Supabase activation status — 17 September 2026

## Completed in development

Project: `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`, London region).

Applied `single_admin_auth_v1` through the connected Supabase migration service. The service assigned version **20260917080553**; the repository migration filename now matches this recorded version. SQL content is unchanged from the tested PR #86 migration. Do not run the previous filename or apply the same SQL again.

Existing customer/case/monitoring tables were present, but migration history was empty before this change, consistent with their original SQL Editor setup. Existing baseline SQL was not replayed. Do not run a blanket migration push until those historical baselines have been reconciled separately.

Live verification confirmed:

- All three admin tables exist and have RLS enabled.
- anon and authenticated have no direct table access and cannot execute admin RPCs.
- service_role can execute the six intended authentication RPCs, cannot directly read the private admin tables, and cannot call the identity lookup helper.
- Invalid session lookup returns no session; starting an OTP request while the admin identity is disabled is denied.
- The singleton identity remains disabled and unbound; no admin Auth user exists yet.

No customer rows, existing policies, mail configuration, hosting configuration or production project were changed. No OTP email was sent.

## Remaining activation work

1. Create/confirm the admin@profilerelaunch.com Auth user through the supported dashboard/Auth administration API, then execute scripts/admin/bind-admin.sql once and verify the binding.
2. Configure Auth custom SMTP, the token email template and ten-minute/six-digit OTP settings.
3. Configure the separate admin hosting project's environment and complete actual mailbox and browser acceptance.

The connected database integration does not expose Auth user creation or SMTP configuration. Dashboard sign-in was attempted through secure credential entry but reached a CAPTCHA; the sign-in result remains unverified until that step is completed.

## Security advisor results

No warning was reported for the new admin functions. Informational RLS-without-policy findings are intentional for these server-only tables; do not add browser policies to silence them.

The project also has pre-existing warnings on public.set_case_public_ref (mutable search_path) and public.rls_auto_enable (browser-role EXECUTE grants on a SECURITY DEFINER event-trigger function). These were inspected but not altered as part of the admin activation migration. Review them in a separate baseline-hardening change; the event-trigger finding alone does not prove direct RPC invocation is exploitable.

- [RLS without policy explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Mutable function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
