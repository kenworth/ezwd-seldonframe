/** Public booking pages also have a path route on the configured app origin.
 * Use it so a booking link does not depend on per-workspace wildcard DNS.
 * Keep the legacy subdomain URL only when no app origin is configured.
 */
export function buildPublicBookingUrl(
  slug: string,
  baseDomain: string,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): string {
  if (!appUrl?.trim()) return `https://${slug}.${baseDomain}/book`;
  const origin = new URL(appUrl.trim());
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTP(S) URL");
  }
  return `${origin.origin}/book/${encodeURIComponent(slug)}/default`;
}
