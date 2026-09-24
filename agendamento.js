// =============================================================================
//  Agendamento de reuniões — frontend do widget
//
//  - O modal é montado em runtime (o index.html não é tocado além dos botões
//    [data-agendar] e das tags <link>/<script>), no mesmo espírito da seção
//    de reels.
//  - Toda a disponibilidade e a criação do evento vêm do backend real
//    (Google Calendar + Meet). Nada é simulado aqui.
//
//  Config de ambiente:
//    Se o site (GitHub Pages) e a API rodam em domínios diferentes, defina
//    ANTES deste script:  <script>window.AGENDA_API_BASE = "https://api...";</script>
//    Em desenvolvimento (tudo no mesmo Node), deixe vazio.
// =============================================================================

(function () {
  "use strict";

  var API_BASE = String(window.AGENDA_API_BASE || "").replace(/\/+$/, "");
  var TZ = "America/Sao_Paulo";
  var DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var STEP_LABELS = ["Data", "Horário", "Dados", "Revisão"];

  var REASON_TEXT = {
    past: "Data já passou.",
    closed: "Sem atendimento neste dia.",
    blocked: "Feriado ou data bloqueada.",
    holiday: "Feriado.",
    out_of_window: "Fora do período aberto para agendamento.",
    day_full: "Todos os horários deste dia já foram reservados.",
    no_slots: "Não há horários disponíveis nesta data. Escolha outro dia.",
  };

  var state = {
    built: false,
    config: null,
    viewYear: 0,
    viewMonth: 0, // 1-12
    monthCache: {}, // "y-m" -> days map
    monthPending: {}, // "y-m" -> true enquanto busca
    selectedDate: null, // "AAAA-MM-DD"
    dateLabel: "",
    slots: [],
    selectedSlot: null, // { start, end }
    duration: 30,
    step: 1,
    submitting: false,
    lastFocus: null,
  };

  var el = {}; // referências de nós montados

  // ---- utilidades ---------------------------------------------------------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function spTodayISO() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  }

  function isoToLabel(iso) {
    var parts = iso.split("-");
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12));
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }

  function monthLabel(y, m) {
    var d = new Date(Date.UTC(y, m - 1, 1, 12));
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }

  function api(path, opts) {
    return fetch(API_BASE + path, opts).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
    });
  }

  // ---- construção do modal --------------------------------------------

  function build() {
    if (state.built) return;

    var overlay = document.createElement("div");
    overlay.className = "agenda-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "agendaTitle");
    overlay.hidden = true;

    overlay.innerHTML = [
      '<div class="agenda-modal" role="document">',
      '  <div class="agenda-modal__accent"></div>',
      '  <div class="agenda-modal__head">',
      '    <div class="agenda-modal__bar">',
      "      <div>",
      '        <p class="agenda-modal__eyebrow">Agendar reunião</p>',
      '        <h2 class="agenda-modal__title" id="agendaTitle">Escolha a melhor data</h2>',
      "      </div>",
      '      <button type="button" class="agenda-close" data-agenda-close aria-label="Fechar">',
      '        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      "      </button>",
      "    </div>",
      '    <div class="agenda-progress" data-agenda-progress></div>',
      "  </div>",
      '  <div class="agenda-body" data-agenda-body></div>',
      '  <div class="agenda-actions">',
      '    <button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-back hidden>Voltar</button>',
      '    <button type="button" class="agenda-btn agenda-btn--primary" data-agenda-next disabled>Continuar</button>',
      "  </div>",
      "</div>",
    ].join("");

    document.body.appendChild(overlay);

    el.overlay = overlay;
    el.modal = overlay.querySelector(".agenda-modal");
    el.title = overlay.querySelector("#agendaTitle");
    el.progress = overlay.querySelector("[data-agenda-progress]");
    el.body = overlay.querySelector("[data-agenda-body]");
    el.back = overlay.querySelector("[data-agenda-back]");
    el.next = overlay.querySelector("[data-agenda-next]");

    el.progress.innerHTML = STEP_LABELS.map(function (label, i) {
      return (
        '<span class="agenda-progress__step" title="' +
        label +
        '" data-step="' +
        (i + 1) +
        '"></span>'
      );
    }).join("");

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-agenda-close]")) close();
    });
    el.back.addEventListener("click", goBack);
    el.next.addEventListener("click", goNext);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) close();
      if (e.key === "Tab" && !overlay.hidden) trapFocus(e);
    });

    state.built = true;
  }

  function trapFocus(e) {
    var focusables = el.overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    var list = Array.prototype.filter.call(focusables, function (n) {
      return !n.disabled && n.offsetParent !== null;
    });
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ---- abrir / fechar -------------------------------------------------

  function open() {
    build();
    state.lastFocus = document.activeElement;
    resetFlow();
    el.overlay.hidden = false;
    document.body.classList.add("agenda-lock");
    requestAnimationFrame(function () {
      el.overlay.classList.add("is-open");
    });
    el.overlay.querySelector("[data-agenda-close]").focus();
    loadConfig();
  }

  function close() {
    el.overlay.classList.remove("is-open");
    document.body.classList.remove("agenda-lock");
    setTimeout(function () {
      el.overlay.hidden = true;
    }, 260);
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function resetFlow() {
    var today = spTodayISO().split("-");
    state.viewYear = +today[0];
    state.viewMonth = +today[1];
    state.monthCache = {}; // agenda pode ter mudado desde a última abertura
    state.monthPending = {};
    state.selectedDate = null;
    state.selectedSlot = null;
    state.slots = [];
    state.step = 1;
    state.submitting = false;
    render();
  }

  // ---- config -------------------------------------------------------

  function loadConfig() {
    if (state.config) {
      state.duration = state.config.defaultDuration;
      renderCalendar();
      return;
    }
    api("/api/config", {})
      .then(function (res) {
        if (res.ok) {
          state.config = res.body;
          state.duration = res.body.defaultDuration || 30;
        }
      })
      .catch(function () {})
      .then(function () {
        renderCalendar();
      });
  }

  // ---- render por passo -------------------------------------------

  function render() {
    // progresso
    Array.prototype.forEach.call(
      el.progress.children,
      function (node, i) {
        node.classList.toggle("is-active", i + 1 === state.step);
        node.classList.toggle("is-done", i + 1 < state.step);
      }
    );

    var titles = {
      1: "Escolha a melhor data",
      2: "Escolha um horário",
      3: "Seus dados",
      4: "Confirme sua reunião",
      5: "Reunião agendada",
    };
    el.title.textContent = titles[state.step];

    el.back.hidden = state.step === 1 || state.step === 5;
    el.next.hidden = state.step === 5;
    el.back.parentElement.style.display =
      state.step === 1 || state.step === 5 ? "none" : "";

    if (state.step === 1) {
      el.next.hidden = true; // avança ao clicar num dia
      renderCalendar();
    } else if (state.step === 2) {
      el.next.textContent = "Continuar";
      el.next.disabled = !state.selectedSlot;
      renderSlots();
    } else if (state.step === 3) {
      el.next.textContent = "Revisar";
      el.next.disabled = false;
      renderForm();
    } else if (state.step === 4) {
      el.next.textContent = state.submitting ? "Confirmando…" : "Confirmar reunião";
      el.next.disabled = state.submitting;
      renderReview();
    }
  }

  function goBack() {
    if (state.step === 2) {
      state.step = 1;
    } else if (state.step === 3) {
      state.step = 2;
    } else if (state.step === 4) {
      state.step = 3;
    }
    render();
  }

  function goNext() {
    if (state.step === 2 && state.selectedSlot) {
      state.step = 3;
      render();
    } else if (state.step === 3) {
      if (collectForm()) {
        state.step = 4;
        render();
      }
    } else if (state.step === 4) {
      submit();
    }
  }

  // ---- passo 1: calendário --------------------------------------

  function renderCalendar() {
    var y = state.viewYear;
    var m = state.viewMonth;
    var todayISO = spTodayISO();
    var curKey = todayISO.slice(0, 7); // "AAAA-MM"
    var viewKey = y + "-" + pad(m);

    // limite de meses à frente
    var windowDays = (state.config && state.config.bookingWindowDays) || 60;
    var limit = new Date(Date.UTC(+todayISO.slice(0, 4), +todayISO.slice(5, 7) - 1, +todayISO.slice(8, 10)));
    limit.setUTCDate(limit.getUTCDate() + windowDays);
    var limitKey =
      limit.getUTCFullYear() + "-" + pad(limit.getUTCMonth() + 1);

    var firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    var html = [
      '<p class="agenda-step__hint">Horário de Brasília. Reuniões de ' +
        state.duration +
        " minutos.</p>",
      '<div class="agenda-cal">',
      '  <div class="agenda-cal__head">',
      '    <button type="button" class="agenda-cal__nav" data-cal-prev aria-label="Mês anterior"' +
        (viewKey <= curKey ? " disabled" : "") +
        ">‹</button>",
      '    <span class="agenda-cal__month">' + capitalize(monthLabel(y, m)) + "</span>",
      '    <button type="button" class="agenda-cal__nav" data-cal-next aria-label="Próximo mês"' +
        (viewKey >= limitKey ? " disabled" : "") +
        ">›</button>",
      "  </div>",
      '  <div class="agenda-cal__grid">',
      DOW.map(function (d) {
        return '<span class="agenda-cal__dow">' + d + "</span>";
      }).join(""),
    ];

    for (var i = 0; i < firstDow; i++) {
      html.push('<span class="agenda-day is-empty"></span>');
    }

    var days = state.monthCache[viewKey] || null;

    for (var d = 1; d <= daysInMonth; d++) {
      var iso = y + "-" + pad(m) + "-" + pad(d);
      var cls = ["agenda-day"];
      var info = days && days[iso];
      var clickable = false;

      if (iso === todayISO) cls.push("is-today");

      if (iso < todayISO) {
        cls.push("is-past");
      } else if (!days) {
        cls.push("is-loading");
      } else if (!info) {
        cls.push("is-noslots");
      } else if (info.past) {
        cls.push("is-past");
      } else if (info.reason === "blocked" || info.reason === "holiday") {
        cls.push("is-holiday");
      } else if (info.available) {
        cls.push("is-available");
        clickable = true;
      } else {
        cls.push("is-noslots");
      }

      if (state.selectedDate === iso) cls.push("is-selected");

      html.push(
        '<button type="button" class="' +
          cls.join(" ") +
          '"' +
          (clickable ? "" : " disabled") +
          ' data-date="' +
          iso +
          '">' +
          d +
          "</button>"
      );
    }

    html.push("  </div>");
    html.push(
      '  <div class="agenda-cal__legend">',
      '    <span><i class="lg-free"></i>Disponível</span>',
      '    <span><i class="lg-sel"></i>Selecionado</span>',
      '    <span><i class="lg-off"></i>Sem horários / feriado</span>',
      "  </div>"
    );
    html.push("</div>");

    setBody(html.join(""));

    el.body.querySelector("[data-cal-prev]").addEventListener("click", function () {
      shiftMonth(-1);
    });
    el.body.querySelector("[data-cal-next]").addEventListener("click", function () {
      shiftMonth(1);
    });
    Array.prototype.forEach.call(
      el.body.querySelectorAll(".agenda-day.is-available"),
      function (node) {
        node.addEventListener("click", function () {
          selectDate(node.getAttribute("data-date"));
        });
      }
    );

    if (!days) fetchMonth(y, m);
  }

  function shiftMonth(delta) {
    var m = state.viewMonth + delta;
    var y = state.viewYear;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    state.viewYear = y;
    state.viewMonth = m;
    renderCalendar();
  }

  function fetchMonth(y, m) {
    var key = y + "-" + pad(m);
    if (state.monthPending[key]) return;
    state.monthPending[key] = true;
    api(
      "/api/availability/month?year=" +
        y +
        "&month=" +
        m +
        "&duration=" +
        state.duration,
      {}
    )
      .then(function (res) {
        if (res.ok && res.body.days) {
          state.monthCache[key] = res.body.days;
        } else {
          state.monthCache[key] = {}; // evita loop; mostra tudo indisponível
        }
      })
      .catch(function () {
        state.monthCache[key] = {};
      })
      .then(function () {
        state.monthPending[key] = false;
        if (state.step === 1 && y === state.viewYear && m === state.viewMonth) {
          renderCalendar();
        }
      });
  }

  function selectDate(iso) {
    state.selectedDate = iso;
    state.dateLabel = isoToLabel(iso);
    state.selectedSlot = null;
    state.step = 2;
    render();
  }

  // ---- passo 2: horários --------------------------------------

  function renderSlots() {
    setBody(
      '<p class="agenda-step__hint">' +
        capitalize(state.dateLabel) +
        "</p>" +
        '<div class="agenda-note"><div class="agenda-spinner"></div>Consultando horários disponíveis…</div>'
    );

    api(
      "/api/availability?date=" +
        state.selectedDate +
        "&duration=" +
        state.duration,
      {}
    )
      .then(function (res) {
        if (state.step !== 2) return;
        if (res.status === 502 || (res.body && res.body.error === "calendar_unavailable")) {
          slotsNote(
            "Não foi possível consultar a agenda. Tente novamente.",
            true,
            true
          );
          return;
        }
        if (!res.ok || !res.body.slots) {
          var reason = (res.body && res.body.reason) || "no_slots";
          slotsNote(REASON_TEXT[reason] || REASON_TEXT.no_slots, false);
          return;
        }
        state.slots = res.body.slots;
        state.duration = res.body.duration || state.duration;
        if (!state.slots.length) {
          slotsNote(
            REASON_TEXT[res.body.reason] || REASON_TEXT.no_slots,
            false
          );
          return;
        }
        paintSlots();
      })
      .catch(function () {
        if (state.step === 2)
          slotsNote("Não foi possível consultar a agenda. Tente novamente.", true, true);
      });
  }

  function slotsNote(msg, isError, retry) {
    var html =
      '<p class="agenda-step__hint">' +
      capitalize(state.dateLabel) +
      "</p>" +
      '<div class="agenda-note' +
      (isError ? " agenda-note--error" : "") +
      '">' +
      msg +
      "</div>";
    if (retry) {
      html +=
        '<div style="text-align:center"><button type="button" class="agenda-btn agenda-btn--ghost" data-retry>Tentar novamente</button></div>';
    }
    setBody(html);
    var r = el.body.querySelector("[data-retry]");
    if (r) r.addEventListener("click", renderSlots);
    el.next.disabled = true;
  }

  function paintSlots() {
    var html =
      '<p class="agenda-step__hint">' +
      capitalize(state.dateLabel) +
      " · escolha um horário</p>" +
      '<div class="agenda-slots">' +
      state.slots
        .map(function (s) {
          var sel =
            state.selectedSlot && state.selectedSlot.start === s.start
              ? " is-selected"
              : "";
          return (
            '<button type="button" class="agenda-slot' +
            sel +
            '" data-slot="' +
            s.start +
            '">' +
            s.start +
            "</button>"
          );
        })
        .join("") +
      "</div>";
    setBody(html);

    Array.prototype.forEach.call(
      el.body.querySelectorAll(".agenda-slot"),
      function (node) {
        node.addEventListener("click", function () {
          var start = node.getAttribute("data-slot");
          state.selectedSlot =
            state.slots.filter(function (s) {
              return s.start === start;
            })[0] || null;
          paintSlots();
          el.next.disabled = !state.selectedSlot;
        });
      }
    );
    el.next.disabled = !state.selectedSlot;
  }

  // ---- passo 3: formulário -----------------------------------

  function renderForm() {
    var f = state.form || {};
    var areas = [
      "Direito de Família",
      "Direito Empresarial",
      "Direito Tributário",
      "Direito Trabalhista",
      "Direito Imobiliário",
      "Outro assunto",
    ];
    setBody(
      [
        '<form class="agenda-form" data-agenda-form novalidate>',
        field("name", "Nome completo", "text", f.name, true),
        field("email", "E-mail", "email", f.email, true),
        field("phone", "Telefone / WhatsApp", "tel", f.phone, true),
        '  <div class="agenda-field" data-field="subject">',
        '    <label for="ag-subject">Assunto da consulta <span class="req">*</span></label>',
        '    <select id="ag-subject" name="subject">' +
          areas
            .map(function (a) {
              return (
                '<option value="' +
                a +
                '"' +
                (f.subject === a ? " selected" : "") +
                ">" +
                a +
                "</option>"
              );
            })
            .join("") +
          "</select>",
        '    <span class="agenda-field__error"></span>',
        "  </div>",
        '  <div class="agenda-field" data-field="message">',
        '    <label for="ag-message">Mensagem</label>',
        '    <textarea id="ag-message" name="message" maxlength="2000" placeholder="Conte rapidamente o contexto (opcional).">' +
          (f.message || "") +
          "</textarea>",
        '    <span class="agenda-field__error"></span>',
        "  </div>",
        '  <div class="agenda-hp"><label>Não preencha<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>',
        "</form>",
      ].join("")
    );

    el.body
      .querySelector("[data-agenda-form]")
      .addEventListener("submit", function (e) {
        e.preventDefault();
        goNext();
      });
  }

  function field(name, label, type, value, required) {
    return [
      '  <div class="agenda-field" data-field="' + name + '">',
      '    <label for="ag-' +
        name +
        '">' +
        label +
        (required ? ' <span class="req">*</span>' : "") +
        "</label>",
      '    <input id="ag-' +
        name +
        '" name="' +
        name +
        '" type="' +
        type +
        '" value="' +
        (value ? String(value).replace(/"/g, "&quot;") : "") +
        '" autocomplete="' +
        (name === "name"
          ? "name"
          : name === "email"
          ? "email"
          : name === "phone"
          ? "tel"
          : "off") +
        '">',
      '    <span class="agenda-field__error"></span>',
      "  </div>",
    ].join("");
  }

  function collectForm() {
    var form = el.body.querySelector("[data-agenda-form]");
    if (!form) return false;
    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      subject: form.subject.value,
      message: form.message.value.trim(),
      company: form.company.value, // honeypot
    };
    var errors = {};
    if (data.name.length < 2) errors.name = "Informe seu nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.email = "E-mail inválido.";
    var digits = data.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15)
      errors.phone = "Telefone com DDD, por favor.";
    if (!data.subject) errors.subject = "Selecione o assunto.";

    Array.prototype.forEach.call(
      form.querySelectorAll(".agenda-field"),
      function (node) {
        var key = node.getAttribute("data-field");
        var msg = errors[key] || "";
        node.classList.toggle("has-error", Boolean(msg));
        node.querySelector(".agenda-field__error").textContent = msg;
      }
    );

    if (Object.keys(errors).length) {
      var firstErr = form.querySelector(".has-error input, .has-error select");
      if (firstErr) firstErr.focus();
      return false;
    }
    state.form = data;
    return true;
  }

  // ---- passo 4: revisão -------------------------------------

  function renderReview() {
    var f = state.form || {};
    var rows = [
      ["Advogado", (state.config && state.config.lawyerName) || "Jonathan Rodrigues"],
      ["Data", capitalize(state.dateLabel)],
      [
        "Horário",
        state.selectedSlot.start +
          " – " +
          state.selectedSlot.end +
          " (horário de Brasília)",
      ],
      ["Duração", state.duration + " minutos"],
      ["Cliente", f.name],
      ["E-mail", f.email],
      ["Telefone", f.phone],
      ["Assunto", f.subject],
    ];
    if (f.message) rows.push(["Mensagem", f.message]);

    setBody(
      '<dl class="agenda-review">' +
        rows
          .map(function (r) {
            return (
              '<div class="agenda-review__row"><dt>' +
              r[0] +
              "</dt><dd>" +
              escapeHtml(r[1]) +
              "</dd></div>"
            );
          })
          .join("") +
        "</dl>" +
        '<p class="agenda-field__error" data-submit-error style="margin-top:.8rem"></p>'
    );
  }

  // ---- envio ----------------------------------------------

  function submit() {
    if (state.submitting) return;
    state.submitting = true;
    render();

    var payload = {
      name: state.form.name,
      email: state.form.email,
      phone: state.form.phone,
      subject: state.form.subject,
      message: state.form.message,
      company: state.form.company,
      date: state.selectedDate,
      start: state.selectedSlot.start,
      duration: state.duration,
    };

    api("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        state.submitting = false;

        if (res.status === 201) {
          state.result = res.body;
          state.step = 5;
          render();
          renderSuccess();
          return;
        }

        var err = (res.body && res.body.error) || "server_error";

        if (err === "slot_taken" || err === "slot_not_offered" || err === "too_soon") {
          state.selectedSlot = null;
          state.step = 2;
          render();
          slotsNote(
            "Este horário acabou de ser reservado. Por favor, escolha outro horário.",
            true
          );
          return;
        }

        if (err === "validation") {
          state.step = 3;
          render();
          var form = el.body.querySelector("[data-agenda-form]");
          var fields = (res.body && res.body.fields) || {};
          Object.keys(fields).forEach(function (k) {
            var node = form && form.querySelector('[data-field="' + k + '"]');
            if (node) {
              node.classList.add("has-error");
              node.querySelector(".agenda-field__error").textContent = fields[k];
            }
          });
          return;
        }

        if (err === "calendar_unavailable" || err === "event_create_failed") {
          submitError(
            "Não foi possível concluir o agendamento agora. Tente de novo em instantes."
          );
          return;
        }
        if (err === "rate_limited") {
          submitError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
          return;
        }
        submitError("Algo deu errado. Tente novamente.");
      })
      .catch(function () {
        state.submitting = false;
        render();
        submitError("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
      });
  }

  function submitError(msg) {
    render();
    var node = el.body.querySelector("[data-submit-error]");
    if (node) node.textContent = msg;
  }

  // ---- passo 5: sucesso ---------------------------------

  function renderSuccess() {
    var r = state.result || {};
    var meet = r.meetLink;
    var html = [
      '<div class="agenda-success">',
      '  <div class="agenda-success__check">✓</div>',
      '  <p class="agenda-success__title">Reunião agendada com sucesso!</p>',
      '  <p class="agenda-success__meta">' + capitalize(r.dateLabel || state.dateLabel) + "</p>",
      '  <p class="agenda-success__meta">Horário: ' +
        (r.start || state.selectedSlot.start) +
        " (horário de Brasília)</p>",
      '  <p class="agenda-success__meta">Duração: ' + (r.duration || state.duration) + " minutos</p>",
      '  <div class="agenda-success__actions">',
      meet
        ? '    <a class="agenda-btn agenda-btn--primary" href="' +
          escapeHtml(meet) +
          '" target="_blank" rel="noopener">Entrar na reunião (Meet)</a>'
        : '    <p class="agenda-success__meta">O link do Google Meet chegará no convite por e-mail.</p>',
      r.htmlLink
        ? '    <a class="agenda-btn agenda-btn--ghost" href="' +
          escapeHtml(r.htmlLink) +
          '" target="_blank" rel="noopener">Ver no Google Agenda</a>'
        : "",
      '    <button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-close>Fechar</button>',
      "  </div>",
      '  <p class="agenda-success__meta" style="margin-top:1rem">Enviamos a confirmação para <strong>' +
        escapeHtml(state.form.email) +
        "</strong>.</p>",
      "</div>",
    ].join("");
    setBody(html);
  }

  // ---- helpers de render ------------------------------

  function setBody(html) {
    el.body.innerHTML = '<div class="agenda-step is-current">' + html + "</div>";
  }

  function capitalize(s) {
    s = s || "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  // ---- ligação com os botões do site --------------------

  function wireTriggers() {
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-agendar]");
      if (!trigger) return;
      e.preventDefault();
      open();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireTriggers);
  } else {
    wireTriggers();
  }

  // expõe para uso externo se necessário
  window.Agendamento = { open: open, close: close };
})();
