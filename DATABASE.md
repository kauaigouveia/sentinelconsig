# SENTINEL CONSIG — Database Design & Schema Specification

## 1. Escolha do Provedor de Banco de Dados
Para o modelo SaaS com **Custo Inicial R$ 0,00** e compatibilidade com Vercel / Prisma:

| Provedor | Armazenamento Gratuito | Conexões | Compatibilidade Vercel/Prisma | Suspensão / Cold Start | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Neon PostgreSQL** | 0.5 GB Storage + Autoscaling | Pooling Nativo | ⭐⭐⭐⭐⭐ (Excelente via Connection Pooling) | Scale-to-zero com wake up em ~500ms | **Recomendado (Principal)** |
| **Supabase PostgreSQL** | 500 MB Storage + Realtime | PgBouncer integrado | ⭐⭐⭐⭐⭐ | Pausa após 7 dias de inatividade no free | **Excelente Alternativa** |
| **Google Cloud SQL** | Não possui free tier perpétuo | VPC Dedicada | ⭐⭐⭐⭐ | Instância 24/7 ligada | Ideal para Enterprise Dedicado |

---

## 2. Entidades & Modelagem Relacional (Prisma)

### Principais Modelos
1. `tenants`: Registro das empresas contratantes, slug, domínios, quotas e status.
2. `white_label_configs`: Cores, logos, nomes e informações institucionais por tenant.
3. `users`: Operadores com hash seguro `passwordHash`, papel RBAC e vínculo de `tenantId`.
4. `sessions`: Sessões ativas com expiração, IP e user-agent.
5. `clients`: Cadastro de proponentes (CPF único por tenant).
6. `proposals`: Contratos de consignado vinculados a bancos, promotoras e parceiros.
7. `ades`: Averbações / contratos individuais por proposta.
8. `banks` e `promoters`: Matriz bancária parametrizável por tenant.
9. `partners`: Parceiros / correspondentes com busca por código ou nome.
10. `proposal_statuses`: Esteira customizável com SLAs e categorias padrão.
11. `status_histories`: Linha do tempo de transições com operador e observações.
12. `comments`: Anotações internas por proposta.
13. `client_documents`: Documentação digitalizada (RG, CNH, Comprovantes).
14. `financial_entries`: Lançamentos do razão financeiro.
15. `tasks`: Tarefas operacionais da agenda.
16. `audit_logs`: Rastreabilidade de ações críticas (quem, quando, o quê).
17. `backups`: Registros de snapshots com checksum SHA-256 e paths de armazenamento.

---

## 3. Índices e Otimização de Performance
- Índices B-Tree compostos para evitar full-table scans em escala:
  - `@@index([tenantId, createdAt])`
  - `@@index([tenantId, proposalNumber])`
  - `@@index([tenantId, cpf])`
  - `@@index([tenantId, statusId])`
  - `@@index([tenantId, partnerId])`
