# Configuração do Google (Cloud Console + OAuth + Calendar API)

Faça **tudo logado na conta `rodriguesadvocacia.adv01@gmail.com`** (a conta
principal do escritório). É ela que terá a agenda consultada e os eventos
criados.

---

## 1. Criar o projeto no Google Cloud Console

1. Acesse <https://console.cloud.google.com/>.
2. Barra superior → seletor de projeto → **Novo projeto**.
   - Nome: `Agendamento Jonathan Associados`
   - Criar.
3. Aguarde e selecione o projeto recém-criado.

## 2. Ativar a Google Calendar API

1. Menu → **APIs e serviços → Biblioteca**.
2. Busque **Google Calendar API** → **Ativar**.

> Observação: o host `calendar-json.googleapis.com` que às vezes aparece é
> apenas o _service endpoint_ interno. A forma suportada de usar a API é pela
> biblioteca oficial `googleapis` (Node), que é o que este projeto faz. Não é
> preciso configurar nada com esse host manualmente.

## 3. Tela de consentimento OAuth

1. **APIs e serviços → Tela de permissão OAuth**.
2. Tipo de usuário: **Externo** → Criar.
3. Preencha:
   - Nome do app: `Agendamento — Jonathan & Associados`
   - E-mail de suporte: `rodriguesadvocacia.adv01@gmail.com`
   - E-mail de contato do desenvolvedor: o mesmo.
4. **Escopos**: pode deixar em branco nesta tela (os escopos são pedidos pelo
   código). Se quiser listar, adicione:
   - `.../auth/calendar.events`
   - `.../auth/calendar.freebusy`
5. **Usuários de teste**: adicione `rodriguesadvocacia.adv01@gmail.com`.
6. Salvar.

> Enquanto o app estiver em modo **Teste**, o refresh token expira em 7 dias.
> Para produção, clique em **Publicar app** (status "Em produção"). Com os
> escopos acima (que o Google considera _sensíveis_, não _restritos_), a
> publicação normalmente não exige verificação com vídeo/auditoria para uso
> próprio — mas pode aparecer um aviso de "app não verificado" que você
> aceita manualmente uma vez. O refresh token de um app publicado não expira
> por tempo (só se revogado, senha trocada, ou 6 meses sem uso).

## 4. Criar as credenciais OAuth 2.0

1. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**.
3. Nome: `backend-agendamento`.
4. **URIs de redirecionamento autorizados** → Adicionar:
   - `http://localhost:3000/oauth2callback` (para gerar o token na sua máquina)
   - Em produção, adicione também o callback do servidor real se for usar o
     fluxo por lá, ex.: `https://sua-api.onrender.com/oauth2callback`
5. Criar. Copie **Client ID** e **Client Secret**.

## 5. Preencher o `.env`

```bash
cp .env.example .env
```

Edite:

```env
GOOGLE_CLIENT_ID=<o Client ID copiado>
GOOGLE_CLIENT_SECRET=<o Client Secret copiado>
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_CALENDAR_ID=rodriguesadvocacia.adv01@gmail.com
```

## 6. Autorizar a conta e gerar o Refresh Token

Na raiz do projeto:

```bash
npm install
npm run token
```

1. O terminal mostra um link. Abra no navegador **logado como
   `rodriguesadvocacia.adv01@gmail.com`**.
2. Aceite as permissões (Agenda: ver/editar eventos; ver disponibilidade).
3. Se aparecer "app não verificado": **Avançado → Acessar (não seguro)** —
   é o seu próprio app.
4. Volte ao terminal. Ele imprime:

   ```
   GOOGLE_REFRESH_TOKEN=1//0abc...
   ```

5. Cole essa linha no `.env`.

## 7. Testar

```bash
npm start
```

- <http://localhost:3000/api/health> → `hasRefreshToken: true`
- <http://localhost:3000/api/availability/month?year=2026&month=9> → deve
  retornar os dias com `available: true/false` de acordo com a agenda real.
- Abra <http://localhost:3000> e clique em **Agendar reunião**.

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| `invalid_grant` ao chamar a API | Refresh token expirado (app em modo Teste > 7 dias) ou revogado. Publique o app e rode `npm run token` de novo. |
| `redirect_uri_mismatch` no `npm run token` | O `GOOGLE_REDIRECT_URI` do `.env` não é idêntico ao cadastrado no Console. |
| `npm run token` não mostra `GOOGLE_REFRESH_TOKEN` | O app já tinha sido autorizado. Remova em <https://myaccount.google.com/permissions> e rode de novo. |
| `calendar_unavailable` nas rotas | `GOOGLE_REFRESH_TOKEN` ausente/errado no `.env`, ou a Calendar API não foi ativada. |
| Evento cria mas sem link do Meet | Conta com criação de conferências desativada por política. O convite ainda é enviado; o Meet pode ser adicionado manualmente. |
