# Agendamento de reuniões — Jonathan & Associados

Sistema real de agendamento integrado ao **Google Calendar** e ao **Google
Meet** da conta `rodriguesadvocacia.adv01@gmail.com`.

- **Frontend**: modal montado em runtime pelo `agendamento.js` + `agendamento.css`,
  usando os mesmos design tokens do site. O `index.html` só ganhou os botões
  `data-agendar`, um `<link>` e um `<script>`. Nada foi removido.
- **Backend**: API Node.js/Express em `server/` que fala com a Google Calendar
  API oficial (biblioteca `googleapis`).
- **Sem simulação**: disponibilidade vem do `freebusy` real; o evento é criado
  de verdade; o link do Meet é o que o Google devolve; as confirmações são os
  convites reais do Google Agenda (+ e-mails personalizados opcionais).

---

## Arquitetura

```
Navegador (site em GitHub Pages)
        │  fetch JSON (CORS)
        ▼
API Node.js/Express  (Render / Railway / Fly / VPS)
        │  googleapis + OAuth 2.0 (refresh token da conta principal)
        ▼
Google Calendar API  ─────────────►  Agenda de rodriguesadvocacia.adv01@gmail.com
        │                                     │
        └── conferenceData ──► Google Meet ◄──┘
        └── sendUpdates:all ─► e-mails de convite (cliente + advogado)
```

## Estrutura de arquivos

```
novo adv/
├── index.html               (modificado: botões [data-agendar] + link/script)
├── style.css                (intacto)
├── script.js                (intacto)
├── agendamento.css          (novo — estilos do widget)
├── agendamento.js           (novo — widget/modal, montado em runtime)
├── package.json             (novo)
├── .env.example             (novo)
├── .gitignore               (novo — ignora .env e node_modules)
├── GOOGLE-SETUP.md          (novo — passo a passo do Google Cloud)
├── README-AGENDAMENTO.md    (este arquivo)
└── server/
    ├── server.js              (Express: rotas, CORS, rate limit, estáticos)
    ├── googleCalendar.js      (OAuth2 + freebusy + events.insert/get/delete + Meet)
    ├── appointments.js        (regras de disponibilidade, slots, anti-duplicidade)
    ├── availability.config.js (ÚNICO arquivo a editar p/ horários e regras)
    ├── email.js               (e-mails personalizados via SMTP — opcional)
    └── generate-token.js      (gera o GOOGLE_REFRESH_TOKEN uma vez)
```

## Fluxo do usuário

`Agendar reunião` → calendário → data → horários livres → dados do cliente →
revisão → **Confirmar reunião** → evento no Google Calendar + link do Meet →
tela de sucesso + convites por e-mail para cliente e advogado.

---

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/config` | Config pública (fuso, duração, janela). Nada sensível. |
| `GET` | `/api/availability?date=AAAA-MM-DD&duration=30` | Horários livres de um dia. |
| `GET` | `/api/availability/month?year=2026&month=9&duration=30` | Quais dias do mês têm horário (1 só consulta ao Google). |
| `POST` | `/api/appointments` | Cria o agendamento. Revalida e checa conflito antes de criar. |
| `GET` | `/api/appointments/:id` | Consulta um agendamento (evento do Calendar). |
| `DELETE` | `/api/appointments/:id` | Cancela (opcional). |
| `GET` | `/api/health` | Diagnóstico. |

### `POST /api/appointments` — corpo

```json
{
  "name": "Maria Silva",
  "email": "maria@exemplo.com",
  "phone": "(34) 99999-0000",
  "subject": "Direito de Família",
  "message": "Divórcio consensual.",
  "date": "2026-09-15",
  "start": "09:00",
  "duration": 30
}
```

### Respostas relevantes

| Status | `error` | Significado (mensagem no widget) |
|---|---|---|
| `201` | — | Criado. Retorna `id`, `meetLink`, `htmlLink`, `dateLabel`, etc. |
| `409` | `slot_taken` | "Este horário acabou de ser reservado. Escolha outro." |
| `409` | `slot_not_offered` / `too_soon` | Horário fora das regras — volta para a lista. |
| `422` | `validation` | Campos inválidos (`fields` detalha cada um). |
| `502` | `calendar_unavailable` | "Não foi possível consultar a agenda. Tente novamente." |
| `429` | `rate_limited` | Excesso de tentativas. |

---

## Configurar disponibilidade

Tudo em [`server/availability.config.js`](server/availability.config.js):

- `weekly` — janelas por dia da semana (lista vazia = não atende).
- `defaultDurationMin` / `allowedDurationsMin` — 15, 30, 45, 60.
- `slotIntervalMin` — intervalo extra entre reuniões.
- `minNoticeHours` — antecedência mínima (padrão 24h).
- `bookingWindowDays` — quantos dias à frente a agenda abre (padrão 60).
- `maxBookingsPerDay` — teto de reuniões por dia.
- `dailyBreaks` — almoço etc.
- `blockedDates`, `holidays`, `vacations` — bloqueios pontuais/períodos.
- `timezone` — `America/Sao_Paulo` (usado em frontend, backend, Calendar e Meet).

Não precisa reiniciar nada além do processo Node após editar.

---

## Rodar localmente

```bash
npm install
cp .env.example .env
# preencha GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI  (veja GOOGLE-SETUP.md)
npm run token          # autorize como rodriguesadvocacia.adv01@gmail.com, cole o token no .env
npm start              # http://localhost:3000  (serve o site + a API juntos)
```

Com `SERVE_STATIC=true` (padrão do `.env.example`), o Express serve o
`index.html` e os assets, então dá para testar o fluxo inteiro em
`http://localhost:3000`. Use `npm run dev` para reload automático.

