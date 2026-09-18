# SENTINEL CONSIG

**Plataforma de gestão e operação para crédito consignado.**

O SENTINEL CONSIG é uma aplicação web voltada à organização e ao acompanhamento de operações de crédito consignado, com foco em gestão operacional, controle de acessos e suporte a ambientes multiempresa.

> Projeto em desenvolvimento contínuo.

## Visão geral

O SENTINEL CONSIG tem como objetivo centralizar recursos operacionais em uma plataforma, permitindo que usuários autorizados trabalhem de acordo com suas permissões e com o contexto da empresa selecionada.

## Funcionalidades

- Gestão de usuários e acessos.
- Controle de permissões por perfil.
- Arquitetura multiempresa (multi-tenant).
- Contexto de empresa e isolamento de dados.
- Painéis e recursos de acompanhamento operacional.
- Registro de eventos de auditoria.
- Estrutura para armazenamento de backups.
- Integrações com serviços externos.

*As funcionalidades disponíveis podem variar conforme a versão e o estágio de desenvolvimento.*

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Frontend | React, TypeScript, Vite |
| Estilização | Tailwind CSS |
| Backend | Node.js, Express |
| ORM | Prisma |
| Banco de dados | PostgreSQL |
| Autenticação | Sessões e controles de acesso |
| Armazenamento | Azure Blob Storage |
| Comunicação em tempo real | Pusher |
| Testes | Vitest |

## Arquitetura

O projeto utiliza uma arquitetura web com frontend e backend integrados, persistência de dados via Prisma e banco PostgreSQL.

A aplicação contempla uma estrutura multiempresa, na qual o contexto de acesso deve ser validado pelo servidor. As permissões de cada usuário devem ser aplicadas de acordo com sua associação e o contexto ativo.

Documentação técnica:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`MULTI_TENANT.md`](./MULTI_TENANT.md)
- [`DATABASE.md`](./DATABASE.md)
- [`SECURITY.md`](./SECURITY.md)

## Requisitos

- Node.js compatível com as dependências do projeto.
- PostgreSQL.
- Variáveis de ambiente configuradas.
- Serviços externos configurados quando necessários.

O repositório também contém um arquivo de lock do Bun, caso prefira utilizar esse gerenciador.

## Instalação local

Clone o repositório:

```bash
git clone https://github.com/kauaigouveia/sentinelconsig.git
cd sentinelconsig
```

Instale as dependências:

```bash
npm install
```

Configure as variáveis de ambiente conforme o arquivo `.env.example` e a documentação do projeto.

Gere o cliente Prisma:

```bash
npx prisma generate
```

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Gera o cliente Prisma e compila a aplicação |
| `npm start` | Inicia a aplicação compilada |
| `npm test` | Executa os testes |
| `npm run lint` | Executa a verificação TypeScript |
| `npm run preview` | Inicia o preview do Vite |

## Variáveis de ambiente

Utilize o arquivo `.env.example` como referência para configurar o ambiente local.

**Nunca envie credenciais, tokens, senhas ou chaves privadas para o repositório.**

Consulte [`ENVIRONMENT.md`](./ENVIRONMENT.md) para orientações específicas.

## Banco de dados e migrações

O projeto utiliza Prisma para interação com o banco de dados.

Antes de aplicar migrações em ambientes compartilhados ou de produção:

1. Verifique o estado atual do banco.
2. Revise as migrações pendentes.
3. Confirme a existência de backups válidos.
4. Siga os procedimentos documentados em [`MIGRATION.md`](./MIGRATION.md).

Não execute seeds destrutivos em ambientes com dados reais.

## Backups

As orientações de armazenamento e gerenciamento de backups estão documentadas em [`BACKUPS.md`](./BACKUPS.md).

## Deploy

Consulte [`DEPLOY.md`](./DEPLOY.md) para instruções de implantação e configuração do ambiente.

Este README não substitui os procedimentos de deploy e validação de produção.

## Segurança

O SENTINEL CONSIG trabalha com autenticação, autorização e contexto de acesso por empresa.

- Não compartilhe credenciais.
- Não exponha arquivos `.env`.
- Não confie em identificadores de empresa enviados pelo frontend como fonte de autorização.
- Reporte vulnerabilidades de forma responsável.

Consulte [`SECURITY.md`](./SECURITY.md).

## Status do projeto

O SENTINEL CONSIG está em evolução contínua. Funcionalidades, integrações e fluxos de acesso podem ser aprimorados entre versões.

## Licença

A licença de distribuição deve ser definida pelo responsável pelo projeto. Até que exista uma licença explícita no repositório, não presuma autorização para redistribuição ou uso comercial.
