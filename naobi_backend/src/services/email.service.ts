import nodemailer from 'nodemailer';
import { config } from '../config/server';

const transporter = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  secure: config.mail.secure,
  auth: {
    user: config.mail.user,
    pass: config.mail.pass,
  },
});

export const emailService = {
  async sendOtpEmail(email: string, otpCode: string, isRegistration = false): Promise<void> {
    const subject = isRegistration
      ? 'noabi — vérifiez votre email'
      : 'noabi — code de connexion';

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: system-ui, sans-serif; color: #111; background: #fafafa;">
        <div style="max-width: 480px; margin: 24px auto; padding: 24px; background: #fff; border: 1px solid #e5e5e5;">
          <h1 style="font-size: 18px; margin: 0 0 12px;">noabi</h1>
          <p style="font-size: 14px; line-height: 1.5;">
            ${
              isRegistration
                ? 'Utilisez le code ci-dessous pour vérifier votre adresse email.'
                : 'Utilisez le code ci-dessous pour vous connecter.'
            }
          </p>
          <p style="font-size: 28px; letter-spacing: 0.3em; font-family: ui-monospace, monospace; text-align: center; padding: 16px; border: 1px solid #e5e5e5;">
            ${otpCode}
          </p>
          <p style="font-size: 12px; color: #666;">Ce code expire dans 10 minutes.</p>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: config.mail.from,
      to: email,
      subject,
      html,
    });
  },

  async sendBudgetAlertEmail(
    email: string,
    opts: { orgName: string; ratio: number; ceiling: number; consumed: number },
  ): Promise<void> {
    if (!config.mail.user) {
      return;
    }
    const subject = `noabi — plafond budgétaire ${opts.ratio}%`;
    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: system-ui, sans-serif; color: #111;">
        <div style="max-width: 480px; margin: 24px auto; padding: 24px; border: 1px solid #e5e5e5;">
          <h1 style="font-size: 18px;">noabi</h1>
          <p>L’organisation <strong>${opts.orgName}</strong> a consommé ${opts.ratio}% de son plafond budgétaire.</p>
          <p>Consommé : ${opts.consumed.toFixed(4)} / plafond : ${opts.ceiling.toFixed(4)}</p>
        </div>
      </body>
      </html>
    `;
    await transporter.sendMail({
      from: config.mail.from,
      to: email,
      subject,
      html,
    });
  },
};

export default emailService;
