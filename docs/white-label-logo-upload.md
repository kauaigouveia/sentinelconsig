# White-Label — Upload de logomarca (reparo de rota)

## Causa

Os formulários `src/components/admin/WhiteLabelModal.tsx` e `src/components/saas/PlatformMasterCentral.tsx`
faziam `POST /api/upload/logo`, mas a rota constava apenas em um script legado (`insert_routes.cjs`) que
nunca foi incorporado à aplicação Express de produção. Isso gerava **404 - Endpoint de API não encontrado**.

O script antigo também construía um caminho `logos/{tenantId}/{timestamp}_{arquivo}` na Azure, mas devolvia
uma URL sem o prefixo `{timestamp}_`, o que impediria a leitura correta mesmo após o upload.

## Solução

- A API registra `POST /api/upload/logo` e `GET /api/public/logos/:tenantId/:fileName` em `server.ts`.
- Aceita PNG, JPEG e WebP até 2 MiB, verifica Base64 estrito, MIME e assinatura inicial do arquivo.
- Autoriza somente `MASTER`, `TENANT_ADMIN` ou `PLATFORM_MASTER` com sessão válida.
- Usuários comuns têm seu tenant derivado da sessão, nunca do campo `targetTenantId`; PLATFORM_MASTER pode selecionar um tenant existente.
- Não permite upload para tenants inexistentes ou soft-deletados.
- Gera nome não adivinhável por UUID e devolve a URL exata correspondente ao blob na Azure.
- Leitura pública restrita aos nomes produzidos pela rota, com Content-Type explícito e `nosniff`.
- Falhas da Azure não expõem connection strings nem detalhes internos.
- O modal salva via `PUT /api/whitelabel` e só confirma sucesso depois de resposta HTTP válida, evitando disparos duplicados.

## Infra

O projeto já utiliza `server/services/azureBlobStorage.ts` e as variáveis sensíveis
`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME` e
`AZURE_STORAGE_CONTAINER_NAME` já estão configuradas na Vercel Production e Preview.
Nenhuma credencial foi lida, alterada ou copiada. Nenhum registro DNS ou banco de dados foi modificado.

## Homologação

1. Confirmar build de Preview e testes `tests/white_label_logo_upload.test.ts`.
2. Publicar a PR e confirmar deploy `READY` em produção.
3. Entrar no subdomínio TESTE como MASTER e abrir **Configurações → Personalização White-Label**.
4. Enviar PNG/JPG/WebP de até 2 MiB; conferir prévia e URL `/api/public/logos/{tenantId}/{nome}`.
5. Clicar **Aplicar White-Label**, recarregar a página e confirmar que o cabeçalho preserva a imagem.
6. Tentar outro arquivo inválido: deve retornar mensagem clara, sem alterar imagem anterior.

**Importante:** sem uma imagem de teste e sessão autorizada não é possível verificar
um upload real do Azure apenas pelo build. Os testes usam dependências de armazenamento simuladas
e não escrevem dados de clientes.
