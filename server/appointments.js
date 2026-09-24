// =============================================================================
//  Regras de disponibilidade e criação de agendamentos.
//
//  Fluxo:
//    computeAvailability(data)      -> horários livres de UM dia
//    computeMonthAvailability(...)  -> quais dias do mês têm horário (1 chamada)
//    createAppointment(payload)     -> revalida, checa conflito e cria o evento
//
//  Toda conta de tempo é feita no fuso de availability.config (America/Sao_Paulo)
//  usando luxon, para não depender do fuso do servidor.
// =============================================================================

const { DateTime } = require("luxon");
const config = require("./availability.config");
const {
  getBusyIntervals,
  createEvent,
  extractMeetLink,
} = require("./googleCalendar");
const { sendEmails } = require("./email");

// luxon: weekday 1=segunda ... 7=domingo. Índice 0=domingo aqui.
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ZONE = config.timezone;

function weekdayKey(dt) {
  return WEEKDAY_KEYS[dt.weekday % 7];
}

function parseHm(dateISO, hm) {
  const [h, m] = String(hm).split(":").map(Number);
  return DateTime.fromISO(dateISO, { zone: ZONE }).set({
    hour: h,
    minute: m,
    second: 0,
    millisecond: 0,
  });
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isBlockedDate(dateISO) {
  if ((config.blockedDates || []).includes(dateISO)) return true;
  if ((config.holidays || []).includes(dateISO)) return true;
  for (const v of config.vacations || []) {
    if (dateISO >= v.start && dateISO <= v.end) return true;
  }
  return false;
}

function resolveDuration(requested) {
  const d = Number(requested);
  return config.allowedDurationsMin.includes(d) ? d : config.defaultDurationMin;
}

/**
 * Gera os horários teóricos de um dia (sem consultar o Google), já filtrando
 * pausas diárias e antecedência mínima.
 * @returns {{reason:string|null, candidates:Array, windows:Array}}
 */
function buildCandidates(dateISO, durationMin, now) {
  const day = DateTime.fromISO(dateISO, { zone: ZONE });

  if (isBlockedDate(dateISO)) return { reason: "blocked", candidates: [], windows: [] };

  const windows = config.weekly[weekdayKey(day)] || [];
  if (!windows.length) return { reason: "closed", candidates: [], windows: [] };

  const step = durationMin + (config.slotIntervalMin || 0);
  const breaks = (config.dailyBreaks || []).map((br) => ({
    start: parseHm(dateISO, br.start),
    end: parseHm(dateISO, br.end),
  }));

  const candidates = [];
  for (const w of windows) {
    let cursor = parseHm(dateISO, w.start);
    const windowEnd = parseHm(dateISO, w.end);

    while (cursor.plus({ minutes: durationMin }) <= windowEnd) {
      const slotStart = cursor;
      const slotEnd = cursor.plus({ minutes: durationMin });

      const inBreak = breaks.some((b) =>
        overlaps(slotStart, slotEnd, b.start, b.end)
      );
      const tooSoon = slotStart < now.plus({ hours: config.minNoticeHours });

      if (!inBreak && !tooSoon) candidates.push({ start: slotStart, end: slotEnd });
      cursor = cursor.plus({ minutes: step });
    }
  }

  return {
    reason: candidates.length ? null : "no_slots",
    candidates,
    windows,
  };
}

function countBookingsInWindow(dayBusy, dateISO, windows) {
  if (!windows.length) return 0;
  const workStart = parseHm(dateISO, windows[0].start);
  const workEnd = parseHm(dateISO, windows[windows.length - 1].end);
  return dayBusy.filter((b) => overlaps(b.start, b.end, workStart, workEnd)).length;
}

/** Disponibilidade de um dia. Consulta o Google Calendar real. */
async function computeAvailability(dateISO, durationRequested) {
  const duration = resolveDuration(durationRequested);
  const now = DateTime.now().setZone(ZONE);
  const day = DateTime.fromISO(dateISO, { zone: ZONE });

  const result = {
    date: dateISO,
    timezone: ZONE,
    duration,
    slots: [],
    reason: null,
  };

  if (!day.isValid) return { error: "invalid_date" };
  if (day.startOf("day") < now.startOf("day")) {
    result.reason = "past";
    return result;
  }
  const maxDay = now.plus({ days: config.bookingWindowDays }).endOf("day");
  if (day.startOf("day") > maxDay) {
    result.reason = "out_of_window";
    return result;
  }

  const { reason, candidates, windows } = buildCandidates(dateISO, duration, now);
  if (reason === "blocked" || reason === "closed") {
    result.reason = reason;
    return result;
  }
  if (!candidates.length) {
    result.reason = "no_slots";
    return result;
  }

  let busy;
  try {
    busy = await getBusyIntervals(
      day.startOf("day").toISO(),
      day.endOf("day").toISO(),
      process.env.GOOGLE_CALENDAR_ID,
      ZONE
    );
  } catch (e) {
    console.error("[availability] freebusy falhou:", e.message);
    return { error: "calendar_unavailable" };
  }

  const busyIv = busy.map((b) => ({
    start: DateTime.fromISO(b.start),
    end: DateTime.fromISO(b.end),
  }));

  if (
    config.maxBookingsPerDay &&
    countBookingsInWindow(busyIv, dateISO, windows) >= config.maxBookingsPerDay
  ) {
    result.reason = "day_full";
    return result;
  }

  const free = candidates.filter(
    (c) => !busyIv.some((b) => overlaps(c.start, c.end, b.start, b.end))
  );

  result.slots = free.map((s) => ({
    start: s.start.toFormat("HH:mm"),
    end: s.end.toFormat("HH:mm"),
    startISO: s.start.toISO(),
    endISO: s.end.toISO(),
  }));
  if (!result.slots.length) result.reason = "no_slots";
  return result;
}

/**
 * Disponibilidade do mês inteiro com UMA única consulta freebusy.
 * Retorna { days: { "AAAA-MM-DD": { available, reason, past, count } } }.
 */
async function computeMonthAvailability(year, month, durationRequested) {
  const duration = resolveDuration(durationRequested);
  const now = DateTime.now().setZone(ZONE);
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone: ZONE });
  if (!first.isValid) throw new Error("invalid_month");

  const daysInMonth = first.daysInMonth;
  const last = first.set({ day: daysInMonth });
  const maxDay = now.plus({ days: config.bookingWindowDays }).endOf("day");

  const busy = await getBusyIntervals(
    first.startOf("day").toISO(),
    last.endOf("day").toISO(),
    process.env.GOOGLE_CALENDAR_ID,
    ZONE
  );
  const busyIv = busy.map((b) => ({
    start: DateTime.fromISO(b.start),
    end: DateTime.fromISO(b.end),
  }));

  const days = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const day = first.set({ day: d });
    const dateISO = day.toFormat("yyyy-MM-dd");
    const entry = { available: false, reason: null, past: false, count: 0 };

    if (day.startOf("day") < now.startOf("day")) {
      entry.past = true;
      entry.reason = "past";
      days[dateISO] = entry;
      continue;
    }
    if (day.startOf("day") > maxDay) {
      entry.reason = "out_of_window";
      days[dateISO] = entry;
      continue;
    }

    const { reason, candidates, windows } = buildCandidates(dateISO, duration, now);
    if (reason === "blocked" || reason === "closed") {
      entry.reason = reason;
      days[dateISO] = entry;
      continue;
    }

    const dayBusy = busyIv.filter(
      (b) => b.end > day.startOf("day") && b.start < day.endOf("day")
    );

    if (
      config.maxBookingsPerDay &&
      countBookingsInWindow(dayBusy, dateISO, windows) >= config.maxBookingsPerDay
    ) {
      entry.reason = "day_full";
      days[dateISO] = entry;
      continue;
    }

    const free = candidates.filter(
      (c) => !dayBusy.some((b) => overlaps(c.start, c.end, b.start, b.end))
    );
    entry.count = free.length;
    entry.available = free.length > 0;
    if (!entry.available && !entry.reason) entry.reason = "no_slots";
    days[dateISO] = entry;
  }

  return { year, month, timezone: ZONE, duration, days };
}

