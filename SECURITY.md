# SENTINEL CONSIG — Security & Data Protection Guide

## 1. Princípios de Segurança
1. **Zero Confiança no Cliente (Zero-Trust)**: Nenhum parâmetro de `tenantId`, `role` ou `userId` enviado no payload HTTP é aceito sem validação contra o token de sessão autenticado.
2. **Defesa em Profundidade**: Validação de autorização na camada de rota, camada de serviço e cláusulas SQL do banco de dados.
3. **Proteção LGPD & Dados Sensíveis**: Mascaramento visual de CPF e telefones em logs; restrição de visualização de documentos a usuários do mesmo tenant.

---

## 2. Autenticação e Gestão de Senhas
- **Armazenamento de Senhas**: Apenas hashes criptográficos salgados (bcrypt / argon2) com fator de custo calibrado.
- **Proibição Absoluta**: Senhas em texto claro, no localStorage, em commits do Git ou trafegando em logs são terminantemente bloqueadas.
- **Fluxo de Alteração de Senha**:
  - *Autoatendimento*: Exige validação da senha atual antes de gravar a nova senha.
  - *Redefinição Administrativa*: Gera token temporário de expiração curta ou credencial descartável com flag `mustChangePassword: true`. Administradores nunca visualizam senhas existentes.

---

## 3. Matriz RBAC (Role-Based Access Control)

| Papel | Escopo | Ações Permitidas |
| :--- | :--- | :--- |
| **PLATFORM_MASTER** | Global | Provisionar/suspender/excluir tenants, gerenciar quotas, backups globais, auditar saúde. |
| **TENANT_ADMIN** | Tenant | Criar usuários da empresa, gerenciar parceiros, esteira de status, White Label do tenant. |
| **GESTOR** | Tenant | Gerenciar produção, reatribuir propostas, aprovar propostas, relatórios financeiros. |
| **GERENTE** | Tenant | Supervisionar equipe comercial, esteira Kanban, relatórios do time. |
| **DIGITADOR** | Tenant | Cadastrar clientes, digitar propostas, anexar documentos, simulações. |
| **SUPORTE** | Tenant | Consultar pendências, atender chamados operacionais. |
| **SIMULACAO** | Tenant | Acesso restrito a cálculos e simulações de margem. |

---

## 4. Proteção contra Tentativas de Violação Cross-Tenant
Qualquer requisição tentando acessar ID pertencente a outro tenant dispara evento `SECURITY_CROSS_TENANT_VIOLATION_BLOCKED` no `AuditLog` com IP, autor e timestamp, bloqueando a execução com erro imediato.
