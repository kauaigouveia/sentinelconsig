# CLT — cadastro único do trabalhador

## Alteração

A primeira etapa multibancos exige CPF, nome, telefone, nascimento em DD/MM/AAAA, e-mail válido e sexo male/female. O empregador permanece opcional. O calendário é validado no frontend e backend, sem presumir idade mínima ou outra elegibilidade bancária. A data é enviada e armazenada como YYYY-MM-DD, sem conversão de fuso.

A consulta inicial continua sendo REFRESH, sem parcela e sem prazo. Os campos mantêm os nomes internos v8BirthDate/v8Email/v8Gender para compatibilidade com o adapter existente, mas são preenchidos apenas na primeira tela. Os dados são guardados no snapshot cifrado de todas as ações e restaurados ao recuperar a execução, com escopo de empresa/usuário. Não são adicionados a logs ou ao armazenamento de dados pessoais do navegador.

No cartão V8 foi removido o formulário expansível de dados adicionais; o botão Criar consulta utiliza o cadastro inicial. Status, acompanhamento, autorização explícita, margem, configurações, simulação e ofertas foram preservados. Não foi adicionada autorização automática, aceite humano presumido ou contratação.

O DTO V8 continua explícito: borrowerDocumentNumber, signerName, signerPhone, birthDate ISO, signerEmail, gender e provider QI. Os três campos adicionais são excluídos do despacho aos demais adapters; BMG e Happy recebem somente os dados compatíveis com seus componentes existentes. FGTS, INSS e seus formulários não foram alterados.

## Recuperação e compatibilidade

Execuções anteriores sem os três novos dados ainda podem ser recuperadas e visualizadas. Para iniciar outra consulta/ação, o formulário pede que o operador complete esses dados na primeira etapa. Nenhuma operação incerta é repetida para corrigir o cadastro. O mecanismo de cifra e a reserva persistente existentes não foram substituídos.

## Validação

- Testes de calendário: datas impossíveis, ano bissexto, datas futuras, máscara e conversão ISO.
- HTTP com serviços bancários simulados: seis dados obrigatórios, ausência de parcela/prazo, snapshot cifrado e recuperação isolada por empresa e usuário.
- Payload V8 exato e ausência dos novos campos nos adapters não compatíveis.
- Interface: seis campos obrigatórios, recuperação preenchida, criação V8 sem inputs pessoais duplicados e preservação das ações operacionais.
- Navegador real local: 1440 e 390 px, claro/escuro, sem overflow horizontal; submissão HTML nativa válida com seis campos e REFRESH sem value/term.
- Regressão ampliada: 279/280 aprovados; uma falha histórica Happy/INSS, com teste e seletor idênticos à main. Os 112 testes focados iniciais são subconjunto da regressão e não devem ser somados.
- Persistência com Prisma/PostgreSQL exclusivamente descartável: 13/13 aprovados, com guard de identidade, diretório, porta, usuário e banco; nenhuma migration ou API bancária real.

Capturas e resultados locais ficam em `%LOCALAPPDATA%/SentinelConsig/clt-central-customer-preview/`. São evidências do componente real com APIs simuladas, não de uma operação bancária real.

## Publicação autorizada

Durante o trabalho, a main avançou para `2f63f62` por merge do PR #2. Sua árvore era idêntica à base local anterior `68d91f6`; a branch foi atualizada por fast-forward, preservando as alterações em andamento. O novo PR deve conter somente este ajuste.

O deployment de produção READY anterior é `dpl_FwbEDNZVb8dDCchrKGotuGKBBUfj`, SHA `2f63f62a6aacaaba5dab3c2e39f44d2893c664e3`. É a referência de rollback. O build existente executa prisma generate, Vite e esbuild, sem migrations ou seeds. Não houve alteração de schema, credenciais, configurações Vercel ou dados operacionais.

Após verificações aprovadas e ausência de novas falhas/conflitos, o PR será integrado preservando o histórico. O SHA publicado, deployment READY e verificações públicas constam na entrega. A homologação bancária real permanece distinta dos testes simulados.

## Reversão

Se necessário, restaurar o deployment READY anterior ou reverter o commit deste ajuste em uma branch de revisão. Não apagar snapshots ou evidências de autorização e não executar operações destrutivas no banco. Nenhuma reversão de schema é necessária.