/**
 * Cria o agendamento. Revalida tudo no servidor (briefing seções 11 e 17):
 *  - campos obrigatórios já validados na rota
 *  - horário precisa estar entre os oferecidos para aquela data/duração
 *  - PREVENÇÃO DE DUPLICIDADE: consulta o Google Calendar de novo, agora,
 *    e recusa se o bloco tiver sido ocupado nesse meio-tempo.
 * @returns {{status:number, data?:object, error?:string}}
 */
async function createAppointment(payload) {
  const { name, email, phone, subject, message, date, start } = payload;
  const duration = resolveDuration(payload.duration);
  const now = DateTime.now().setZone(ZONE);

  const slotStart = parseHm(date, start);
  if (!slotStart.isValid) return { status: 400, error: "invalid_slot" };
  const slotEnd = slotStart.plus({ minutes: duration });

  if (slotStart < now.plus({ hours: config.minNoticeHours })) {
    return { status: 409, error: "too_soon" };
  }

  const { candidates } = buildCandidates(date, duration, now);
  const isOffered = candidates.some(
    (c) => c.start.toMillis() === slotStart.toMillis()
  );
  if (!isOffered) return { status: 409, error: "slot_not_offered" };

  // ---- Prevenção de duplicidade: recheca a agenda AGORA --------------------
  let busy;
  try {
    busy = await getBusyIntervals(
      slotStart.startOf("day").toISO(),
      slotStart.endOf("day").toISO(),
      process.env.GOOGLE_CALENDAR_ID,
      ZONE
    );
  } catch (e) {
    console.error("[appointment] freebusy falhou:", e.message);
    return { status: 502, error: "calendar_unavailable" };
  }
  const clash = busy.some((b) =>
    overlaps(
      slotStart,
      slotEnd,
      DateTime.fromISO(b.start),
      DateTime.fromISO(b.end)
    )
  );
  if (clash) return { status: 409, error: "slot_taken" };

  // ---- Cria o evento real + Google Meet -----------------------------------
  const summary = `Reunião com ${name}`;
  const description = [
    `Cliente: ${name}`,
    `E-mail: ${email}`,
    `Telefone: ${phone}`,
    `Assunto: ${subject}`,
    "",
    "Mensagem:",
    message || "(sem mensagem)",
    "",
    "— Agendado pelo site jonathanassociados.adv.br",
  ].join("\n");

  let event;
  try {
    event = await createEvent({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      summary,
      description,
      startISO: slotStart.toISO(),
      endISO: slotEnd.toISO(),
      timezone: ZONE,
      attendeeEmail: email,
      attendeeName: name,
    });
  } catch (e) {
    console.error("[appointment] events.insert falhou:", e.message);
    return { status: 502, error: "event_create_failed" };
  }

  const meetLink = extractMeetLink(event);
  const dateLabel = slotStart
    .setLocale("pt-BR")
    .toFormat("cccc, d 'de' LLLL 'de' yyyy");
  const timeLabel = slotStart.toFormat("HH:mm");

  // E-mails personalizados (não bloqueiam a resposta se falharem)
  try {
    await sendEmails({
      name,
      email,
      phone,
      subject,
      message,
      dateLabel,
      timeLabel,
      durationMin: duration,
      meetLink,
      timezone: ZONE,
    });
  } catch (e) {
    console.warn("[appointment] e-mail personalizado falhou:", e.message);
  }

  return {
    status: 201,
    data: {
      id: event.id,
      status: event.status,
      summary,
      date,
      start: timeLabel,
      end: slotEnd.toFormat("HH:mm"),
      startISO: slotStart.toISO(),
      endISO: slotEnd.toISO(),
      duration,
      timezone: ZONE,
      dateLabel,
      meetLink,
      htmlLink: event.htmlLink || null,
      client: { name, email, phone, subject },
    },
  };
}

module.exports = {
  computeAvailability,
  computeMonthAvailability,
  createAppointment,
};
