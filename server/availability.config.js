// =============================================================================
//  Configuração de disponibilidade do advogado.
//  Este é o único arquivo que precisa ser editado para mudar horários,
//  duração, bloqueios, feriados e limites. Nada aqui é sensível.
// =============================================================================

module.exports = {
  // Fuso usado em TODO o sistema (frontend, backend, Google Calendar e Meet).
  timezone: "America/Sao_Paulo",

  // Duração padrão das reuniões, em minutos.
  defaultDurationMin: 30,

  // Durações que o cliente pode escolher (deixe só [30] para fixar em 30).
  allowedDurationsMin: [15, 30, 45, 60],

  // Intervalo extra entre uma reunião e outra, além da duração (minutos).
  // Ex.: duração 30 + slotIntervalMin 0  => 09:00, 09:30, 10:00...
  //      duração 30 + slotIntervalMin 15 => 09:00, 09:45, 10:30...
  slotIntervalMin: 0,

  // Antecedência mínima para agendar (horas). 24 = não dá para marcar
  // para hoje nem para amanhã cedo.
  minNoticeHours: 24,

  // Quantos dias no futuro a agenda fica aberta.
  bookingWindowDays: 60,

  // Máximo de reuniões por dia. Ao atingir esse número de compromissos
  // dentro do horário de trabalho, o dia deixa de oferecer horários.
  maxBookingsPerDay: 6,

  // Janela(s) de atendimento por dia da semana. Lista vazia = não atende.
  // Pode ter mais de uma janela por dia (ex.: manhã e tarde separadas).
  weekly: {
    sunday: [],
    monday: [{ start: "09:00", end: "18:00" }],
    tuesday: [{ start: "09:00", end: "18:00" }],
    wednesday: [{ start: "09:00", end: "18:00" }],
    thursday: [{ start: "09:00", end: "18:00" }],
    friday: [{ start: "09:00", end: "18:00" }],
    saturday: [],
  },

  // Intervalos bloqueados todo dia (almoço, etc.).
  dailyBreaks: [{ start: "12:00", end: "13:00" }],

  // Datas específicas sem atendimento (formato "AAAA-MM-DD").
  blockedDates: [
    // "2026-09-21",
  ],

  // Feriados nacionais (ajuste conforme o calendário do ano).
  holidays: [
    "2026-01-01", // Confraternização Universal
    "2026-02-16", // Carnaval
    "2026-02-17", // Carnaval
    "2026-02-18", // Quarta-feira de Cinzas (ponto facultativo)
    "2026-04-03", // Sexta-feira Santa
    "2026-04-21", // Tiradentes
    "2026-05-01", // Dia do Trabalho
    "2026-06-04", // Corpus Christi
    "2026-09-07", // Independência
    "2026-10-12", // Nossa Senhora Aparecida
    "2026-11-02", // Finados
    "2026-11-15", // Proclamação da República
    "2026-11-20", // Consciência Negra
    "2026-12-25", // Natal
  ],

  // Períodos de férias / recesso (inclusivos).
  vacations: [
    // { start: "2026-12-21", end: "2027-01-06" },
  ],
};
