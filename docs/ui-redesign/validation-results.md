# Validação — primeira entrega visual

Data: 13/10/2026. Branch: codex/sentinel-2-visual-preview.
Escopo: design system e preparação do shell, dashboard de leitura e consulta demonstrativa de propostas. Não é certificação de preservação integral nem autorização de publicação.

## Testes executados sem banco de dados

Comando:

```powershell
npx vitest run tests/ui_redesign_preview.test.tsx tests/refinancing_rates.test.ts tests/inss_eligibility.test.ts tests/nossa_fintech_table_names.test.ts
```

Resultado final: 4 arquivos e **49 testes aprovados**. Os testes de providers utilizados trabalham com fixtures/mocks; não importam a aplicação Express/prisma global nem fazem escrita em banco.

| Arquivo | Cobertura |
|---|---|
| ui_redesign_preview.test.tsx | 9 regressões novas: destinos por oito papéis, custom permissions, separação do portal, grupos, marca oficial, pesquisa/filtros, campos/valores ausentes, indicadores reais de fixtures e favoritos autorizados |
| refinancing_rates.test.ts | Regressões existentes de taxas e comportamento financeiro com mocks |
| inss_eligibility.test.ts | Regressões existentes de idade/limites/elegibilidade |
| nossa_fintech_table_names.test.ts | Identificação de tabelas e parsing com mocks |

A primeira rodada teve uma expectativa textual com caixa incorreta (“fixture” em vez de “Fixture”); a assertiva foi corrigida e as rodadas seguintes passaram. Não foi alterada regra financeira para fazer teste passar.

## Checagens técnicas

- npm run lint = TypeScript tsc --noEmit: **aprovado** na execução final sequencial.
- npm run build = prisma generate + Vite + esbuild: **aprovado** na execução final, com aviso de chunks grandes. Gera artefatos locais, não executa migrate deploy.
- git diff --check: sem erros de whitespace na inspeção.
- Backend, API, schema/migrations, serviços bancários e componentes do portal não editados.
- Nenhum push, merge ou deploy executado.

Uma execução anterior do typecheck em paralelo ao build encontrou TS6053 porque o tsconfig atual inclui dist e o Vite substituiu os arquivos gerados durante a leitura. A reexecução sequencial passou. O tsconfig não foi alterado nesta entrega. O aviso de chunks >500 kB permanece; não é falha de build nem evidência de regressão funcional.

## Revisão no navegador

Página de avaliação: /sentinel-2-preview.html, sem sessão de negócios.

| Caso | Resultado observado | Limite |
|---|---|---|
| 1920×1080 | Viewport lógico confirmado e screenshots claro/escuro, sem overflow horizontal da página | Dados reais de empresa ausentes na galeria |
| 1366×768 | Dashboard, tabela e sidebar compacta capturados nos dois temas; viewport e ausência de overflow confirmados | Modal de negócio autenticado não aberto |
| 390×844 adicional | Página sem overflow, menu móvel abre, foco contido no Shift+Tab, Escape fecha e retorna ao acionador | Não substitui revisão de todos os módulos no mobile |
| Navegação | Sidebar troca entre dashboard, propostas e placeholders de destinos preservados na galeria | Rotas reais/detalhes dependem da aplicação autenticada |
| Sidebar compacta | Expandir/recolher verificado; destino Propostas continua acionável | Tooltips/foco devem ser revisados também com leitor de tela real |
| Tabela | Dois exemplos explicitamente identificados; filtro C6 retorna 1 linha e limpar filtro retorna 2 | Dados sintéticos sem CPF/valores financeiros, nenhuma escrita |
| Busca | Abrir, localizar página Propostas, fechar com Escape e retornar foco ao acionador | Pesquisa de clientes/propostas/parceiros reais exige sessão; fontes carregadas, não índice completo |
| Temas | Alternância clara/escura aplicada e registrada | Módulos e modais legados ainda não foram revisados integralmente |
| Console da galeria limpa | Nenhum erro/warn retornado na aba limpa revisada | Aba usada antes para /login tinha avisos de API retornando HTML; não foram confundidos com a galeria |

Viewport do navegador usa escala de dispositivo; capturas foram feitas com retângulo completo correspondente e arquivos JPEG finais têm 1920×1080, 1366×768 ou 390×844, conforme nome. Não foram desenhadas imagens no lugar da interface.

## Bloqueados / não executados

1. Troca real A→B→A, UserTenantMembership, contexto MASTER OP e custom permissions em sessão autenticada.
2. Realtime e atualização de filas entre atendente/parceiro, WhatsApp/webhook e bancos.
3. Criação/edição/exclusão/status, importação/exportação e documentos com dados de teste em base isolada.
4. Validação autenticada do dashboard com todos os estados e do detalhe/modal de propostas.
5. White label em múltiplos domínios e portal com sessão própria em dois tenants.
6. Suite completa integration/scripts: não executada porque cria/apaga dados e uma base isolada não foi confirmada. Não apontar testes para DATABASE_URL de produção.
7. Contraste/a11y auditado com leitor de tela e ferramenta completa; revisão atual inclui foco e teclado, não certificação WCAG.
8. Navegação direta/reload de todas as 45 rotas autenticadas: teste estático do catálogo não equivale à execução ao vivo.

