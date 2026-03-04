/**
 * SMS service using Semaphore (semaphore.co) — Philippine SMS gateway.
 *
 * Required env vars:
 *   SEMAPHORE_API_KEY   – Your Semaphore API key
 *   SEMAPHORE_SENDER    – Sender name (max 11 chars, e.g. "Petrozone")
 */

const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";

interface SendSmsResult {
  success: boolean;
  error?: string;
}

export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER || "Petrozone";

  if (!apiKey) {
    console.warn("[SmsService] SEMAPHORE_API_KEY not configured — skipping SMS send");
    return { success: false, error: "SMS service not configured" };
  }

  try {
    // Normalize PH number: strip +63, ensure 09xx format
    let phoneNumber = to.replace(/[\s\-()]/g, "");
    if (phoneNumber.startsWith("+63")) {
      phoneNumber = "0" + phoneNumber.slice(3);
    } else if (phoneNumber.startsWith("63")) {
      phoneNumber = "0" + phoneNumber.slice(2);
    }

    const params = new URLSearchParams({
      apikey: apiKey,
      number: phoneNumber,
      message: message,
      sendername: senderName,
    });

    const response = await fetch(SEMAPHORE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[SmsService] Semaphore API error ${response.status}:`, text);
      return { success: false, error: `SMS API returned ${response.status}: ${text}` };
    }

    const data = await response.json();
    console.log(`[SmsService] SMS sent to ${phoneNumber}:`, JSON.stringify(data));
    return { success: true };
  } catch (err) {
    const message_err = err instanceof Error ? err.message : "Unknown SMS error";
    console.error(`[SmsService] Failed to send SMS to ${to}:`, message_err);
    return { success: false, error: message_err };
  }
}
