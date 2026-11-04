# Hub: configuração versus monitoramento

## Causas verificadas no código
- C6 e FACTA exibiam “Conectado & Habilitado” a partir de `isConfigured`, que comprova cadastro de credenciais, não sucesso de uma conexão.
- O catálogo classificava ausência/expiração de health check como ATTENTION e colocava qualquer banco com mais de uma conexão habilitada em ATTENTION.
- `IntegrationHealthLog` possui tenant e banco, mas não identifica promotora. Um sucesso de banco não comprova todas as conexões de uma empresa.
- A única gravação de IntegrationHealthLog encontrada está no health check explícito do Hub. Testes na configuração ou operações normais não são automaticamente evidência nesse histórico. O refresh de 60 segundos apenas relê o catálogo.

## Correção local
- Status UNKNOWN e contador `unknown`, com rótulo neutro “Sem verificação confirmada”. Não contam como falha ou atenção operacional.
- Motivo seguro por integração (sem dados de cliente ou credenciais).
- Desabilitada, configuração incompleta, incidente, falha recente, verificação expirada e sucesso recente têm tratamentos separados.
- Falha antiga não sustenta indisponibilidade indefinidamente; sem evidência atual o estado volta a não comprovado.
- “Online” exige registro recente e atribuição compatível ao escopo. Múltiplas promotoras não recebem um sucesso presumido do histórico legado.
- VCTEX continua usando diagnósticos próprios por promotora. Se todas possuem diagnóstico operacional válido, o agregado pode continuar online; não se aplica a ela a ambiguidade do log legado. Conexão sem diagnóstico fica neutra, e falhas/pendências comprovadas permanecem visíveis.
- Badges de configuração C6/FACTA passam a dizer “Credenciais cadastradas”. Nenhuma ativação ou configuração bancária foi alterada.
- O resumo geral não declara operacional um catálogo inteiramente desabilitado ou não verificado. UI informa que atualização não executa testes bancários.

## Limitação real
Esta correção elimina classificação e mensagens enganosas. Ela não cria resultados de testes inexistentes. Para monitoramento automático positivo por conexão, é necessário registrar os resultados reais de testes/operações com tenant e promotora, em armazenamento apropriado e sem payloads sensíveis. Não foi criada instrumentação geral dos adapters nem realizado diagnóstico bancário nesta tarefa.

## Validação
25 testes focados aprovados: catálogo, refresh somente de leitura, estado desconhecido versus falhas, evidência recente/antiga, múltiplas promotoras, VCTEX com diagnósticos separados, UI e regressão do design system. Testes usam mocks e dados sintéticos; não comprovam disponibilidade real dos bancos. A comparação histórica de código do redesign preserva os demais módulos e normaliza apenas a troca textual dos dois badges; o comportamento novo do Hub é coberto pelos testes próprios.

Preparado na branch local já usada pelas correções das planilhas. Sem chamadas bancárias, migrations, alteração de dados operacionais, commit, push ou deploy nesta etapa.

Verificações finais: TypeScript (`npm run lint`), build (`npm run build`) e `git diff --check` aprovados. Build com os avisos conhecidos de chunks grandes, sem erro.

Atualização de entrega: envio das correções à main autorizado em 04/11/2026, após as validações registradas. As referências acima a ausência de publicação descrevem a etapa de preparação. A importação dos arquivos e as verificações bancárias não são executadas automaticamente pelo push.
