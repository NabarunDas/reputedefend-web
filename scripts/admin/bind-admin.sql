-- One-time operator action AFTER creating and verifying the Auth account and applying the migration.
-- No account is created and no confirmation flag is modified by this script.
BEGIN;
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO STRICT uid FROM auth.users
    WHERE lower(email)='admin@profilerelaunch.com' AND email_confirmed_at IS NOT NULL
      AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now());
  IF EXISTS (SELECT 1 FROM public.admin_identity WHERE auth_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Admin is already bound. Use the documented recovery procedure.';
  END IF;
  UPDATE public.admin_identity SET auth_user_id=uid, enabled=true WHERE singleton;
END $$;
COMMIT;
