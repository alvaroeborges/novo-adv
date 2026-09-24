// =============================================================================
//  Jonathan & Associados — API de agendamento
//  Express + Google Calendar API + Google Meet
// =============================================================================

require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const validator = require("validator");

const config = require("./availability.config");
const {
  computeAvailability,
  computeMonthAvailability,
  createAppointment,
} = require("./appointments");
const {
  getEvent,
  deleteEvent,
  extractMeetLink,
} = require("./googleCalendar");

const app = express();
app.set("trust proxy", 1); // atrás de proxy (Render/Railway/Nginx) para o rate-limit

// ---- Segurança base -------------------------------------------------------
// CSP desligada aqui porque, quando SERVE_STATIC=true, o mesmo processo serve
// o site (que usa Google Fonts e estilos inline). Em produção o site fica no
// GitHub Pages e esta API responde só JSON.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "12kb" }));

const allowlist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowlist.length ? allowlist : true,
    methods: ["GET", "POST", "DELETE"],
  })
);

// ---- Rate limiting -------------------------------------------------------
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
});

app.use("/api/", readLimiter);

// ---- Rotas --------------------------------------------------------------

// Configuração pública (nada sensível) — o frontend usa para montar a UI.
app.get("/api/config", (req, res) => {
  res.json({
    lawyerName: "Jonathan Rodrigues",
    timezone: config.timezone,
    defaultDuration: config.defaultDurationMin,
    allowedDurations: config.allowedDurationsMin,
    bookingWindowDays: config.bookingWindowDays,
    minNoticeHours: config.minNoticeHours,
  });
});

// GET /api/availability?date=AAAA-MM-DD&duration=30
app.get("/api/availability", async (req, res) => {
  const { date, duration } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "invalid_date" });
  }
  const out = await computeAvailability(date, duration);
  if (out.error === "calendar_unavailable") return res.status(502).json(out);
  if (out.error) return res.status(400).json(out);
  return res.json(out);
});

// GET /api/availability/month?year=2026&month=9&duration=30
app.get("/api/availability/month", async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: "invalid_month" });
  }
  try {
    const out = await computeMonthAvailability(year, month, req.query.duration);
    return res.json(out);
  } catch (e) {
    console.error("[month] erro:", e.message);
    return res.status(502).json({ error: "calendar_unavailable" });
  }
});

// POST /api/appointments
app.post("/api/appointments", writeLimiter, async (req, res) => {
  const b = req.body || {};

  // Honeypot anti-spam: campo escondido que humano não preenche.
  if (b.company) return res.status(200).json({ ok: true, id: "ignored" });

  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim();
  const subject = String(b.subject || "").trim();
  const message = String(b.message || "").trim().slice(0, 2000);
  const date = String(b.date || "").trim();
  const start = String(b.start || "").trim();

  const fields = {};
  if (name.length < 2 || name.length > 120) fields.name = "Informe seu nome completo.";
  if (!validator.isEmail(email)) fields.email = "E-mail inválido.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) fields.phone = "Telefone inválido.";
  if (subject.length < 3 || subject.length > 160) fields.subject = "Descreva o assunto.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fields.date = "Data inválida.";
  if (!/^\d{2}:\d{2}$/.test(start)) fields.start = "Horário inválido.";

  if (Object.keys(fields).length) {
    return res.status(422).json({ error: "validation", fields });
  }

  const out = await createAppointment({
    name,
    email,
    phone,
    subject,
    message,
    date,
    start,
    duration: b.duration,
  });

  if (out.status === 201) return res.status(201).json(out.data);
  return res.status(out.status).json({ error: out.error });
});

// GET /api/appointments/:id
app.get("/api/appointments/:id", async (req, res) => {
  try {
    const ev = await getEvent(process.env.GOOGLE_CALENDAR_ID, req.params.id);
    return res.json({
      id: ev.id,
      status: ev.status,
      summary: ev.summary,
      start: ev.start,
      end: ev.end,
      meetLink: extractMeetLink(ev),
      htmlLink: ev.htmlLink || null,
    });
  } catch (e) {
    return res.status(404).json({ error: "not_found" });
  }
});

// DELETE /api/appointments/:id  (cancelamento — opcional)
app.delete("/api/appointments/:id", writeLimiter, async (req, res) => {
  try {
    await deleteEvent(process.env.GOOGLE_CALENDAR_ID, req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[cancel] erro:", e.message);
    return res.status(400).json({ error: "cancel_failed" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    hasRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    calendarId: process.env.GOOGLE_CALENDAR_ID || null,
    timezone: config.timezone,
  });
});

// ---- Site estático (apenas para testar tudo junto localmente) -----------
if (process.env.SERVE_STATIC !== "false") {
  const root = path.resolve(__dirname, "..");
  app.use(express.static(root, { extensions: ["html"] }));
}

// ---- Tratamento de erros ------------------------------------------------
app.use((err, req, res, _next) => {
  console.error("[erro nao tratado]", err);
  res.status(500).json({ error: "server_error" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`\n  Agendamento no ar:  http://localhost:${port}`);
  console.log(`  Health check:       http://localhost:${port}/api/health`);
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.log(
      "\n  Atenção: GOOGLE_REFRESH_TOKEN ausente. Rode `npm run token`.\n"
    );
  }
});
