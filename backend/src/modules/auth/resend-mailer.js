const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export function createResendMailer({ apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey)
    throw new Error("RESEND_API_KEY is required for Resend email delivery.");

  return {
    async sendMail({ from, to, subject, text, idempotencyKey }) {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

      const response = await fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.id !== "string") {
        throw new Error(
          `Resend email request failed with HTTP ${response.status}.`,
        );
      }
      return { messageId: result.id };
    },
  };
}
