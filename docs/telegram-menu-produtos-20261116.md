# SentinelConectaBot — menu de produtos CLT, FGTS e INSS (16/11/2026)

## Objetivo
Oferecer navegação por produto como no exemplo fornecido pelo usuário, incluindo **INSS Novo, Refinanciamento, Portabilidade Pura e Portabilidade + Refinanciamento**, sem duplicar cálculos financeiros, revelar CPFs ou autorizar simulação sem sessão do parceiro.

## O que está implementado
- O /start e o Menu principal recuperam os vínculos Telegram confirmados e ativos; selecionam automaticamente um único cadastro ou pedem a escolha da empresa/parceiro.
- Menu principal: CLT, FGTS, INSS, Portabilidade INSS, Consultar proposta, Trocar parceiro.
- CLT: Simular bancos habilitados, Consultar proposta, Consultar dados do cliente (abre fluxo CLT de vínculos e margem no portal autenticado, não o cadastro do parceiro).
- FGTS: Simular FGTS e Consultar proposta.
- INSS: Novo INSS, Refinanciamento INSS, Consultar proposta.
- Portabilidade INSS: Portabilidade pura, Portabilidade + Refinanciamento, consultar proposta e entrada informativa de simulação por extrato.
- Cada ação de simular abre a rota HTTPS `/parceiro?tab=simulacoes&product=...&operation=...`. O Portal do Parceiro pré-seleciona o produto e modalidade; a autenticação e as regras de acesso seguem intactas.
- Consultar proposta continua no Telegram, com CPF ou número, limitando registros ao `tenantId` e `partnerId` da sessão vinculada.
- Continua verificando o cadastro de empresa, parceiro ativo, bot ativo e vínculo a cada mensagem.
- Estado do menu permanece criptografado no `SystemConfig` e mensagens de replay seguem rejeitadas pelo ID; transações serializáveis já existentes.
- O bot não processa PDFs ainda. Em vez de baixar, armazenar ou interpretar documentos não homologados, devolve aviso e direciona para o fluxo autorizado.
- Não há chamadas bancárias novas nem gatilhos de contratação. Não há migrations ou novas variáveis de ambiente obrigatórias.

## Limite explícito da entrega
Esta mudança implementa **menus interativos no Telegram** e links diretos para as modalidades no Portal do Parceiro. **Não** implementa motor de cálculo ou download de extratos dentro da conversa, nem simulação nativa de bancos via Telegram. A disponibilidade da cotação depende dos bancos habilitados e vigência dos roteiros.

## Próxima fase sugerida: extrato INSS via bot (não entregue)
- Recebimento somente de PDF em chat privado vinculado e com base legal/consentimento e retenção definidos.
- Conferir assinatura real do PDF, tamanho e limite de páginas, autenticação, parceiro/empresa e deduplicação por mensagem antes de descarregar o documento temporariamente.
- Adaptar o parser textual INSS para o backend em ambiente isolado e aplicar limite de tempo e anti-malware. Não usar o parser browser `readInssStatement` no servidor sem validação.
- Mostrar resumo do NB mascarado, contratos com banco, parcela original, parcela recalculada, refin e troco estimado. Confirmar cada entrada extraída.
- Reutilizar o motor do Sentinel com empresas/roteiros ativos. Seleção de cotações por link autenticado; jamais enviar extrato ou CPF completo por texto e nunca apresentar estimativa como aprovação.
- Revisar LGPD, logs, suporte, volumes, armazenamento e custo operacional antes de habilitar.

## Validação
- TypeScript `npm run lint`, build `npm run build`, 84 testes aprovados em 10 suítes direcionadas, incluindo teste com a função real `handleProposalQuery` e doubles de banco/bot.
- Duas suítes de integração que exigem um PostgreSQL real não foram executáveis no sandbox sem `DATABASE_URL`, **não** são resultados de regressão.
- Não houve mensagem enviada ao bot real e não houve cadastro/modificação de webhook.
- É necessário validar o menu visualmente no Telegram com parceiro vinculado após deploy.
