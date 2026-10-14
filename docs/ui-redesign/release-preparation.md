# Preparação para lançamento — Sentinel Consig 2.0

14/10/2026. Branch `codex/sentinel-2-proposals-functional`. Apenas commit local autorizado; nenhum merge, push ou deploy executado.

## Base e revisão

`git fetch origin main` confirmou main remota e local em `4e6a348e7aa8b02653560ba15a8acfc43311e83a`. Diff contra main sem alterações em `server.ts`, `server/`, `prisma/`, `src/services/`, `src/lib/`, `src/router/`, `src/context/` e portal do parceiro. App/Header têm alterações de apresentação e seletor que reutiliza o handler original de empresa; nenhum contrato ou fluxo de autenticação foi substituído.

Mudanças adicionais necessárias nesta preparação:

- V2 padrão em produção, sem depender de query/localStorage de desenvolvimento.
- Troca local de apresentação disponível apenas em sessão MASTER/PLATFORM_MASTER. Esse controle é de apresentação, não uma nova autorização de dados/API. Não persiste e reinicia ao trocar usuário/empresa/perfil ou recarregar.
- `VITE_SENTINEL_UI_MODE=legacy` força legado em build de produção e desabilita override; por ser variável Vite, exige novo build, não é rollback global instantâneo.
- `vercel-build` passou de `prisma migrate deploy && npm run build` para `npm run build`.
- `vercel.json` agora fixa `buildCommand: npm run build`, evitando depender do build command inferido/remoto. Rewrites, functions e cron intactos.

`npm run build` executa **prisma generate**, Vite e esbuild; não executa migrations, seed, bootstrap do servidor ou consultas bancárias. Geração do cliente não altera schema/banco. `postinstall` também só gera o cliente. Não executar migrations para este lançamento de interface.

## Testes

271 testes aprovados na bateria completa selecionada de 24 arquivos; após acrescentar a auditoria transitiva de imports, os 11 testes de ativação passaram. Total distinto: 272 casos locais seguros. Typecheck, build local e diff check aprovados. Nenhum banco ou serviço externo real foi usado. O grafo transitivo real de `App.tsx` não alcança fixtures, testes ou galeria. Aviso existente de chunks acima de 500 kB.

| Fluxo crítico | Evidência segura | Limite/bloqueio |
|---|---|---|
| Login/sessão | Componentes de autenticação/contexto/backend sem diff contra main | Login real não executado: sessão persistida/contas de teste não confirmadas |
| Permissões | Perfis e gates de rotas/Propostas/Administração exercitados em testes isolados | Autorização real no backend não validada |
| Empresa | Seletor V2 reutiliza `handleCompanySwitch`; APIs/cache/reload originais; testes de escopo/preferências | POST real de troca de tenant não executado; isolamento real não homologado |
| Navegação | Rotas/aliases intactos; testes de escopo, busca e destinos | Sessão autenticada navegando em produção não testada |
| Cadastro de propostas | Formulário original aberto/cancelado em testes e revisão local, rascunho preservado | Salvar/contratar/importar em produção não executado |

Não declarar aprovação simulada para os fluxos bloqueados. A ativação tem evidência local; prontidão funcional completa para produção não está demonstrada.

## Vercel identificada

Metadados locais `.vercel/repo.json`: projeto **sentinelconsig**, raiz `.`, id `prj_ozZEZhTv77f96I1DlTAwc12LzE59`. Repositório `https://github.com/kauaigouveia/sentinelconsig.git`. A workflow GitHub existente publica imagem de backup e não faz o deploy da aplicação.

Não há CLI Vercel instalada nem conexão MCP Vercel disponível. Não foram lidos segredos, alteradas configurações remotas ou feita vinculação de projeto. **Não verificados remotamente:** branch de produção, install command/custom hooks, variáveis de ambiente e URL/ID do deployment anterior. A configuração de build do repositório está segura, mas overrides de instalação/hook precisam ser conferidos antes do primeiro push que possa disparar publicação.

Documentação primária: [Build command e configuração por vercel.json](https://vercel.com/docs/builds/configure-a-build), [rollback de produção](https://vercel.com/docs/deployments/rollback-production-deployment).

## Procedimento após autorização final

Antes do push: no projeto sentinelconsig, confirmar Production Branch **main**, raiz `.`, saída `dist`, configuração de instalação sem migrations/seeds e registrar o deployment de produção anterior. `VITE_SENTINEL_UI_MODE` ausente ou `v2` ativa V2; conferir que não esteja `legacy` no ambiente Production. Nenhuma necessidade de mudar segredos bancários ou banco.

PowerShell, executar somente após autorização:

```powershell
git switch main
git pull --ff-only origin main
git merge --no-ff codex/sentinel-2-proposals-functional -m "Merge Sentinel Consig 2.0 frontend release"
$sentinelV2Merge = git rev-parse HEAD
git push origin main
```

Se main tiver avançado, revisar o novo diff/conflitos e repetir os checks antes do push. A publicação pela integração Git da Vercel depende da confirmação remota acima; não afirmar que essa integração/branch foi inspecionada. Não disparar deploy CLI adicional para duplicar o deploy Git.

## Rollback

1. **Imediato, individual:** MASTER/PLATFORM_MASTER usa “Premium V2 · voltar ao legado”; APIs e sessão continuam as mesmas. Isso não reverte a interface dos demais usuários.
2. **Imediato, global:** no dashboard Vercel → Deployments, selecionar o deployment anterior de produção registrado e executar Rollback. Reutiliza deployment existente, sem build/migrations. No plano Hobby, o destino precisa ser o deployment de produção imediatamente anterior. URL/ID ainda não conhecido; não inventar comando CLI para um deployment desconhecido.
3. **Global por novo build:** definir `VITE_SENTINEL_UI_MODE=legacy` em Production e reconstruir o mesmo commit. Mantém script seguro e toda a lógica operacional.
4. **Reversão Git**, caso seja necessária: `git revert -m 1 $sentinelV2Merge`. Isso também reverteria a proteção do build! Antes de publicar essa reversão, manter `vercel-build: npm run build` e `buildCommand: npm run build` em package.json/vercel.json, fazer commit dessa proteção e só então push autorizado. Não executar uma reversão que restaure migrations automáticas.

## Gate antes de publicar

A branch será salva em commit local. **Bloqueios para recomendar publicação irrestrita:** login/troca real de empresa/isolamento não homologados; configurações remotas de instalação/branch/deployment anterior ainda não verificadas. Nenhum erro local de build/typecheck/testes detectado. Publicação depende de autorização final e tratamento explícito desses riscos.
