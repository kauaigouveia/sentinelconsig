# Conexões bancárias por promotora

Branch: `codex/bank-promoter-api-connections`. Implementação local; sem publicação.

## Origem das credenciais

O responsável confirmou que todas as credenciais existentes pertencem à DG PROMOTORA.
Os nomes exatos `DG` e `DG PROMOTORA` identificam a compatibilidade legada; nomes
ambíguos, promotora inativa ou pertencente a outro tenant são rejeitados.
As novas credenciais usam SystemConfig com chaves
`integration:<provedor>:<promoterId>:<chave original>`. Não há alteração do schema,
migration ou cópia automática de propostas/credenciais em produção.

FACTA, C6, BMG, Happy/BYX, FINANTO e Nossa Fintech têm edição de credenciais por
promotora. O seletor remonta o editor ao trocar a conexão, descartando senhas
digitadas e resultados do editor anterior. O código de promotora exigido por cada
banco continua sendo o campo original do respectivo provedor.

## Consultas de propostas

- FACTA: consulta individual lê promoterId da proposta; descoberta em lote e
  correlação de AF são filtradas pela promotora da conexão. Worker separado.
- C6: consulta individual força a conexão da proposta; worker visita as conexões
  configuradas e habilitadas, com filas e indicadores separados.
- Happy/BYX: consulta individual força a conexão da proposta; lote filtrado pela
  promotora selecionada. Desativar uma conexão não desativa outra conexão ativa.
- FINANTO e Nossa Fintech: endpoints de sincronização usam a promotora da proposta.
- BMG: consulta e link de formalização usam a promotora da proposta; novos envios
  gravam a promotora da conexão que efetivamente realizou o envio.
- Proposta sem promotora: bloqueio antes da consulta. Não se tenta outra conexão.
- Tokens, sessões BMG e configuração são separados por empresa e promotora.
- Chamadas antigas sem seletor continuam na compatibilidade DG. Não há mudança
  automática da promotora de propostas existentes.

## Limites e pendências antes da publicação

- Não houve autenticação real, consulta bancária real, escrita de teste em banco,
  envio de SMS, migration, push ou deploy.
- Validar credenciais/permissões comerciais de cada nova conexão em sessão
  autorizada; provas locais não homologam as APIs dos bancos.
- O webhook legado Happy não informa uma conexão autenticada de origem.
  Enquanto apenas conexões DG estiverem ativas, uma correspondência legada DG
  inequívoca pode ser processada. Com outra promotora Happy ativa, o callback
  compartilhado preserva os eventos como não associados, sem atualizar propostas.
  Eventos ambíguos também ficam não associados. O alias não atualiza
  simulações quando o processamento da proposta foi recusado. Configuração
  segura de callbacks por conexão é pendência, antes de ativá-los para novas
  promotoras. Não há atribuição automática pela primeira proposta encontrada.
- As telas de simulação fora dos editores de integração continuam com a seleção
  legada DG quando não enviam um contexto de promotora. Comparação automática de
  múltiplas promotoras não faz parte desta implementação.
- Revisar propostas antigas sem promotora ou com vínculo divergente do código
  usado no banco. Não houve correção em lote de dados.

## Validação local

14 testes em `tests/bank_promoter_connections.test.ts`, com Prisma simulado em
memória, passaram: compatibilidade DG, ausência de herança para PROSPECTA,
rejeição de outra empresa, namespaces dos cinco outros provedores, concorrência,
correlação FACTA, bloqueio sem promotora e dispatch C6/Happy pela proposta.
Os testes de dispatch não executam a sincronização financeira interna completa.
As três suites locais selecionadas passaram: 59 testes (14 de conexões, 44 de
FACTA e 1 do Hub). Os fixtures FACTA antigos receberam o vínculo DG obrigatório,
preservando as assertivas de banco, CPF, AF divergente e duplicidade.
`npm run lint` (TypeScript), `npm run build` e `git diff --check` passaram.
O build apenas gerou o cliente Prisma; não executou migrations.
O aviso de chunks acima de 500 kB permanece.
Credenciais FACTA/Happy globais do servidor não são herdadas por tenants: caso
alguma conexão dependa exclusivamente dessas variáveis, cadastrá-la explicitamente
na empresa/promotora correta antes de usar o novo código.
