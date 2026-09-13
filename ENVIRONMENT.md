# SENTINEL CONSIG — Environment Variables & Secrets Configuration

## 1. Regras de Ouro
- NUNCA commite valores reais de credenciais ou senhas no GitHub.
- Todas as variáveis devem ser configuradas no painel da Vercel ou no `.env.local` não versionado.

---

## 2. Dicionário de Variáveis (.env.example)

```env
# Banco de Dados PostgreSQL (Neon / Supabase / Cloud SQL)
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/sentinel_prod?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/sentinel_prod?sslmode=require"

# Autenticação & Criptografia
AUTH_SECRET="your-high-entropy-64-char-random-secret-key"
JWT_EXPIRATION="24h"

# Aplicação & Domínios
NEXT_PUBLIC_APP_URL="https://sentinelconsig.com.br"
NEXT_PUBLIC_DEFAULT_TENANT_DOMAIN="sentinelconsig.com.br"

# Storage Externo para Backups & Documentos (AWS S3 / Cloudflare R2 / GCS)
STORAGE_BUCKET_NAME="sentinel-consignado-backups-prod"
STORAGE_REGION="us-east-1"
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""

# Scheduler / Webhook Secret para Backups Automáticos
BACKUP_CRON_SECRET="your-backup-scheduler-token"

# IA & Integrações (Opcional)
GEMINI_API_KEY=""
```
