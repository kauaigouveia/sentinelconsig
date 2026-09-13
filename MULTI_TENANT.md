# SENTINEL CONSIG — Multi-Tenant Architecture & Isolation Engine

## 1. Princípio do Isolamento Estrito
Cada empresa cliente cadastrada no **SENTINEL CONSIG** opera em um ambiente logicamente isolado.
- Nenhuma consulta ou mutação pode cruzar as fronteiras do tenant.
- O identificador do tenant (`tenantId`) é injetado a partir da autenticação decodificada no servidor.

```text
[HTTP Request]
       │
       ▼
[Server Middleware: Extract Session Token]
       │
       ▼
[Resolve: authenticatedUser.tenantId]
       │
       ▼
[Prisma Query: WHERE tenantId = authenticatedUser.tenantId]
       │
       ▼
[Result Set: 100% Segregado]
```

---

## 2. Ciclo de Vida do Tenant (Empresa)

### 2.1 Provisionamento (Criação)
- Executado exclusivamente pelo `PLATFORM_MASTER`.
- Gera automaticamente: `tenantId`, `slug` único, registros padrão de status de esteira, banco de amostra e conta `TENANT_ADMIN`.

### 2.2 Suspensão (`ACTIVE` $\rightarrow$ `SUSPENDED`)
- Bloqueia instantaneamente o login de todos os operadores daquele tenant.
- Acesso restrito a aviso institucional de suspensão/regularização.

### 2.3 Exclusão Protegida (Soft Delete & Hard Delete)
1. **Passo 1 (Salvaguarda Obrigatória)**: O sistema executa um snapshot completo de backup (`PRE_DELETION`) com hash SHA-256 antes de qualquer alteração de estado.
2. **Passo 2 (Confirmação Forte)**: O `PLATFORM_MASTER` deve digitar exatamente o nome empresarial da organização e confirmar sua senha.
3. **Passo 3 (Soft Delete)**: O status do tenant muda para `CANCELLED` / `deletedAt = now()`.
4. **Passo 4 (Retenção e Hard Delete)**: Período de quarentena de 30 dias para recuperação antes do expurgo definitivo.

---

## 3. White Label e Domínios
- **Identificação por Subdomínio**: `empresa-alpha.sentinelconsig.com.br` $\rightarrow$ resolução de tenant por `slug: empresa-alpha`.
- **Identificação por Domínio Personalizado**: `sistema.alphacredito.com.br` $\rightarrow$ resolução por `custom_domain`.
- **Injeção de Identidade**: Logo, cores primária/secundária, nome empresarial, razão social, CNPJ, telefone de suporte e termos customizados carregados dinamicamente no tema.
