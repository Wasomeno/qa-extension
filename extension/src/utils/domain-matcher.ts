/**
 * Domain matching utility for URL whitelist functionality
 */

/**
 * Extract domain from a URL
 * @param url - Full URL string
 * @returns Domain string (e.g., "example.com")
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.warn('Failed to extract domain from URL:', url, error);
    return null;
  }
}

/**
 * Check if a URL matches the whitelist
 * Empty whitelist = enabled on all sites (default behavior)
 * Non-empty whitelist = only enabled on whitelisted domains
 *
 * @param url - URL to check
 * @param whitelistedDomains - Array of whitelisted domains
 * @returns true if URL is allowed, false otherwise
 */
export function isUrlWhitelisted(
  url: string,
  whitelistedDomains: string[]
): boolean {
  // Empty whitelist means enabled on all sites
  if (!whitelistedDomains || whitelistedDomains.length === 0) {
    return true;
  }

  const domain = extractDomain(url);
  if (!domain) {
    return false;
  }

  // Check if domain matches any whitelisted domain
  return whitelistedDomains.some(whitelistedDomain => {
    // Normalize domains (lowercase, trim)
    const normalizedDomain = domain.toLowerCase().trim();
    const normalizedWhitelist = whitelistedDomain.toLowerCase().trim();

    // Exact match
    if (normalizedDomain === normalizedWhitelist) {
      return true;
    }

    // Subdomain match (e.g., "example.com" matches "app.example.com")
    if (normalizedDomain.endsWith('.' + normalizedWhitelist)) {
      return true;
    }

    return false;
  });
}

/**
 * Validate if a domain string is valid
 * @param domain - Domain string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const trimmed = domain.trim();

  // Check for basic domain format
  const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

  // Also allow localhost and IP addresses for development
  const localhostRegex = /^localhost(:\d+)?$/;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

  return domainRegex.test(trimmed) || localhostRegex.test(trimmed) || ipRegex.test(trimmed);
}

/**
 * Normalize domain string (remove protocol, path, etc.)
 * @param input - User input string
 * @returns Normalized domain string
 */
export function normalizeDomainInput(input: string): string {
  let normalized = input.trim().toLowerCase();

  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove www. prefix if present
  normalized = normalized.replace(/^www\./, '');

  // Remove trailing slash and path
  normalized = normalized.split('/')[0];

  // Remove port if present (keep it for localhost)
  if (!normalized.startsWith('localhost') && !normalized.match(/^\d/)) {
    normalized = normalized.split(':')[0];
  }

  return normalized;
}
