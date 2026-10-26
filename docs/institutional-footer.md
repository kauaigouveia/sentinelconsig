# Rodapé institucional — Sentinel Consig

Branch codex/sentinel-3-footer, baseada na versão publicada da2ed71706ecc38909e2085c8ca83f6287c4fecb. Sem commits FACTA/V8, schema, migrations, credenciais ou configurações Ruflo.

## Implementação

Rodapé compartilhado pelo layout interno autenticado e pelo Portal do Parceiro. Desktop com 36 px; celular com 34 px e menos metadados. Copyright 2026, identificação real do build, data do build quando disponível, nome do acesso, empresa atual, relógio local e alternância pelo ThemeProvider existente. Abaixo de 359 px, o nome da empresa fica oculto para preservar o espaço. Nome e revisão completos ficam disponíveis nos títulos dos elementos. Mantida a ausência do rodapé nos modos imersivos de foco e TV.

O componente participa do fluxo flex, após o main, sem posicionamento absoluto/fixo nem z-index. O conteúdo continua rolável; modais e drawers permanecem nos seus portais/camadas existentes. O rodapé substitui a antiga barra operacional, removendo o indicador fixo de realtime e o contexto de perfil repetido.

Versão: package.json contém 0.0.0, que não é uma versão de release útil. Exibimos a revisão real do build: VERCEL_GIT_COMMIT_SHA validado, ou git rev-parse HEAD no build local. Fontes locais modificadas são marcadas como local; ausência de Git/revisão válida omite a identificação. A data é o instante real da compilação Vite, não uma data de publicação presumida. Nenhuma variável de credencial é serializada; apenas revision e builtAt. Nenhuma consulta backend foi adicionada. O relógio tem um único timer no componente, limpo ao desmontar, e não atualiza a árvore da aplicação.

## Arquivos

- src/components/layout/InstitutionalFooter.tsx: apresentação, contexto recebido e tema/relógio.
- src/components/layout/institutional-footer.css: tokens existentes, responsividade por viewport e largura disponível.
- src/lib/buildMetadata.ts: contrato público de metadados, sem fallback fictício.
- scripts/buildMetadata.ts e vite.config.ts: metadados reais durante o build.
- src/App.tsx e src/components/partner-portal/PartnerPortalLayout.tsx: integração aos layouts autenticados, sem alterar autenticação/RBAC.
- tests/institutional_footer.test.tsx: oito testes de dados, tema persistido, mudança de empresa, relógio/cleanup, ausência de fetch, layout e allowlist dos metadados.

## Validação

Suíte pertinente, um worker e execução sequencial: **175 aprovados e duas falhas preexistentes**. Os oito testes do rodapé passaram novamente após o ajuste final de fallback do nome da empresa. TypeScript aprovado e build completo aprovado; nenhuma migration ou seed faz parte do comando de build.

As mesmas duas falhas foram reproduzidas nesta revisão em um arquivo isolado da main publicada: **64 aprovados e duas falhas**. ui_presentation_scope.test.ts:9 espera família operacional para /roteiros, ausente anteriormente. ui_proposals_functional.test.tsx:334 compara hashes antigos de formulários já divergentes na main. Não foram alterados testes históricos para esconder essas falhas. Relatórios JSON e logs em %LOCALAPPDATA%/SentinelConsig/institutional-footer-20261024.

Browser real com o bundle da aplicação inteira e APIs simuladas em 127.0.0.1:49762, sem banco e com CSP connect-src self. Verificados dashboard, propostas, simulações, clientes, atendimento, kanban, pendências, financeiro, integrações, bancos/promotoras e agenda: rodapé visível, altura ~36 px e sem sobreposição com main. A seleção de empresa A→B no cabeçalho atualizou o rodapé. Tema alternado pelo botão do rodapé atualizou o tema global e sua preferência existente.

Oito capturas reais: interno/portal, desktop/viewport de 390 px, claro/escuro. A versão móvel foi verificada em iframe com largura definida, não em aparelho físico. Evidências e matriz em C:/Users/kauai/.codex/tmp/footer-*.png e footer-visual-matrix.json; não fazem parte do commit. O preview inicial exigiu corrigir a fixture de indicadores SLA (retornava array, quando o frontend exige objeto summary); apenas o harness local foi ajustado, sem alteração da aplicação.

## Limitações e revisão

Não é teste integrado de backend, de autorização real ou de serviços externos. Os testes pertinentes de permissões/segurança existentes foram executados com mocks; a apresentação do rodapé não concede permissões. Não houve escrita de negócio ou banco, migration, merge, push ou deploy. Ruflo indisponível nesta sessão; nenhuma ferramenta global foi usada para substituí-lo.

Revisão React: timer isolado e limpo, nenhum fetch adicional, props de contexto sem duplicar estado, tema existente, botão com nome acessível, contraste por tokens e truncamento com título. Alteração pronta para avaliação visual; as duas falhas preexistentes da suíte permanecem explicitadas. Reversão futura: reverter exclusivamente o commit desta branch; não existe procedimento de banco.
