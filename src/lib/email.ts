import nodemailer from "nodemailer";
import { configEmail } from "./config";

export type Mensagem = { para: string; assunto: string; texto: string; html: string; responderPara?: string };

export class EmailNaoConfiguradoError extends Error {}

export function emailConfigurado(): boolean {
  const { destino, smtp } = configEmail();
  return Boolean(destino && smtp.host && smtp.user && smtp.pass);
}

export async function enviarEmails(mensagens: Mensagem[]): Promise<void> {
  const { smtp } = configEmail();
  if (!emailConfigurado()) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailNaoConfiguradoError("SMTP ou e-mail de destino não configurado.");
    }
    // Desenvolvimento sem SMTP: mostra o e-mail no terminal em vez de enviar.
    for (const m of mensagens) console.info(`[email simulado] Para: ${m.para}\nAssunto: ${m.assunto}\n\n${m.texto}`);
    return;
  }
  const transporte = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  for (const m of mensagens) {
    await transporte.sendMail({
      from: smtp.from || smtp.user,
      to: m.para,
      replyTo: m.responderPara,
      subject: m.assunto,
      text: m.texto,
      html: m.html,
    });
  }
}
