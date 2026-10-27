# CLT — consulta inicial sem parcela ou prazo

## Diagnóstico de produção em 27/10/2026

- `sentinelconsig.com.br` resolve para deployment READY de produção, branch `main`, SHA `03194edc995420b9b262432dbf45e0a9a90754c4`.
- A main remota aponta para esse mesmo SHA. O PR #2 permanece aberto em rascunho, sem merge. O push de `codex/clt-consult-first` não publicou produção.
- Nesse commit publicado, `CltJourneyWorkspace` renderiza `CurrencyInput required` e inicia a ação `SIMULATE`. Isso explica a mensagem nativa “Preencha este campo”.
- O GET público `/simulacoes` retornou HTTP 200, `Cache-Control: public, must-revalidate, max-age=0` e asset com fingerprint `/assets/index-CzXpcTDb.js`. Não é necessário atribuir o problema a cache: o código efetivamente publicado ainda é anterior à correção. Não houve acesso a clientes ou sessão de terceiros.

## Caminhos verificados e correção

`SimulationView` abre `CltJourneyWorkspace` para CLT; `ProductSimulationModal` é usado para FGTS, mas ainda aceita CLT por compatibilidade. Ambos foram verificados. Não usam Zod ou React Hook Form; validam por HTML, handlers e controles compartilhados.

- Jornada atual: etapa inicial exige somente CPF, nome e telefone; empregador é opcional. Nenhum input financeiro é montado, inclusive oculto. A ação padrão é REFRESH e o botão é **CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES**.
- Valores financeiros guardados de uma etapa anterior não validam nem entram no payload de consulta. A validação financeira JavaScript permanece limitada a SIMULATE.
- Caminho legado: removido o `required` financeiro; ação inicial explícita REFRESH e submissão da etapa Cliente consultam sem parcela/prazo. Cálculo posterior continua exigindo valor positivo por JavaScript e no backend. A navegação anterior e a seleção de vínculos foram preservadas.
- Rota legada CLT REFRESH/AUTHORIZE aceita identidade sem campos financeiros, usando zero como ausência de cálculo e defaults do DTO. SIMULATE e FGTS mantêm as exigências existentes. A rota da jornada já aceita identidade sem parcela/prazo.
- `CurrencyInput` não foi alterado globalmente. Suas validações para valores financeiros efetivamente informados continuam disponíveis.

## Evidências

Em navegador Edge headless real, com perfil exclusivo e todos os destinos externos bloqueados, o componente atual passou por quatro cenários: 1440/light, 1440/dark, 390/light e 390/dark. Em todos:

- `form.checkValidity()` verdadeiro com somente os três dados sintéticos;
- exatamente três campos obrigatórios, sem parcela/prazo na etapa inicial;
- submissão nativa executada, ação REFRESH e ausência das chaves `value` e `term`;
- ausência de overflow horizontal, com rolagem interna do modal em mobile.

Capturas e resultados ficam fora do repositório em `%LOCALAPPDATA%/SentinelConsig/clt-empty-payment-preview/`. Trata-se de componente real com APIs simuladas, não homologação autenticada em produção. O navegador integrado não anexou a aba; a evidência foi obtida pelo navegador local dedicado.

A suíte adicional `product_simulations.test.tsx` apresentou 15 falhas. A execução em snapshot limpo do HEAD anterior (`26e6857`) reproduziu as mesmas 15, por nome, confirmando a preexistência. Não foram corrigidas fora do escopo. A regressão da jornada também mantém a falha histórica Happy/INSS explicitamente registrada no PR.

Resultados finais: 43/43 testes focados aprovados; regressão ampliada 266/267 (somente a falha histórica Happy/INSS); quatro cenários em navegador real aprovados; TypeScript, build frontend/backend e `git diff --check` aprovados. Os testes focados se sobrepõem à regressão e não devem ser somados. As 15 falhas da suíte legada adicional foram reproduzidas separadamente no baseline. O build conserva o aviso de chunks grandes.

Não houve chamada bancária real, alteração de credenciais, schema, migrations ou banco operacional.

## Publicação e reversão

Este pacote é enviado somente à branch de revisão. **A produção continuará com a versão antiga até autorização específica de merge/publicação.** Nenhum push na main ou deploy foi executado.

Para reverter os arquivos desta correção, reverter seu commit em branch de revisão. Não há alteração de banco a desfazer.
