# Hub unificado — correção de catálogo e monitoramento

Escopo ampliado explicitamente pelo responsável durante a revisão visual. Não houve acesso a banco operacional nem requisição bancária.

## Causas comprovadas

- `IntegrationHubService.getCatalog` limitava o catálogo a C6, FACTA, BMG, Happy e VCTEX. Seis integrações existentes nas configurações não entravam no denominador.
- O monitor lia `c6_active`, `facta_active` e `bmg_active`, enquanto os serviços atuais usam configurações próprias por empresa/promotora, incluindo `c6_bank_enabled`, `facta_enabled` e `BMG_CONFIG` cifrada. A ausência de certas chaves também era tratada como habilitação implícita.
- O frontend só atualizava na montagem, por clique ou evento local.
- `/saude-apis` renderizava a central antiga de configuração. O Hub já embutia essa central, repetindo cabeçalho, indicadores limitados a C6/FACTA e outra navegação bancária.

## Correção

- Catálogo de 11 instituições: C6, FACTA, BMG, Happy, FINANTO, Nossa Fintech, WorkBank, Paraná, Presença, V8 e VCTEX. Isso não significa 11 conexões ativas.
- Leitura pelos getters existentes em escopo de empresa/promotora. Saída limitada a booleanos, ambiente e URL mascarada; nenhum segredo é retornado. Falha de configuração isolada é sinalizada, não tratada como conexão confirmada.
- Habilitada, configurada e estado do último monitoramento são informações distintas. Sem evidência recente, a integração não fica online por ter credenciais. Múltiplas conexões sem verificações individualizadas ficam em atenção.
- Atualização automática de leitura a cada 60s somente em página visível, sem sobreposição; foco/retorno de conexão também atualizam. Nenhuma autenticação, consulta financeira, SMS ou POST bancário automático.
- Visão geral em tabela única; diagnósticos detalhados sob demanda; seletor de instituição e abas de saúde, incidentes e auditoria no Hub. Configuração embutida não repete a barra de bancos nem os indicadores antigos.
- A rota antiga permanece válida. Quem pode ver o Hub recebe a mesma central por ela; acesso exclusivo de saúde preserva a interface anterior, sem ampliar permissões. O menu não repete Saúde das APIs quando o Hub já está autorizado. Planilhas e outras conexões foram preservadas.

## Validação e limites

Suíte isolada com dados sintéticos e bloqueios do Lote 0: 48 arquivos, 491 testes aprovados na execução registrada em 03/11/2026. Casos focados incluem isolamento, ausência de chamadas externas, descarte de segredos, configuração independente de disponibilidade, leituras com falha, atualização visível sem concorrência e navegação por permissões. TypeScript/build aprovados; a migração visual posterior revalidará o conjunto final.

Não é homologação com APIs reais. O contador efetivo da empresa só pode ser conferido após leitura autorizada no ambiente publicado. Diagnósticos de alguns provedores ainda não alimentam `IntegrationHealthLog`; nesses casos o monitor mostra não verificado/sem amostra. Não foi criada telemetria fictícia nem um robô de autenticação. Estados de saúde representam registros anteriores, não garantia de disponibilidade atual ou permissão para todos os produtos. O novo leitor usa os getters oficiais por promotora; seu custo em banco deve ser acompanhado após publicação.

Nenhuma migration, seed, credencial, gateway Oracle ou regra financeira foi alterada. As alterações locais anteriores em `server.ts`, Vercel, multissimulação e testes do Lote 0 permanecem separadas.
