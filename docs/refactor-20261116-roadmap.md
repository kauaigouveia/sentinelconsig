# Sentinel Consig — refatoração orientada à operação

Início: 16/11/2026. Base auditada: commit `f9509d9a7e28fee54b974ceb6c17b4e995debb1c`.

## Intenção
O usuário solicitou recriar a experiência, mantendo capacidades existentes, retirando redundâncias e tornando o sistema compreensível. A publicação deve ser incremental e reversível: não há justificativa para reescrever simultaneamente integrações financeiras, autorização multiempresa e interface.

## Inventário verificado na base
- 1.262 arquivos Git; 305 arquivos sob `src/`, 186 sob `tests/`, 168 em `server/` (inclui materiais bancários).
- `server.ts` ~848 KB; `src/services/storageService.ts` ~253 KB; `src/components/simulation/SimulationView.tsx` ~159 KB; `src/App.tsx` ~43 KB.
- React 19 + Vite 6 + TypeScript, Express, Prisma/Postgres; centenas de rotinas de testes estão presentes, mas não foram reexecutadas nesta fase.
- `APP_ROUTES` centraliza aliases e RBAC; `WorkbenchNavigation` e `visibleNavigation` centralizam a apresentação; o portal do parceiro é isolado da navegação interna.
- A UI ativa usa `newUI = true`. Há redesigns prévios com validações documentadas, inclusive alterações recentes no mesmo dia. Não apagar componentes porque parecem duplicados antes de mapear dependências.

## Entrega 1 — orientação sem perda funcional
- Agrupar a navegação em **Meu dia, Operação, Relacionamento, Gestão, Configurações e Plataforma**; manter todos os caminhos e IDs de tela.
- Adicionar **Todas as telas**, mapa completo por área, com descrição funcional, só de rotas autorizadas.
- Mostrar seis atalhos da área atual e preservar o restante no mapa. Não confundir ocultação visual com remoção de permissão.
- Preservar o reconhecimento de aliases antigos e URLs profundas, teclado, menu móvel e links nativos.
- Não alterar autenticação, tenant, cálculos, integrações, API, schema, migrations ou regras de produção.

## Redundâncias candidatas (pendentes de prova)
1. Grandes orquestradores (`server.ts`, `storageService.ts`, `SimulationView.tsx`): dividir por domínio depois de caracterização, não por tamanho somente.
2. Camadas visuais de gerações diferentes: unificar primitivas depois de mapear chamadas e props para evitar quebra silenciosa.
3. Fluxos de atendimento, proposta, pendência e esteira: desenhar jornadas de trabalho e eliminar *passos* repetidos antes de excluir telas.
4. Busca/paletas e variantes de dashboard: identificar consumidores, separar comportamento de apresentação e remover somente implementações sem dependentes.
5. CSS e tokens históricos: estabelecer uma única camada de design por tema e tenant; a marca da empresa prevalece nas superfícies autorizadas.

## Gates antes de cada publicação
- `npm run lint`, `npm run build` e Vitest com testes de acesso, navegação e fluxos alterados.
- Testes de não regressão de isolamento entre empresas, permissões, sessão e portal de parceiros.
- Revisão desktop e mobile com dados fictícios e acessibilidade de teclado.
- Nenhuma migração ou ação externa bancária sem ensaio isolado. Publicar usando fast-forward, jamais `force`.

## Próximas entregas estruturais
1. **Propostas + Esteira + Pendências:** jornada única com estado claro e ações contextuais, respeitando eventos de auditoria.
2. **Simulações:** seleção guiada de convênio/produto/bancos, resultados uniformes e regras explicáveis sem alterar cálculos.
3. **Clientes/Parceiros/Atendimento:** visão contextual e redução de duplicações entre cadastros, CRM e suporte.
4. **Gestão/BI/Financeiro:** painéis por papel, métricas com fonte e corte temporal explícitos.
5. **Administração/Integrações:** configurações em hierarquia, permissões por tenant, monitoramento de bancos e gestão de credenciais.
6. **Infraestrutura:** extrair o monólito por fronteiras de serviço somente com testes de contrato e observabilidade.

**Escopo comprovado:** esta primeira entrega é a reorganização da navegação, não a refatoração completa do sistema. Inspeção de arquivos não substitui testes operacionais ou homologação.

## Verificação executada em 16/11/2026 (entrega 1)

- Checkout isolado do commit `d43677a992ce944f3cac3465fa1642425713618d`, usando sandbox temporário sem credenciais de produção.
- `npm ci`: concluído.
- `npm run lint` (`tsc --noEmit`): aprovado.
- Três suítes de navegação e busca: **12/12 testes aprovados**.
- Doze suítes de regressão UI: **181 aprovados, 26 falhas**.
- Os **mesmos 26 testes falham na base original** `f9509d9a7e28fee54b974ceb6c17b4e995debb1c`: 25 testes de paridade estática (`ui_remaining_modules`) e 1 teste de propostas (`ui_proposals_functional`). Comparação com base realizada no mesmo sandbox e dependências. Nenhuma falha adicional demonstrada na refatoração.
- Build Vite/Prisma/Express na Vercel: **READY**, preview do commit `d43677a`.
- Não foram executados testes com sessões reais, instituições bancárias, produção, migrações ou dados de clientes. Falhas legadas devem ser investigadas e corrigidas, não apagadas do gate para lotes futuros.
