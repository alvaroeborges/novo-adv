// =============================================================================
//  E-mails personalizados (OPCIONAL).
//
//  O evento já é criado com sendUpdates="all", então o Google Agenda envia
//  um convite real (com link do Meet) para o cliente e para o advogado.
//  Este módulo adiciona, POR CIMA disso, os e-mails com o texto das seções
//  15 e 16 do briefing — mas só se o SMTP estiver configurado no .env.
//  Sem SMTP, as funções apenas registram um aviso e não quebram o fluxo.
// =============================================================================

const nodemailer = require("nodemailer");

function getTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS implícito; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/**
 * Envia os dois e-mails (cliente + advogado). Recebe já formatado o rótulo
 * de data/hora ("dateLabel") calculado no fuso America/Sao_Paulo.
 */
async function sendEmails({
  name,
  email,
  phone,
  subject,
  message,
  dateLabel,
  timeLabel,
  durationMin,
  meetLink,
  timezone,
}) {
  const tx = getTransporter();
  if (!tx) {
    console.info(
      "[email] SMTP não configurado — convites do Google Agenda já foram enviados."
    );
    return { sent: false, reason: "smtp_not_configured" };
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const lawyerTo =
    process.env.LAWYER_NOTIFY_EMAIL || process.env.GOOGLE_CALENDAR_ID;
  const meet = meetLink || "(o link do Meet está no convite do Google Agenda)";

  // ---- E-mail para o cliente (briefing seção 15) ----------------------------
  const clientText = `Olá, ${name}.

Sua reunião foi agendada com sucesso.

Data: ${dateLabel}
Horário: ${timeLabel} (${timezone})
Duração: ${durationMin} minutos

Google Meet:
${meet}

Se precisar remarcar ou cancelar, responda este e-mail.

Atenciosamente,
Jonathan Rodrigues`;

  const clientHtml = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1e1712;line-height:1.6">
    <p>Olá, <strong>${escapeHtml(name)}</strong>.</p>
    <p>Sua reunião foi agendada com sucesso.</p>
    <table style="border-collapse:collapse">
      <tr><td style="padding:2px 12px 2px 0"><strong>Data</strong></td><td>${escapeHtml(dateLabel)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>Horário</strong></td><td>${escapeHtml(timeLabel)} (${escapeHtml(timezone)})</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>Duração</strong></td><td>${durationMin} minutos</td></tr>
    </table>
    <p style="margin-top:16px">
      <a href="${escapeHtml(meetLink || "#")}" style="background:#b08a4e;color:#1e1712;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Entrar na reunião</a>
    </p>
    <p style="color:#5c2a2e">Se precisar remarcar ou cancelar, responda este e-mail.</p>
    <p>Atenciosamente,<br>Jonathan Rodrigues</p>
  </div>`;

  await tx.sendMail({
    from,
    to: email,
    replyTo: lawyerTo,
    subject: `Reunião confirmada — ${dateLabel} às ${timeLabel}`,
    text: clientText,
    html: clientHtml,
  });

  // ---- E-mail para o advogado (briefing seção 16) --------------------------
  const lawyerText = `NOVO AGENDAMENTO

Cliente: ${name}
E-mail: ${email}
Telefone: ${phone}
Data: ${dateLabel}
Horário: ${timeLabel} (${timezone})
Duração: ${durationMin} min
Assunto: ${subject}

Mensagem:
${message || "(sem mensagem)"}

Google Meet:
${meet}`;

  await tx.sendMail({
    from,
    to: lawyerTo,
    replyTo: email,
    subject: `Novo agendamento — ${name} — ${dateLabel} ${timeLabel}`,
    text: lawyerText,
  });

  return { sent: true };
}

module.exports = { sendEmails };
