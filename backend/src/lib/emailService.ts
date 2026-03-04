import nodemailer from "nodemailer";

/**
 * Email service using Nodemailer with Gmail SMTP.
 *
 * Required env vars:
 *   SMTP_HOST      – e.g. "smtp.gmail.com"
 *   SMTP_PORT      – e.g. "587"
 *   SMTP_USER      – Gmail address (e.g. myapp@gmail.com)
 *   SMTP_PASS      – Gmail App Password (16-char)
 *   SMTP_FROM_NAME – Display name (e.g. "Petrozone Pulse")
 */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false, // true for 465, false for other ports (STARTTLS)
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  // Skip if not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[EmailService] SMTP not configured — skipping email send");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromName = process.env.SMTP_FROM_NAME || "Petrozone Pulse";
    const info = await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log(`[EmailService] Email sent: ${info.messageId} → ${options.to}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error(`[EmailService] Failed to send email to ${options.to}:`, message);
    return { success: false, error: message };
  }
}

/**
 * Verify SMTP connection on startup (optional).
 * Call this during app init to confirm credentials work.
 */
export async function verifyEmailService(): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[EmailService] SMTP not configured — email service disabled");
    return false;
  }

  try {
    await transporter.verify();
    console.log("[EmailService] SMTP connection verified ✓");
    return true;
  } catch (err) {
    console.error("[EmailService] SMTP verification failed:", err);
    return false;
  }
}
