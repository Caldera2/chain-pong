// ─────────────────────────────────────────────────────────
// Email Service — Uses Resend for transactional emails
// ─────────────────────────────────────────────────────────

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'Chain Pong <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'https://chain-pong.vercel.app';

export async function sendPasswordResetEmail(to: string, token: string, username: string): Promise<boolean> {
  const resetUrl = `${APP_URL}?reset-token=${token}`;

  if (!resend) {
    console.warn('⚠️ RESEND_API_KEY not set — logging reset link instead:');
    console.log(`  Reset URL for ${to}: ${resetUrl}`);
    return true; // Don't fail if email service isn't configured
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Reset your Chain Pong password',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f5d060,#d4a017);margin:0 auto 16px;"></div>
      <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">Chain Pong</h1>
    </div>

    <!-- Card -->
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px 24px;text-align:center;">
      <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 8px;">Reset Your Password</h2>
      <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hey <strong style="color:#f5d060;">${username}</strong>, we received a request to reset your password. Click the button below to create a new one.
      </p>

      <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f5d060,#d4a017);color:#0a0e1a;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;">
        Reset Password
      </a>

      <p style="color:#6b7280;font-size:12px;margin:24px 0 0;line-height:1.5;">
        This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
      </p>
    </div>

    <!-- Footer -->
    <p style="color:#4b5563;font-size:11px;text-align:center;margin-top:24px;">
      Chain Pong — PvP Ping Pong on Base
    </p>
  </div>
</body>
</html>
      `.trim(),
    });

    if (error) {
      console.error('Email send error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Email service error:', err);
    return false;
  }
}
