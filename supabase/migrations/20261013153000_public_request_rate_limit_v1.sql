BEGIN;

-- SEC-03. Enquiry and monitoring requests share one durable budget.
-- The application sends a keyed hash of the trusted client address.
-- This table stores that hash and the recent hit times, never the address.
--
-- Eight hits are allowed in any rolling 10-minute window. The bucket row is
-- locked before the count is read and written, so concurrent calls cannot
-- each observe the same remaining slot.
--
-- A bucket idle for at least 24 hours, with no hit inside that period, is
-- eligible for deletion. Each call removes at most 32 of those rows and
-- skips any row another call already holds, so cleanup stays bounded and
-- does not take an active client's slot.

CREATE SCHEMA IF NOT EXISTS admin_private;

CREATE TABLE admin_private.public_rate_limit_buckets (
  client_hash text PRIMARY KEY CHECK (client_hash ~ '^[a-f0-9]{64}$'),
  hits timestamptz[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_rate_limit_buckets_hits_size CHECK (cardinality(hits) <= 8)
);

ALTER TABLE admin_private.public_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_private.public_rate_limit_buckets FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.consume_public_rate_limit_v1(p_client_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_existing timestamptz[];
  v_kept timestamptz[];
  v_recent integer;
  v_status text;
BEGIN
  IF p_client_hash IS NULL OR p_client_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  -- Updating the existing row locks it for this transaction before any
  -- cleanup can delete a caller that has been idle.
  INSERT INTO admin_private.public_rate_limit_buckets (client_hash, hits)
  VALUES (p_client_hash, ARRAY[]::timestamptz[])
  ON CONFLICT (client_hash) DO UPDATE
    SET updated_at = admin_private.public_rate_limit_buckets.updated_at;

  SELECT hits INTO v_existing
  FROM admin_private.public_rate_limit_buckets
  WHERE client_hash = p_client_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT coalesce(array_agg(hit ORDER BY hit), ARRAY[]::timestamptz[]), count(*)::integer
  INTO v_kept, v_recent
  FROM unnest(v_existing) AS hit
  WHERE hit > v_now - interval '10 minutes';

  IF v_recent >= 8 THEN
    UPDATE admin_private.public_rate_limit_buckets
      SET hits = v_kept, updated_at = v_now
      WHERE client_hash = p_client_hash;
    v_status := 'limited';
  ELSE
    UPDATE admin_private.public_rate_limit_buckets
      SET hits = array_append(v_kept, v_now), updated_at = v_now
      WHERE client_hash = p_client_hash;
    v_status := 'ok';
  END IF;

  DELETE FROM admin_private.public_rate_limit_buckets
  WHERE client_hash IN (
    SELECT stale.client_hash
    FROM admin_private.public_rate_limit_buckets AS stale
    WHERE stale.updated_at < v_now - interval '24 hours'
      AND stale.client_hash <> p_client_hash
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(stale.hits) AS hit
        WHERE hit > v_now - interval '24 hours'
      )
    ORDER BY stale.updated_at
    LIMIT 32
    FOR UPDATE SKIP LOCKED
  );

  RETURN jsonb_build_object('status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit_v1(text) TO service_role;

COMMIT;
