# SENTINEL CONSIG — Zero-Downtime Data Migration Guide (Firebase $\rightarrow$ PostgreSQL)

## 1. Roteiro Passo a Passo de Migração

```text
[1. Snapshot Completo Firebase]
              ↓
[2. Mapeamento de Schemas & Tipos]
              ↓
[3. Provisionamento Banco PostgreSQL Staging (Neon)]
              ↓
[4. Execução de Prisma Migrate]
              ↓
[5. Script de Extração e Ingestão com Bulk Batch & Transactions]
              ↓
[6. Validação Cruzada de Contagens & Relacionamentos (Check Data)]
              ↓
[7. Testes de Carga & Validação de Isolamento Multi-Tenant]
              ↓
[8. Virada de Tráfego (Cutover) & Preservação do Backup de Legado]
```

---

## 2. Tabela de Mapeamento de Coleções

| Coleção Firebase Original | Tabela Prisma / PostgreSQL | Estratégia de Chave Primária |
| :--- | :--- | :--- |
| `/tenants/{id}` | `tenants` + `white_label_configs` | CUID mantido ou mapeado |
| `/users/{id}` | `users` | CUID com hash seguro `passwordHash` |
| `/clients/{id}` | `clients` | `[tenantId, cpf]` unique |
| `/proposals/{id}` | `proposals` | `[tenantId, proposalNumber]` unique |
| `/ades/{id}` | `ades` | `[proposalId, adeNumber]` unique |
| `/partners/{id}` | `partners` | `[tenantId, code]` unique |
| `/banks/{id}` | `banks` | `[tenantId, code]` unique |
| `/promoters/{id}` | `promoters` | `[tenantId, code]` unique |
| `/statuses/{id}` | `proposal_statuses` | `[tenantId, code]` unique |
| `/status_histories/{id}` | `status_histories` | Foreign key para `proposalId` |
| `/comments/{id}` | `comments` | Foreign key para `proposalId` |
| `/documents/{id}` | `client_documents` | Foreign key para `clientId` e `tenantId` |
| `/operational_tasks/{id}` | `tasks` | Foreign key para `tenantId` |
| `/financial_entries/{id}` | `financial_entries` | Foreign key para `tenantId` |
| `/audit_logs/{id}` | `audit_logs` | Foreign key opcional para `tenantId` |
| `/backup_snapshots/{id}` | `backups` | Foreign key para `tenantId` |

---

## 3. Validação de Integridade Pós-Migração
- **Verificação de Contagem**: Comparação $N_{\text{Firebase}} == N_{\text{PostgreSQL}}$ para todas as entidades.
- **Validação Relacional**: Zero registros órfãos (todos os contratos vinculados a clientes válidos).
- **Validação de Hash SHA-256**: Checksum conferido antes de liberar a esteira de produção.
