-- ADMIN-PACK-PUBLISH-SESSION-01.
-- Not applied to DEV or Production.
-- Three STABLE Admin context functions call public.admin_session_v1, which
-- updates admin_sessions.last_seen_at inside the existing 30-minute window.
-- PostgREST runs a STABLE function in a read-only transaction, so that UPDATE
-- fails with SQLSTATE 25006 before the command. These statements change only
-- the volatility markers and ask PostgREST to reload function metadata.
-- They do not replace the function bodies, the session policy, or any case,
-- pack, document, email, or payment data.
-- public.admin_guided_pack_mail_context_v1(text, uuid, uuid)
-- public.admin_guided_completion_context_v1(text, uuid)
-- public.admin_managed_notice_context_v1(text, text, uuid, uuid)

ALTER FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) VOLATILE;
ALTER FUNCTION public.admin_guided_completion_context_v1(text, uuid) VOLATILE;
ALTER FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) VOLATILE;

REVOKE ALL ON FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_guided_completion_context_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_completion_context_v1(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
