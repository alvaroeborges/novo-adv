// =============================================================================
//  Integração oficial com a Google Calendar API (v3) via googleapis.
//  Toda credencial vem de variáveis de ambiente — nada é lido do frontend.
//
//  Endpoints oficiais usados:
//    - freebusy.query   -> horários ocupados da agenda do advogado
//    - events.insert    -> cria o evento + solicita um Google Meet real
//    - events.get       -> consulta um agendamento
//    - events.delete    -> cancela um agendamento
//
//  Observação sobre "calendar-json.googleapis.com": esse host aparece apenas
//  como "service endpoint" interno da API. A forma correta e suportada de
//  consumir a Google Calendar API é pela biblioteca oficial googleapis
//  (que resolve o host www.googleapis.com/calendar/v3). É o que fazemos aqui.
// =============================================================================

const { google } = require("googleapis");

// Escopos mínimos necessários:
//   calendar.events   -> criar / ler / apagar eventos na agenda do advogado
//   calendar.freebusy -> consultar apenas blocos ocupados (sem ler conteúdo)
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
];

/**
 * Cria um cliente OAuth2. Se GOOGLE_REFRESH_TOKEN estiver definido, já injeta
 * as credenciais — a googleapis renova o access token automaticamente.
 */
function getOAuth2Client() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Configuração incompleta. Defina no .env: ${missing.join(", ")}`
    );
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }

  return client;
}

/** Instância pronta da Calendar API autenticada como a conta principal. */
function calendarClient() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "GOOGLE_REFRESH_TOKEN ausente. Rode `npm run token` autorizado como a " +
        "conta principal (rodriguesadvocacia.adv01@gmail.com) e cole o token no .env."
    );
  }
  return google.calendar({ version: "v3", auth: getOAuth2Client() });
}

/**
 * Retorna os intervalos ocupados da agenda entre timeMin e timeMax.
 * @returns {Promise<Array<{start:string,end:string}>>} RFC3339 com offset.
 */
async function getBusyIntervals(timeMinISO, timeMaxISO, calendarId, timezone) {
  const calendar = calendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone: timezone,
      items: [{ id: calendarId }],
    },
  });

  const cal = res.data.calendars && res.data.calendars[calendarId];
  if (!cal) return [];
  if (cal.errors && cal.errors.length) {
    throw new Error(
      `Google Calendar recusou a consulta freebusy (${calendarId}): ` +
        JSON.stringify(cal.errors)
    );
  }
  return (cal.busy || []).map((b) => ({ start: b.start, end: b.end }));
}

/**
 * Cria o evento real na agenda do advogado e solicita um Google Meet.
 * Usa conferenceDataVersion=1 (obrigatório para gerar o Meet) e
 * sendUpdates="all" (o Google envia os convites reais por e-mail).
 */
async function createEvent({
  calendarId,
  summary,
  description,
  startISO,
  endISO,
  timezone,
  attendeeEmail,
  attendeeName,
}) {
  const calendar = calendarClient();
  const requestId = `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const res = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO, timeZone: timezone },
      end: { dateTime: endISO, timeZone: timezone },
      attendees: attendeeEmail
        ? [{ email: attendeeEmail, displayName: attendeeName }]
        : [],
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      // Marca a origem para facilitar auditoria / filtros futuros.
      extendedProperties: { private: { source: "site-agendamento" } },
    },
  });

  return res.data;
}

async function getEvent(calendarId, eventId) {
  const calendar = calendarClient();
  const res = await calendar.events.get({ calendarId, eventId });
  return res.data;
}

async function deleteEvent(calendarId, eventId) {
  const calendar = calendarClient();
  await calendar.events.delete({ calendarId, eventId, sendUpdates: "all" });
}

/** Extrai o link do Meet de um evento já criado (nunca inventa um link). */
function extractMeetLink(event) {
  if (!event) return null;
  if (event.hangoutLink) return event.hangoutLink;
  const entry =
    event.conferenceData &&
    event.conferenceData.entryPoints &&
    event.conferenceData.entryPoints.find((e) => e.entryPointType === "video");
  return (entry && entry.uri) || null;
}

module.exports = {
  SCOPES,
  getOAuth2Client,
  getBusyIntervals,
  createEvent,
  getEvent,
  deleteEvent,
  extractMeetLink,
};
