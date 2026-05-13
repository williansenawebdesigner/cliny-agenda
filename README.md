# Cliny Agenda

Gestão de clínica com agendamentos e atendimento por agente de IA no WhatsApp
(via [Evolution API](https://github.com/EvolutionAPI/evolution-api)).

Stack: **React 19 + Vite + Tailwind v4** no front, **Supabase (Auth + PostgreSQL)**
para dados, **Vercel Serverless Functions** (`/api/**`) para a integração com
Evolution API e **Gemini** para o agente de IA.

---

## 1. Setup local

**Pré-requisitos:** Node 20+.

```bash
npm install
cp .env.example .env.local   # preenche os valores (ver seção 3)
npm run dev                  # Vite dev server em http://localhost:3000
```

Para testar as funções `/api/**` localmente como na Vercel:

```bash
npm i -g vercel
vercel link
vercel dev
```

## 2. Deploy na Vercel

1. Importe o repositório na Vercel.
2. **Build & Output**: já configurados via [`vercel.json`](./vercel.json) — não
   é preciso ajustar nada na UI.
3. **Environment Variables**: adicione as variáveis de [`.env.example`](./.env.example).
   Chaves marcadas como secretas (Evolution API key, Gemini, etc.) podem ser
   marcadas como **Sensitive** — funcionam normalmente porque são acessadas
   apenas em runtime nas funções serverless (`process.env.X`).
4. As variáveis `VITE_*` são embutidas no bundle do front em build time.
   Não use *Sensitive* nelas — elas precisam estar disponíveis durante o
   `vite build`.

## 3. Variáveis de ambiente

Veja [`.env.example`](./.env.example). Resumo:

| Variável | Onde | Notas |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser (build) | URL pública do Supabase |
| `VITE_SUPABASE_ANON_KEY` | Browser (build) | Anon Key pública do Supabase |
| `SUPABASE_URL` | Servidor (runtime) | Mesma URL; usada pelas funções `/api/**` |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor (runtime) | Chave Admin para bypass de RLS. *Sensitive* |
| `GEMINI_API_KEY` | Servidor | Pode ser *Sensitive* |
| `EVOLUTION_API_URL` | Servidor | URL da sua instância Evolution |
| `EVOLUTION_GLOBAL_API_KEY` | Servidor | API key global da Evolution. *Sensitive* |
| `EVOLUTION_WEBHOOK_SECRET` | Servidor | Segredo gerado por você. *Sensitive* |
| `PUBLIC_URL` | Servidor | Opcional. Em produção a Vercel preenche `VERCEL_URL` |

## 4. Estrutura

```
api/                       Vercel Serverless Functions
  _lib/                    Helpers compartilhados (supabase, agent, evolution)
  evolution/
    config.ts              GET — status das envs
    instance.ts            POST — cria instância Evolution
    instance/[id]/
      connection.ts        GET — QR / status da conexão
      index.ts             DELETE — desconecta + remove
    message/sendText.ts    POST — envia texto
    webhook.ts             POST — recebe mensagens (auth por secret)
src/                       Front-end (React SPA)
  lib/supabase.ts          Cliente Supabase (lê VITE_SUPABASE_*)
  hooks/useAuth.ts         Hook de autenticação integrada
  components/              Telas (Agenda, Pacientes, WhatsApp, etc.)
vercel.json                Build SPA + rewrites
```

## 5. Fluxo do webhook Evolution

Ao criar uma instância (`POST /api/evolution/instance`), o servidor registra
na Evolution o webhook:

```
{PUBLIC_URL ou VERCEL_URL}/api/evolution/webhook?secret={EVOLUTION_WEBHOOK_SECRET}
```

A função `/api/evolution/webhook` valida o `secret` antes de gravar a mensagem no banco de dados. Defina
`EVOLUTION_WEBHOOK_SECRET` em produção.
