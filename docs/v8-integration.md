# V8 Digital — conexão inicial

## Entrega

Aba em Bancos & Promotoras → V8 Digital. Configuração por empresa, promotora e ambiente; credenciais criptografadas com AES-256-GCM e contexto autenticado da empresa/promotora. Senhas, client_id, audience e tokens não retornam ao navegador. Campos vazios preservam somente o valor do ambiente selecionado.

- `GET /api/integrations/v8/config?promoterId=...&environment=production`: metadados.
- `PUT /api/integrations/v8/config?promoterId=...`: salvar configuração.
- `POST /api/integrations/v8/test?promoterId=...`: autenticar e consultar tabelas dos produtos selecionados.
- Permissões: `integrations.view` para visualizar e `integrations.manage` para alterar/testar. Portal de parceiros sem acesso às credenciais.
- Não há migração de banco nem ativação automática de produtos nos simuladores nesta entrega.

## Contrato consultado em 19/10/2026

Fonte: [início](https://docs.v8sistema.com/guide/inicio), páginas FGTS e CLT e ferramenta `search_documentation` do MCP V8.

Autenticação documentada: `POST https://api.v8digital.com/oauth/token`, formulário com `grant_type=password`, `username`, `password`, `audience`, `scope=offline_access`, `client_id`. O endereço precisa ser validado com as credenciais reais; não foi confirmado por uma autenticação nesta entrega. Cache do token respeita `expires_in`, com margem de 30 segundos e teto de 24 horas.

API: `https://bff.v8sistema.com`. Diagnóstico autenticado verifica o formato das tabelas e exibe resultado por produto; HTTP 200 isoladamente não confirma produto operacional.

## Jornadas a implementar

FGTS: registrar webhooks de saldo/proposta → `POST /fgts/balance` → aguardar evento → `GET /fgts/balance?search=...` → `GET /fgts/simulations/fees/new` → `POST /fgts/simulations` → `POST /fgts/proposal` → acompanhar pelo ID externo. O retorno `null` inicial representa processamento, não saldo zero.

CLT: registrar webhooks consulta/operação → `POST /private-consignment/consult` → apresentar termo e obter aceite real → `POST /private-consignment/consult/{consult_id}/authorize` → acompanhar margem até `SUCCESS` → configurações, pré-cálculo e simulação → criar operação e acompanhar pelo ID externo.

As próximas entregas precisam persistir o vínculo entre ID externo e proposta interna e sincronizar status, valores e dados da operação. Webhooks devem ser idempotentes e confirmar o estado na API antes de atualizar a proposta. Não gerar aceite automático do termo.

## Pendências da documentação

- URL de homologação não definida; credenciais podem ser guardadas desativadas. Nunca substituir homologação por produção.
- Segurança de webhook e rate limits estão marcados como pendentes na página de dúvidas frequentes.
- Há variações de caixa e valores de `provider` por etapa/produto; confirmar no ambiente autenticado.
- Pré-cálculo CLT está documentado em domínio Azure separado; schema de sucesso ainda pede validação autenticada.
- Exemplos de JSON possuem erros de sintaxe; não reproduzir literalmente.

## Sondagem de acesso sem credenciais

Em 19/10/2026, GET de bancos retornou 200, tabelas FGTS e configurações CLT retornaram 401 por ausência de Authorization. Isso confirma alcance desses recursos, não valida autenticação, simulação, contratação ou callbacks. Nenhuma proposta foi criada, consentimento enviado ou webhook registrado nesta sondagem.
