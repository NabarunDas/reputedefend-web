/**
 * Same-origin allowlist check for an Admin command POST.
 *
 * The Origin header must be nonempty, exactly equal the request URL origin,
 * and be one of the server-authorised origins. `config.origin` is only the
 * first of those (the stable Preview alias, or the Production admin host).
 * Comparing a request with that single address rejects a valid immutable
 * Preview deployment even though `authConfig()` already allowlisted it.
 *
 * A missing or mismatched Origin keeps the caller's generic reload sentence.
 * A same-origin host outside the allowlist names only the server's canonical
 * address. The request host and session material are not included.
 *
 * `proxy.ts` still redirects Production browser GET/HEAD requests to
 * `PROD_ADMIN_ORIGIN`. That canonical redirect is separate from this POST guard.
 */
export function unauthorisedAdminAddressMessage(canonicalOrigin: string): string {
  return `This Admin address is not authorised for changes. Open the authorised Admin address and try again: ${canonicalOrigin}`
}

export function adminCommandOriginError(
  headerOrigin: string | null,
  requestOrigin: string,
  config: { origin: string; allowedOrigins: readonly string[] },
  genericMessage: string,
): string | null {
  if (!headerOrigin || headerOrigin !== requestOrigin) return genericMessage
  if (config.allowedOrigins.includes(requestOrigin)) return null
  return unauthorisedAdminAddressMessage(config.origin)
}