Nenhum desses itens está marcado como aprovado. A galeria possibilita aprovação da composição visual; a paridade funcional completa permanece uma etapa posterior, sem ampliar a autorização de migração atual.

## Ponto de parada

Aguardar avaliação visual do usuário. Não avançar para migração de módulos nem publicar.

## Checkpoints locais

- 8aff959: inventário e plano.
- 7256005: primeira prévia de desenvolvimento, sem publicação.
- Capturas e relatório registrados em commit local separado.

# Segunda iteração — Premium V2

Data: 13/10/2026. Ambiente: galeria local sem sessão/API e testes estáticos isolados. A primeira seção deste documento continua sendo registro histórico da primeira versão.

## Testes seguros

```powershell
npx vitest run tests/ui_redesign_preview.test.tsx tests/ui_redesign_premium.test.tsx tests/refinancing_rates.test.ts tests/inss_eligibility.test.ts tests/nossa_fintech_table_names.test.ts
```

Resultado: **5 arquivos / 56 testes aprovados**. Inclui os 49 anteriores e sete regressões novas: abas limitadas/autorizadas, ausência de fixtures no dashboard autenticado, favoritos autorizados, controles completos da galeria, múltiplas ADEs, ausência de drag com escrita, dados mascarados e estados de indicadores. Testes sem servidor global ou banco. Não são homologação de CRUD/realtime/providers.

- Typecheck final `npm run lint`: **aprovado**. Executado antes do build, evitando disputa com os arquivos gerados em dist.
- Build local final `npm run build`: **aprovado**; Vite compilou 2443 módulos e esbuild gerou a saída local. Aviso existente de chunks acima de 500 kB permanece. Nenhuma migration executada.
- `git diff --check`: sem erros de whitespace após remover linhas vazias extras no App.

## Revisão de interface renderizada

| Verificação | Resultado observado |
|---|---|
| Dark/light | Dashboard, propostas, Kanban, cliente e simulações capturados nos dois temas |
| 1920×1080 / 1366×768 | Viewports lógicos confirmados; sem overflow horizontal da página. Tabela completa usa scroll interno no notebook |
| Tablet 1024×768 / mobile 390×844 | Viewports confirmados; indicadores reorganizados; mobile abre propostas em cartões |
| Filtro de banco na galeria | C6: 8 propostas de exemplo; seleção da página habilita ações em lote |
| Dashboard filtrado por C6 | Andamento 6, pagas 2 e produção contratada R$136.600,00 da fixture; SLA/pendências mantêm base geral explícita |
| Tabela/cartões | Alternância renderizada; exemplos podem abrir drawer |
| Drawer/teclado | Foco inicial no fechamento; Shift+Tab retorna à última aba; Escape fecha e devolve foco ao botão de detalhe |
| Sidebar mobile | Abre; Shift+Tab mantém foco dentro do menu; Escape fecha e devolve foco ao acionador; sidebar fechada é inert |
| Busca Ctrl+K | Abre e foca campo; pesquisa por ADE de exemplo; Escape fecha e retorna foco ao acionador |
| Abas | Fechar Simulações remove atalho; back/forward e refresh preservam seleção visual de propostas/dashboard |
| Personalização | Ocultar “Propostas pagas” deixa cinco KPIs; estado de erro mostra indisponibilidade sem exibir os valores anteriores |
| Simulações | Tabs de planilhas, seleção Paraná, taxa entre 1,85 e 1,60 e estado “Nenhuma condição elegível” observados; nenhum cálculo/provider executado |
| Gráfico claro | Foi observado SVG não pintado após alternância; corrigido com camada de pintura isolada e confirmado visível |
| Console da aba revisada | Nenhum erro/warn retornado ao revisar a nova interface |

Capturas em `screenshots/premium-v2/`. Relatório de alterações e limitações: `premium-v2-review.md`.

## Bloqueios mantidos

Não houve sessão autenticada/base isolada confirmada. Não executados: troca real A→B→A, notificações/realtime, portal por domínio/tenant, todos os 45 caminhos autenticados, CRUD/importação/documentos e operações bancárias. Não executar integração que possa criar/apagar dados de produção. Revisão de teclado não substitui leitor de tela/avaliação WCAG completa.

Nenhum backend, schema, migration, regra financeira, API bancária ou infraestrutura foi modificado. Legado mantido. Nenhum push, merge ou deploy realizado. **Aguardar aprovação visual.**

Revisão adicional: Propostas, Esteira, Cliente 360° e Simulações foram navegados em 390px e 1024px; os quatro retornaram `overflow: false` para a página. Grids/tabelas/abas mantêm scroll interno quando necessário. Uma interação do navegador teve timeout durante o build local; estado foi relido e a navegação seguinte concluiu, sem erro no console. Isso não foi classificado como falha funcional do produto.
