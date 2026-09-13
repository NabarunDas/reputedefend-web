/** Optional Search Console HTML-tag verification. Do not invent a token. */

export function googleSiteVerification(
  value: string | undefined = process.env.GOOGLE_SITE_VERIFICATION,
): string | undefined {
  const token = value?.trim()
  return token || undefined
}
