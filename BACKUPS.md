# SENTINEL CONSIG — Backup, Integrity & Disaster Recovery System

## 1. Arquitetura de Backup Server-Side

O motor de backup opera de forma 100% autônoma, sem qualquer dependência do navegador do usuário, `localStorage` ou operador conectado:

```text
[Cloud Scheduler / Cron] 
       ↓ (A cada 6 horas)
[Backup Worker (Server-Side)] 
       ↓ 
[PostgreSQL Database Query (Filtered by Tenant / Global)] 
       ↓ 
[JSON Serialization + SHA-256 Checksum Calculation] 
       ↓ 
[Gzip Compression + AES-256 Encryption] 
       ↓ 
[External Cloud Storage / Bucket (Versioning WORM)]
```

---

## 2. Tipos de Backup
1. **AUTOMATIC (Periódico)**: Disparado a cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC).
2. **MANUAL (Sob Demanda)**: Acionado pelo PLATFORM_MASTER ou TENANT_ADMIN.
3. **PRE_RESTORE (Segurança)**: Criado automaticamente pelo sistema imediatamente antes de qualquer restauração.
4. **PRE_DELETION (Salvaguarda)**: Criado compulsoriamente antes de qualquer suspensão ou exclusão de tenant.
5. **GLOBAL_SNAPSHOT**: Dump consolidado de toda a base da plataforma.

---

## 3. Validação de Integridade SHA-256
- Toda carga de backup gera um hash SHA-256 de 64 caracteres hexadecimais sobre o payload normalizado.
- **Protocolo de Restauração**:
  1. Leitura do arquivo de backup do storage.
  2. Recálculo do SHA-256 do arquivo.
  3. Comparação com o checksum registrado no catálogo. Se houver divergência de 1 byte $\rightarrow$ **ABORTAR RESTAURAÇÃO IMEDIATAMENTE**.
  4. Criação do snapshot de segurança pré-restauração.
  5. Execução da transação de rollback / restore no PostgreSQL.
  6. Registro no `AuditLog`.

---

## 4. Política de Retenção (Retention Policy)
- Rotação automática mantendo os últimos **30 snapshots** por tenant. Snapshots excedentes são expurgados do storage externo após 30 dias.
