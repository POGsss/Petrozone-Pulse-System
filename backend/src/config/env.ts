// Load environment variables
import dotenv from "dotenv";
dotenv.config();

// Export a function to verify env vars are loaded
export function verifyEnv(): void {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Warn about optional email/SMS service env vars
  const optionalEmail = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const missingEmail = optionalEmail.filter((key) => !process.env[key]);
  if (missingEmail.length > 0) {
    console.warn(`⚠ Email service disabled — missing: ${missingEmail.join(", ")}`);
  }

  const optionalSms = ["SEMAPHORE_API_KEY"];
  const missingSms = optionalSms.filter((key) => !process.env[key]);
  if (missingSms.length > 0) {
    console.warn(`⚠ SMS service disabled — missing: ${missingSms.join(", ")}`);
  }
}
