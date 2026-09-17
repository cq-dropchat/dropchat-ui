/**
 * F06. Mirror of public.is_public_https_url in the API
 * (schemas/02_functions/02-05_url_utils.sql): https to a public hostname.
 * The database is the authority; this only lets the form say so before the
 * insert is refused.
 */
export function isPublicHttpsUrl(url: string): boolean {
  if (
    !/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(\/\S*)?$/i.test(
      url,
    )
  ) {
    return false;
  }
  if (
    /^https:\/\/[^/]*\.(internal|local|localhost|lan|home|arpa)(:|\/|$)/i.test(
      url,
    )
  ) {
    return false;
  }
  if (/^https:\/\/[^/]*supabase\.(internal|co\.internal)(:|\/|$)/i.test(url)) {
    return false;
  }
  if (/^https:\/\/[^/]*@/i.test(url)) return false;
  if (/^https:\/\/[0-9.]+(:|\/|$)/.test(url)) return false;
  return true;
}
