/** The company logo: stored as a PNG, at most this many bytes (the client resizes before upload). */
export const LOGO_MAX_BYTES = 400 * 1024;
/** The longest side the client scales the logo down to. */
export const LOGO_MAX_SIDE = 512;

export interface Branding {
  /** Changes whenever the logo changes, so its URL can be cached for good. null = no logo. */
  logoVersion: string | null;
}

/** The logo's URL, or null when there is none. */
export function logoUrl(branding: Branding): string | null {
  return branding.logoVersion ? `/branding/logo?v=${branding.logoVersion}` : null;
}
