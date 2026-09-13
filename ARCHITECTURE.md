# SENTINEL CONSIG — SaaS Enterprise Architecture

## 1. Visão Geral
O **SENTINEL CONSIG** é uma plataforma SaaS multi-tenant de gestão de crédito consignado projetada para escalabilidade, alta disponibilidade, isolamento estrito entre empresas clientes e conformidade com as diretrizes da LGPD e do mercado bancário.

```text
                                GITHUB
                                  │
                                  ▼
                                VERCEL
                                  │
                        Next.js / React (Edge/Node)
                                  │
                                  ▼
                         Server Actions & API
                                  │
                                  ▼
                              PRISMA ORM
                                  │
                                  ▼
                         POSTGRESQL (Neon / Supabase)
                                  │
                  ┌───────────────┼───────────────┐
                  ▼               ▼               ▼
              Tenants          Users           Dados
                  │               │               │
                  └───────────────┼───────────────┘
                                  │
                                  ▼
                          REALTIME & BACKUP
                                  │
                                  ▼
                          STORAGE EXTERNO
```

---

## 2. Camadas do Sistema

### 2.1 Frontend & Aplicação do Cliente
- **Framework**: Next.js / React com TypeScript.
- **Estilização**: Tailwind CSS com injeção dinâmica de White Label por Tenant (CSS Variables).
- **Gerenciamento de Estado**: React Contexts desacoplados com cache volátil e sincronização reativa.
- **Comunicação em Tempo Real**: WebSocket / Server-Sent Events (SSE) via `realtimeHub` com filtros obrigatórios de `tenantId`.

### 2.2 Camada de Serviços & Regras de Negócio (Server-Side)
- **Autoridade de Dados**: Todas as operações de escrita e leitura crítica são executadas sob validação da sessão autenticada.
- **Tenant Context Resolution**: O `tenantId` é resolvido a partir do token de sessão decodificado no servidor; parâmetros enviados pelo cliente são rejeitados se divergirem do token.
- **Controle de Concorrência**: Otimistic Locking via campo `version` e `updatedAt`.

### 2.3 Banco de Dados & ORM
- **Banco Oficial**: PostgreSQL (Neon Serverless / Supabase / Cloud SQL) com pooling transacional.
- **Camada de Acesso**: Prisma Client com schema unificado, chaves primárias, constraints únicas compostas (`[tenantId, cpf]`, `[tenantId, proposalNumber]`), índices B-Tree e soft delete.

---

## 3. Topologia de Multi-Tenancy

```text
                    SENTINEL SAAS
                         │
                 PLATFORM_MASTER
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       TENANT A       TENANT B       TENANT C
     (Empresa Alpha) (Empresa Beta) (Empresa Gamma)
          │              │              │
     White Label    White Label    White Label
          │              │              │
        Dados          Dados          Dados
          │              │              │
          └──────────────┼──────────────┘
                         │
                    POSTGRESQL
                         │
                      PRISMA
```

* **Modelo de Dados**: Shared Database com Discriminador Lógico `tenant_id` e chaves compostas em todas as tabelas operacionais.
* **Isolamento de Queries**: Todas as consultas incluem compulsoriamente a cláusula `WHERE tenant_id = session.tenant_id`.
