export const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";
export const EMAIL_FETCH_TIMEOUT_MS = 8_000;

/**
 * EmailJS fetch init with a hard timeout so a hung provider cannot stall a Vercel invocation.
 * @param {string} origin
 * @param {string} body JSON payload
 */
export function emailJsRequestInit(origin, body) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body,
    signal: AbortSignal.timeout(EMAIL_FETCH_TIMEOUT_MS),
  };
}
