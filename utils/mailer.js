import nodemailer from "nodemailer";

let _transporter;

export function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    _transporter.verify((error) => {
      if (error) {
        console.error("❌ Email transporter error:", error.message);
        console.error("   User:", process.env.EMAIL_USER);
        console.error("   Host:", process.env.EMAIL_HOST || "smtp.gmail.com");
        console.error("   Port:", process.env.EMAIL_PORT || 587);
      } else {
        console.log("✅ Email transporter is ready");
      }
    });
  }

  return _transporter;
}

// ── Reusable send helper ─────────────────────────────────────
export async function sendMail({ to, subject, html, text }) {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"Monexia" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    console.log(`📧 Email sent to ${to} — Message ID: ${info.messageId}`);
    return { success: true, info };
  } catch (err) {
    console.error("❌ sendMail failed:");
    console.error("   Code   :", err.code);
    console.error("   Message:", err.message);
    throw err;
  }
}

// ── Templates ────────────────────────────────────────────────
export async function sendWelcomeEmail(to, name) {
  return sendMail({
    to,
    subject: "Welcome to Monexia 🎉",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                  background:#0a0f0d;color:#f8fafc;border-radius:16px;">
        <h2 style="color:#10b981;">Welcome, ${name}! 🎉</h2>
        <p style="color:#94a3b8;">
          Your Monexia account is ready. Start managing your finances smarter today.
        </p>
        <hr style="border-color:#1e293b;margin:1.5rem 0;">
        <p style="color:#475569;font-size:0.75rem;">— The Monexia Team</p>
      </div>
    `,
    text: `Welcome, ${name}! Your Monexia account is ready.`,
  });
}

export async function sendPasswordResetEmail(to, resetLink) {
  return sendMail({
    to,
    subject: "Reset Your Monexia Password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                  background:#0a0f0d;color:#f8fafc;border-radius:16px;">
        <h2 style="color:#10b981;margin-bottom:0.5rem;">Reset Your Password</h2>
        <p style="color:#94a3b8;margin-bottom:1.5rem;">
          Click the button below to reset your Monexia password.
          This link expires in <strong style="color:#f8fafc;">1 hour</strong>.
        </p>
        <a href="${resetLink}"
           style="display:inline-block;background:#10b981;color:#064e3b;
                  padding:14px 32px;border-radius:10px;text-decoration:none;
                  font-weight:700;font-size:1rem;">
          Reset Password
        </a>
        <p style="margin-top:2rem;color:#64748b;font-size:0.8rem;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border-color:#1e293b;margin:1.5rem 0;">
        <p style="color:#475569;font-size:0.75rem;">
          Or copy this link:<br>
          <span style="color:#10b981;">${resetLink}</span>
        </p>
      </div>
    `,
    text: `Reset your Monexia password: ${resetLink}`,
  });
}

export async function sendPasswordChangedEmail(to) {
  return sendMail({
    to,
    subject: "Your Monexia Password Was Changed",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                  background:#0a0f0d;color:#f8fafc;border-radius:16px;">
        <h2 style="color:#10b981;">Password Changed ✅</h2>
        <p style="color:#94a3b8;">
          Your Monexia password was successfully reset.
          If you did not do this, contact support immediately.
        </p>
        <hr style="border-color:#1e293b;margin:1.5rem 0;">
        <p style="color:#475569;font-size:0.75rem;">— The Monexia Team</p>
      </div>
    `,
    text: `Your Monexia password was successfully changed. If you did not do this, contact support immediately.`,
  });
}

export async function sendTransactionAlert(to, { type, amount, balance }) {
  return sendMail({
    to,
    subject: `Monexia — ${type} of KES ${amount}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;
                  background:#0a0f0d;color:#f8fafc;border-radius:16px;">
        <h2 style="color:#10b981;">Transaction Alert</h2>
        <table style="border-collapse:collapse;width:100%;margin-top:1rem;">
          <tr>
            <td style="padding:10px;border:1px solid #1e293b;color:#94a3b8;">Type</td>
            <td style="padding:10px;border:1px solid #1e293b;">${type}</td>
          </tr>
          <tr>
            <td style="padding:10px;border:1px solid #1e293b;color:#94a3b8;">Amount</td>
            <td style="padding:10px;border:1px solid #1e293b;">KES ${amount}</td>
          </tr>
          <tr>
            <td style="padding:10px;border:1px solid #1e293b;color:#94a3b8;">New Balance</td>
            <td style="padding:10px;border:1px solid #1e293b;">KES ${balance}</td>
          </tr>
        </table>
        <p style="margin-top:1.5rem;color:#64748b;font-size:0.8rem;">
          If you did not initiate this transaction, contact support immediately.
        </p>
        <hr style="border-color:#1e293b;margin:1.5rem 0;">
        <p style="color:#475569;font-size:0.75rem;">— The Monexia Team</p>
      </div>
    `,
    text: `${type} of KES ${amount}. New balance: KES ${balance}.`,
  });
}