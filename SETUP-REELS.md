# Setup — Reels automáticos na landing page

## 1. O que colocar onde

Copie estes arquivos para a raiz do repositório `novo-adv`, substituindo os
que já existem:

```
novo-adv/
├── .github/
│   └── workflows/
│       ├── fetch-reels.yml
│       └── refresh-ig-token.yml
├── scripts/
│   ├── fetch-reels.js
│   └── refresh-ig-token.js
├── reels.json          ← novo (começa vazio, o Actions preenche sozinho)
├── script.js            ← substitui o atual (mesmas funções + reels)
└── style.css             ← substitui o atual (mesmo conteúdo + estilos dos reels)
```

O `index.html` não precisa mudar — a seção de reels é montada em tempo de
execução pelo `script.js` e inserida entre "Equipe" e "Contato".

## 2. Secrets do repositório

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Obrigatório | Onde conseguir |
|---|---|---|
| `IG_ACCESS_TOKEN` | Sim | O token de longa duração (60 dias) que você gerou no passo a passo do Meta for Developers |
| `GH_PAT` | Só se quiser a renovação automática | Personal Access Token *fine-grained*, restrito a este repositório, com permissão **Secrets: Read and write** (gera em Settings → Developer settings → Personal access tokens → Fine-grained tokens) |

Se não quiser configurar o `GH_PAT` agora, é só não subir o
`refresh-ig-token.yml` — o `fetch-reels.yml` funciona sozinho até o token
expirar (60 dias), e você renova manualmente repetindo o passo 6 do processo
que já fizemos (trocar o token curto por um de 60 dias).

## 3. Testar

- **Manual pelo GitHub**: aba *Actions* → "Buscar novos Reels do Instagram" →
  *Run workflow*. Confira se o `reels.json` foi atualizado com commit
  automático.
- **Local**: `IG_ACCESS_TOKEN=seu_token node scripts/fetch-reels.js`

## 4. Se o workflow falhar

Abra o log do job na aba *Actions*. Erro com **código 190** = token expirado
ou inválido — rode a renovação (ou gere um novo token seguindo o passo a
passo do Meta for Developers de novo).
