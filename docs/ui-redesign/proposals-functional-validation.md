# Shell e Propostas Premium V2 — integração de desenvolvimento

14/10/2026 · branch `codex/sentinel-2-proposals-functional` · baseline `795dc0d`.

## Estado da entrega

Atualização de autorização: em 14/10/2026 o usuário cancelou a preparação de homologação e autorizou continuar os demais módulos. Não aguardar ambiente isolado para desenvolvimento; fluxos autenticados permanecem **não validados**. Registro vigente em `progressive-migration.md`.

A apresentação Premium de Propostas utiliza o componente operacional `ProductionList`, seus serviços, handlers, filtros e modais existentes. Não há importação de fixtures da galeria na aplicação autenticada. Sidebar, topbar, favoritos, abas, temas e contexto de empresa mantêm a estrutura V2 já aprovada e as fontes/permissões existentes.

O modo permanece exclusivo de desenvolvimento, ativado por `?ui=2`. A interface legada continua padrão e pode ser selecionada por `?ui=legacy` ou pelo controle de desenvolvimento. Não foi liberada substituição definitiva: faltam homologação autenticada e aprovação final.

## Paridade e mudanças

[Matriz funcional](proposals-functional-parity.md): 45 equivalências, incluindo campos, permissões, filtros, modais, integrações e rollback. [Manifesto anterior às alterações](proposals-baseline-controls.json): controles JSX e hashes do baseline.

- Removida a consulta intermediária de leitura de Propostas na aplicação autenticada; ações existentes ficam diretamente na tela operacional.
- Workspace Premium com resumo horizontal, filtros recolhíveis, tabela/cartões, configuração de colunas e paginação de apresentação.
- Parcela e prazo adicionados à tabela a partir dos campos reais existentes. Seleção, exportação e navegação do detalhe continuam considerando todas as propostas filtradas, independentemente da página.
- Preferências de colunas guardam apenas identificadores numéricos e usam o contexto de usuário/empresa já existente. Nenhum CPF é gravado nessas preferências.
- Atalho para a rota real de Kanban, sem migração desse módulo.
- Busca de tarefas com o GET existente `/api/tasks`, somente com `tasks.view`, sem cache persistente; aborto e descarte de respostas antigas ao fechar ou mudar contexto.
- Formulários, modais e regras operacionais originais preservados. Backend, Prisma, migrations, autenticação, contratos HTTP e serviços bancários não foram alterados.

## Testes efetivamente executados

| Verificação | Resultado e alcance |
|---|---|
| Vitest: sete arquivos selecionados | 79 testes aprovados; fontes sintéticas, sem banco ou saídas externas |
| Integração DOM de ProductionList + busca | 23 testes aprovados; mocks de StorageService, fetch e modais; não são sessões autenticadas |
| Manifesto de controles | Os 39 controles originais da lista mantêm bindings inventariados |
| Expressões operacionais | 14 expressões/handlers com AST canônica igual ao baseline |
| Formulários/modais | Cinco arquivos com hash integral igual ao baseline |
| Paginação e seleção | 25 por página, página seguinte, todas, seleção completa, poda após filtro |
| Exportação/detalhe | IDs filtrados completos enviados aos componentes simulados; arquivo real e detalhe remoto não exercitados |
| Permissões | MASTER, GESTOR, DIGITADOR e custom permissions restritas no componente; testes existentes de rotas para oito papéis |
| Contexto A→B→A | Preferências e registros sintéticos isolados ao remontar componente; não valida sessão/backend |
| Busca de tarefas | Desabilitada sem permissão; rota existente; aborto e resposta atrasada descartada |
| Rollback | Componente legado renderizado com seus cartões e workspace |

Comando da suíte segura:

```text
npx vitest run tests/ui_proposals_functional.test.tsx tests/ui_shell_search.test.tsx tests/ui_redesign_preview.test.tsx tests/ui_redesign_premium.test.tsx tests/refinancing_rates.test.ts tests/inss_eligibility.test.ts tests/nossa_fintech_table_names.test.ts
```

`npm run lint` (TypeScript, sem emissão): aprovado. `npm run build`: aprovado (Prisma Client gerado localmente, Vite e esbuild; sem migrations). O Vite manteve aviso de chunks maiores que 500 kB. `git diff --check`: aprovado. Build/typecheck não comprovam preservação funcional.

## Testes e capturas bloqueados

Não há homologação com banco isolado e contas confirmadas. Portanto não foram executados login real por perfil, troca real entre empresas, CRUD/importação/documentos, geração real do Excel, notificações/realtime, portal por domínio, consultas bancárias ou testes com escrita em produção.

**Capturas da tela autenticada não foram produzidas.** Capturas anteriores da galeria continuam sendo apenas evidência visual da fase anterior; não foram reutilizadas como prova desta integração. Responsividade autenticada em 1920×1080/1366×768, teclado/leitor de tela e comportamento dos modais sob o novo shell aguardam ambiente seguro.

## Arquivos alterados

- `src/App.tsx`
- `src/components/production/ProductionList.tsx`
- `src/components/production/ProductionWorkspace.tsx` (novo)
- `src/components/redesign/PreviewData.ts`
- `src/components/redesign/PreviewSearch.tsx`
- `src/components/redesign/useTaskSearch.ts` (novo)
- `src/styles/sentinel-2-production.css` (novo, estilos limitados a Propostas V2)
- `tests/ui_proposals_functional.test.tsx` e `tests/ui_shell_search.test.tsx` (novos)
- `package.json` e `package-lock.json`: dependências de desenvolvimento Testing Library e jsdom; instalação com `--ignore-scripts`
- Documentos de matriz/manifesto, navegação, resultados e [plano de homologação](staging-environment-plan.md).

## Riscos e pendências

1. Paridade do código e testes com mocks não substituem validação do backend, sessão, arquivos e integrações. Não tornar a V2 padrão antes de concluir essa validação.
2. Tabela extensa mantém rolagem interna e opção de cartões; validar ergonomia, densidade e contraste nas resoluções solicitadas com sessão segura.
3. Busca de tarefas exige o endpoint e permissão existentes; erro atualmente resulta em lista vazia. Nenhuma promessa de indexação global de dados não carregados.
4. Instalação informou 15 vulnerabilidades agregadas nas dependências (5 moderadas, 9 altas, 1 crítica). Origem/impacto e comparação com baseline não analisados nesta etapa; não aplicado upgrade automático ou `audit fix --force`.
5. Homologação hospedada exige revisão de limites gratuitos e bloqueios de efeitos externos. Ausência de credenciais, isoladamente, não é suficiente. O plano propõe primeiro ambiente local isolado, sem provisionamento realizado.

Nenhum push, merge, deploy, migration, seed, recurso externo ou operação em banco de produção realizado nesta entrega de Propostas. A autorização posterior permite continuar os módulos sem homologação separada, registrando os fluxos ao vivo como não validados; consultar `progressive-migration.md` para o estado atual.
