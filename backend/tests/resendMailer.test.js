import { describe, expect, it, vi } from "vitest";
import { createResendMailer } from "../src/modules/auth/resend-mailer.js";

describe("Resend transactional mail adapter", () => {
  it("posts a protected email request and returns the provider message ID", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"id":"email-id-123"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const mailer = createResendMailer({ apiKey: "re_test_secret", fetchImpl });

    const result = await mailer.sendMail({
      from: "InvoiceFlow <auth@example.test>",
      to: "owner@example.test",
      subject: "Verify your email",
      text: "Open the one-time link.",
      idempotencyKey: "verify_email/token-record-123",
    });

    expect(result).toEqual({ messageId: "email-id-123" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer re_test_secret",
      "Content-Type": "application/json",
      "Idempotency-Key": "verify_email/token-record-123",
    });
    expect(JSON.parse(options.body)).toEqual({
      from: "InvoiceFlow <auth@example.test>",
      to: ["owner@example.test"],
      subject: "Verify your email",
      text: "Open the one-time link.",
    });
  });

  it("does not expose the API key or provider error body when delivery fails", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"message":"invalid key re_test_secret"}', {
          status: 401,
        }),
    );
    const mailer = createResendMailer({ apiKey: "re_test_secret", fetchImpl });
    await expect(
      mailer.sendMail({
        from: "auth@example.test",
        to: "owner@example.test",
        subject: "Verify",
        text: "Open link",
      }),
    ).rejects.toThrow("Resend email request failed with HTTP 401.");
  });

  it("requires an API key", () => {
    expect(() => createResendMailer({ apiKey: "" })).toThrow(
      "RESEND_API_KEY is required",
    );
  });
});
