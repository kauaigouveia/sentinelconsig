# SENTINEL CONSIG — Deployment Guide (Vercel + GitHub + Neon PostgreSQL)

## 1. Fluxo de CI/CD e Ambientes

```text
[GitHub Repo]
      │ (Push to main / branch)
      ▼
[GitHub Actions: Lint, Typecheck, Test]
      │
      ▼
[Vercel Preview / Production Deployment]
      │
      ▼
[Prisma Migrate Deploy]
      │
      ▼
[Live Serverless Edge / Node Runtime]
```

---

## 2. Configuração na Vercel

1. Conecte o repositório GitHub ao painel da Vercel.
2. Defina o Framework Preset como **Next.js** ou **Vite** (conforme a build do repositório).
3. Configure as variáveis de ambiente em **Project Settings $\rightarrow$ Environment Variables**:
   - `DATABASE_URL`: String de conexão pooling do Neon PostgreSQL.
   - `DIRECT_URL`: String de conexão direta (sem pooling) para migrations do Prisma.
   - `AUTH_SECRET`: Chave secreta de 64 caracteres para assinatura de tokens JWT.
   - `NEXT_PUBLIC_APP_URL`: URL canônica da plataforma em produção.
4. **Build Command**: `npx prisma generate && npm run build`
5. **Output Directory**: `.next` ou `dist`

---

## 3. Ambientes Isolados
- **Production**: Ramo `main` conectado ao banco de dados de produção.
- **Preview / Staging**: Pull Requests conectados a banco de dados isolado (`sentinel_staging`), garantindo que testes destrutivos não afetem dados reais.
- **Development**: Localhost com `.env.local`.
