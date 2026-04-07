# Email & SMS Service Setup Guide

This guide covers how to configure real **email** (via Gmail SMTP) and **SMS** (via Semaphore) delivery for the Petrozone Pulse System.

---

## 1. Gmail SMTP (Email Service)

The system uses **Nodemailer** with Gmail's SMTP server. You need a Gmail account with an **App Password** (regular passwords won't work if 2FA is enabled).

### Step 1 — Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under **"How you sign in to Google"**, click **2-Step Verification**
3. Follow the prompts to enable it (if not already enabled)

### Step 2 — Generate an App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - If you don't see this option, make sure 2-Step Verification is turned on
2. Enter a name like **"Petrozone Pulse"**
3. Click **Create**
4. Google will display a **16-character password** (e.g., `abcd efgh ijkl mnop`)
5. **Copy this password** — you won't be able to see it again

### Step 3 — Configure Environment Variables

Add the following to your backend `.env` file:

```env
# Email Service (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM_NAME=Petrozone Pulse
```

| Variable | Description |
|---|---|
| `SMTP_HOST` | Gmail SMTP server (`smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS) |
| `SMTP_USER` | Your full Gmail address |
| `SMTP_PASS` | The 16-character App Password (no spaces) |
| `SMTP_FROM_NAME` | Display name in the "From" field of emails |

> **Note:** Remove spaces from the App Password when pasting. `abcd efgh ijkl mnop` → `abcdefghijklmnop`

---

## 2. Semaphore (SMS Service)

The system uses [Semaphore](https://semaphore.co) for sending SMS messages. Semaphore is a Philippine-based SMS gateway.

### Step 1 — Create an Account

1. Go to [semaphore.co](https://semaphore.co)
2. Sign up for an account
3. You'll receive free credits to test with

### Step 2 — Get Your API Key

1. Log in to your Semaphore dashboard
2. Navigate to **Account Settings** → **API Keys**
3. Copy your API key

### Step 3 — Configure Sender Name (Optional)

1. In the Semaphore dashboard, go to **Sender Names**
2. Register a custom sender name (e.g., `Petrozone`)
3. Wait for approval (usually quick)
4. If you skip this, messages will be sent from the default Semaphore sender

### Step 4 — Configure Environment Variables

Add the following to your backend `.env` file:

```env
# SMS Service (Semaphore)
SEMAPHORE_API_KEY=your_api_key_here
SEMAPHORE_SENDER=Petrozone
```

| Variable | Description |
|---|---|
| `SEMAPHORE_API_KEY` | Your Semaphore API key |
| `SEMAPHORE_SENDER` | Custom sender name (optional, defaults to Semaphore's default) |

> **Note:** Semaphore only supports Philippine mobile numbers. Numbers are automatically normalized (e.g., `+639171234567` → `09171234567`).

---

## 3. Complete `.env` Example

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# Email Service (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM_NAME=Petrozone Pulse

# SMS Service (Semaphore)
SEMAPHORE_API_KEY=your_api_key_here
SEMAPHORE_SENDER=Petrozone
```

---

## 4. Testing

### Verify on Startup

When the backend starts, it will log warnings if email or SMS env vars are missing:

```
⚠ Email service disabled — missing: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
⚠ SMS service disabled — missing: SEMAPHORE_API_KEY
```

Once configured correctly, these warnings will disappear.

### Test Email Delivery

1. Create a service reminder for a customer with an email address
2. Set the notification method to **"email"**
3. Click the **Send** button on the reminder
4. Check the customer's inbox (also check spam/junk folder)

### Test SMS Delivery

1. Create a service reminder for a customer with a Philippine mobile number
2. Set the notification method to **"sms"**
3. Click the **Send** button on the reminder
4. The customer should receive the SMS within seconds

### Batch Processing

Service reminders that are scheduled and due will be automatically processed when the batch endpoint is called. Both email and SMS reminders are handled.

---

## 5. Troubleshooting

| Issue | Solution |
|---|---|
| Email not sending | Verify App Password is correct and 2FA is enabled |
| "Less secure app" error | Use App Passwords instead — Google deprecated less secure app access |
| SMS not delivering | Check Semaphore dashboard for delivery status and credit balance |
| Phone number format error | Ensure numbers use Philippine format (`09XX` or `+639XX`) |
| Emails going to spam | Add SPF/DKIM records to your domain, or use a custom domain with Gmail |
| `ECONNREFUSED` on SMTP | Check firewall settings — port 587 must be open for outbound connections |

---

## 6. Production Considerations

- **Gmail SMTP Limits:** Gmail allows ~500 emails/day for regular accounts, ~2,000/day for Google Workspace. For higher volumes, consider a dedicated email service (SendGrid, Mailgun, etc.)
- **Semaphore Credits:** Monitor your credit balance in the Semaphore dashboard. Purchase additional credits as needed.
- **Error Handling:** Failed deliveries are logged and tracked in the service reminder's `delivery_status` field. Check the `delivery_error` column for details.

