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