---

## Colocar em produção

### Frontend (continua no GitHub Pages)

1. Faça deploy normal do site estático.
2. Como a API fica em outro domínio, adicione **antes** do
   `<script src="agendamento.js">` no `index.html`:

   ```html
   <script>window.AGENDA_API_BASE = "https://sua-api.onrender.com";</script>
   ```

### Backend (serviço Node — Render / Railway / Fly)

Exemplo com **Render**:

1. New → **Web Service** → conecte o repositório.
2. Build command: `npm install` · Start command: `npm start`.
3. **Environment**: adicione as variáveis do `.env` (menos as de SMTP se não
   for usar). Em especial:
   - `SERVE_STATIC=false`
   - `CORS_ORIGINS=https://SEU-USUARIO.github.io` (ou o domínio final do site)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` — pode manter o de localhost se você já gerou o
     refresh token; ele só é usado no fluxo `npm run token`.
   - `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`
4. Deploy. O Render fornece HTTPS automaticamente.
5. Ajuste `window.AGENDA_API_BASE` no site para a URL do serviço.
6. Publique a tela de consentimento OAuth ("Em produção") para o refresh
   token não expirar em 7 dias — ver `GOOGLE-SETUP.md` §3.

Railway/Fly seguem o mesmo princípio (mesmas env vars, `npm start`).
Em VPS: `pm2 start server/server.js --name agendamento` atrás de Nginx com
`proxy_pass` e certificado (Let's Encrypt).

---

## Segurança

- Credenciais **só** no backend (`.env`, fora do Git via `.gitignore`).
  Nenhum segredo no JavaScript do frontend.
- HTTPS obrigatório em produção (fornecido pelo PaaS ou Nginx+Certbot).
- `helmet`, `cors` com allowlist (`CORS_ORIGINS`), `express-rate-limit`
  (8 POST/hora por IP), honeypot anti-spam, `express.json` com limite de
  tamanho.
- Validação no frontend **e** de novo no backend (`validator` + checagens).
- Escopos OAuth mínimos: `calendar.events` + `calendar.freebusy`.
- **Prevenção de duplicidade**: antes de criar o evento, o backend refaz a
  consulta `freebusy` naquele instante; se o bloco foi ocupado, responde
  `409 slot_taken` e o widget manda escolher outro horário.
- A senha do Gmail **nunca** é usada nem armazenada — só o refresh token OAuth.

---

## E-mails

Por padrão o evento é criado com `sendUpdates: "all"`, então **o próprio
Google Agenda envia** o convite (com o link do Meet) para o cliente e para o
advogado — e-mail real, sem configuração extra.

Se quiser **também** os e-mails com o texto personalizado das seções 15 e 16
do briefing, preencha o bloco SMTP do `.env` (`SMTP_HOST`, `SMTP_USER`,
`SMTP_PASS`, ...). Sem isso, o sistema funciona só com os convites do Google.
