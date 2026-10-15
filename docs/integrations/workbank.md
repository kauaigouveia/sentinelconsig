# WorkBank — extrato e vínculo de agentes

## Escopo entregue

- Hub de Integrações → WorkBank → selecionar promotora.
- Conexão exclusiva por empresa/promotora; login, clientKey e publicKey criptografados em SystemConfig existente. Sem migration.
- Autenticação POST `/api/auth/v1/token`, headers `clientKey`/`publicKey`, JSON `username`.
- Extrato POST `/api/partner/v1/extract`, headers `x-api-key`/`x-api-token`, ação `Extrair`, período `DataOperacao`, datas AAAAMMDD e página.
- O usuário confirmou `https://go-api.workbankvirtual.com.br` para autenticação e extrato. O servidor fixa esse domínio inclusive para configurações antigas, preservando as credenciais. Não há seletores, redirecionamento automático nem tentativa em outro host.
- O token fica somente no servidor, em memória e com expiração. Testar autenticação não retorna o token ao navegador.

## Fluxo

1. Habilitar e salvar a conexão, depois testar a autenticação salva.
2. Consultar o período. Cada página é persistida criptografada e processada em blocos de dez registros, com retomada. O botão de próxima página só é oferecido quando `hasNextPage` indica continuação.
3. Registros recebidos ficam na fila interna, fora de Proposal/Client até a revisão. Sem parceiro vinculado: **Aguardando vínculo do agente**. Com parceiro vinculado: **Aguardando revisão**.
4. Vincular o nome completo de `nmAgente` ao parceiro ativo da mesma empresa/promotora. Só se normalizam caixa e espaços; não há busca parcial, semelhança ou atribuição ao usuário master. Vários nomes podem apontar ao mesmo parceiro.
5. Mapear `DsSituacao` em “Mapeamento de status bancários” para status ativo com alteração automática permitida.
6. Revisar banco habilitado na promotora, produto, convênio e tipo. Confirmar o envio à Produção. CPF e data inválidos, cliente inativo, número já cadastrado ou ausência de permissão retêm a proposta para conferência.
7. Consultas seguintes atualizam somente registros já importados por esta conexão, com o mesmo agente vinculado, CPF, número e origem. Banco/produto/operação divergentes retêm a sincronização. O status e o histórico são gravados juntos.

Não são criados bancos, parceiros, produtos ou status automaticamente. Não há simulação, contratação, envio ao banco ou scheduler: os únicos endpoints externos fornecidos são autenticação e extrato.

## Persistência e segurança

- Registros são deduplicados por empresa + promotora + `idProposta`; número de proposta também respeita a unicidade já existente na Produção. Conflitos não sobrescrevem cadastros de outra origem.
- Fila, credenciais e aliases são criptografados com AES-GCM, derivado do segredo de autenticação já existente. Não se gravam endereço, RG ou token de acesso no extrato persistido.
- Lotes podem ser retomados pelo operador criador por até 24h. A página é removida do lote ao concluir; seus registros reconciliados permanecem na fila. Se fechar a tela durante o processo, é seguro consultar novamente a mesma página/período.
- Vínculos em Produção são preservados sob concorrência por bloqueio transacional do registro e comparação do conteúdo antes da publicação.
- `workbank:source:<proposalId>` identifica a origem sem dados pessoais. A listagem interna recebe apenas o indicador `workbankSource`. O portal continua usando seus DTOs e isolamento existentes.
- Sincronizações diretas FACTA/C6/BMG/Happy/Finanto/Nossa são bloqueadas para propostas WorkBank. O botão geral informa que se deve atualizar o período na aba WorkBank, pois não foi fornecido endpoint de consulta individual.
- Permissões reais: integrações para consultar/configurar/sincronizar; `proposals.view` para fila; `proposals.update` para sincronizar; `integrations.manage` + `proposals.create` para publicar; `clients.create` somente se for necessário criar o cliente.

## Validação

Testes locais com fetch e Prisma simulados cobrem protocolo, criptografia, isolamento, nomes sem correspondência parcial, fila sem criação prematura, repetição da página/lote, permissões HTTP, publicação revisada, duplicidade e bloqueio da API incorreta. A interface também é testada para não autenticar, consultar nem publicar ao abrir a tela.

Nenhuma chamada real à WorkBank, escrita de teste em produção ou migration foi executada. A autenticação real, os dois domínios, os limites comerciais de consulta e a atualização de uma proposta autorizada ainda precisam ser conferidos pela empresa com suas credenciais. Registros inválidos no extrato são contados e não publicados; a correção deve ser feita na origem e o período consultado novamente.
