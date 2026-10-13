BEGIN;

-- SEC-03. Enquiry and monitoring requests share one durable budget.
-- The application sends a keyed hash of the trusted client address.
-- This table stores that hash and the recent hit times, never the address.
--
-- Eight hits are allowed in any rolling 10-minute window. The bucket row is
-- locked before the count is read and written, so concurrent calls cannot
-- each observe the same remaining slot.

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
BEGIN
  IF p_client_hash IS NULL OR p_client_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  INSERT INTO admin_private.public_rate_limit_buckets (client_hash, hits)
  VALUES (p_client_hash, ARRAY[]::timestamptz[])
  ON CONFLICT (client_hash) DO NOTHING;

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
    RETURN jsonb_build_object('status', 'limited');
  END IF;

  UPDATE admin_private.public_rate_limit_buckets
    SET hits = array_append(v_kept, v_now), updated_at = v_now
    WHERE client_hash = p_client_hash;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit_v1(text) TO service_role;

COMMIT;
