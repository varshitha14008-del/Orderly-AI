/**
 * PayPal OAuth 2.0 Client with In-Memory Caching & Exponential Backoff
 * Endpoint: POST https://api-m.sandbox.paypal.com/v1/oauth2/token
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

let cachedToken: CachedToken | null = null;

export function getPayPalBaseUrl(): string {
  const env = process.env.PAYPAL_ENV || "sandbox";
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function getPayPalCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET. Please ensure they are defined in .env.local"
    );
  }

  return { clientId, clientSecret };
}

/**
 * Retrieves a valid PayPal OAuth access token, caching it until 5 minutes before expiration.
 */
export async function getPayPalAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  if (!forceRefresh && cachedToken && cachedToken.expiresAt - bufferMs > now) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getPayPalCredentials();
  const baseUrl = getPayPalBaseUrl();
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      });

      if (response.status === 429) {
        // Rate limited - wait with exponential backoff
        const delay = Math.pow(2, attempt) * 500;
        console.warn(`[PayPal Auth] Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`PayPal OAuth failed (status ${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 32400;

      cachedToken = {
        accessToken: data.access_token,
        expiresAt: now + expiresInSec * 1000,
      };

      console.log(`[PayPal Auth] Fresh access token acquired. Valid for ${expiresInSec}s.`);
      return cachedToken.accessToken;
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
      await new Promise((res) => setTimeout(res, 500 * attempt));
    }
  }

  throw lastError || new Error("Failed to acquire PayPal access token after retries");
}

/**
 * Clears the cached token (useful in tests or when an API returns 401 Unauthorized)
 */
export function invalidateCachedToken(): void {
  cachedToken = null;
}
