# SentinelConectaBot — simulações de CLT, FGTS e INSS sem abrir o Portal

**Data da implementação:** 16/11/2026  
**Versão:** `feat/telegram-native-all-product-simulations-20261116`

## Objetivo

Substituir links repetidos para `/parceiro?tab=simulacoes` por um assistente de preenchimento de dados **dentro da conversa privada do Telegram**. O bot utiliza exatamente `PartnerSimulationService.run`, `ProductSimulationService.run` e seus bancos já configurados, não possui fórmulas financeiras paralelas.

## Modalidades nativas no chat

| Produto | Modalidades | Entradas |
|---|---|---|
| Consignado CLT | Simular bancos disponíveis | CPF, nome, telefone, critério (parcela/valor líquido), valor |
| FGTS | Saque-aniversário | CPF, número de saques (1 a 10) |
| INSS | Novo e Refinanciamento | CPF, nascimento, NB, espécie, UF, início do benefício opcional, nome/telefone opcionais, modo de simulação, valor, prazo, alfabetização, renda opcional; contrato C6 opcional para refinanciamento |
| INSS | Portabilidade pura e Portabilidade + Refin | Os campos do INSS, banco e contrato de origem, saldo devedor, parcelas originais, prazo original/restante, refinanciamento quando aplicável; tudo por mensagens |
| INSS | Portabilidade + Refin por extrato | Mantido o envio de PDF textual em `Portabilidade INSS → Enviar extrato INSS` com seleção de 1 a 3 contratos |

Os formulários solicitam **uma informação por vez**, validam CPF e valores monetários, exibem um resumo **com CPF e NB mascarados** e exigem toque explícito em **Confirmar simulação** antes de consultar os bancos.

O usuário pode cancelar pelo Menu principal a qualquer momento.

## Motor financeiro e resultado

- O trabalho roda **fora da transação** que grava o estado do chatbot.
- A sessão criptografada AES-256-GCM guarda temporariamente os valores informados (incluindo CPF), exclusivamente por parceiro/chat e expira **10 minutos após a última resposta válida**. Após a confirmação o estado da simulação é eliminado da sessão do chat. A limpeza de estados abandonados usa o mecanismo de expurgo já existente.
- O bot confere o vínculo, a empresa e o parceiro ativo **antes de consultar os bancos e antes de entregar a resposta**.
- A consulta passa por `PartnerSimulationService.run(prisma,tenantId,input,'SIMULATE')`; o serviço preserva as políticas, roteiros e integrações do Sentinel.
- As propostas **não são contratadas**. Se houver cotações positivas, `PartnerSimulationTracking.record` salva o resultado no histórico da empresa/parceiro, com o mesmo prazo e tentativa idempotente usada no portal. O registro não significa aprovação bancária.
- Responde por banco com a **melhor condição positiva**, discriminando **valor de crédito ou troco**, parcela, prazo e taxa quando retornados.
- Pendências bancárias (autorização, elegibilidade, biometria etc.) são destacadas, sem revelar erros brutos ou documentos recebidos do banco.
- Mensagens omitidas dos resultados: CPF, nome, telefone, número integral de benefício, credenciais, resposta bancária bruta.
- Limite automático: **10 confirmações de simulações por parceiro/empresa a cada 15 minutos**, com atualização transacional no PostgreSQL, além da proteção existente contra repetição de `message_id`.

## Considerações de segurança e LGPD

- **O Telegram não é um canal com criptografia ponta a ponta para chats com bots.** A operação requer informação ao titular, base legal adequada para a consulta, minimização de dados e política de retenção. O próprio histórico de mensagens do Telegram e o provedor do serviço podem reter mensagens, mesmo quando o estado da aplicação é excluído.
- O parceiro precisa estar previamente vinculado ao chatbot pelo Portal, e a aplicação comprova o vínculo e status ativo em cada consulta.
- A confirmação do bot declara que o parceiro tem autorização do cliente para consultar as instituições; isso não substitui a autorização/bioidentificação exigida pelos bancos.
- Algumas integrações precisam de consentimento **do próprio banco**, e podem retornar `PENDING` em vez de oferta. O bot **não força** consentimento, SMS nem contratação.
- A conta Telegram vinculada ao parceiro não identifica automaticamente qual usuário individual do portal seria o responsável pelo banco BMG. O fluxo não finge possuir uma credencial de usuário nem cria acesso bancário não autorizado; bancos que exigem esse vínculo podem precisar de validação pela mesa ou pelo portal.
- Não houve alterações em credenciais bancárias, webhooks, tokens, schema Prisma, migrações, regras de cálculo ou modelos Daycoval.
- A consulta de dados cadastrais/vínculos do trabalhador **fora da simulação** ainda depende do fluxo próprio das instituições. O menu de consulta CLT não fornece, por si só, um extrato completo de vínculos diretamente no Telegram.
- **Limite operacional:** a Vercel utiliza funções com duração finita (projeto configurado em até 60 segundos). Alguns bancos podem exigir autorização, estar indisponíveis ou exceder o tempo de consulta. Esta versão não implementa fila durável/retries de bancos. Não foi realizado teste com contas bancárias reais ou documentos reais; o fluxo deve ser homologado com parceiro vinculado após a publicação.

## Testes e revisão

- `npm run lint`: TypeScript aprovado.
- `npm run build`: aprovado.
- **32 testes** em 4 suítes específicas: formulários por produto, CPF e dados inválidos, valor/parcela, contexto/empresa, menu, autorização, limite de consultas e PDF.
- **166 testes de regressão** em 15 suítes adicionais: CLT, FGTS, INSS, portabilidade, segurança multiempresa, frontend e Portal do Parceiro.
- Os bancos e respostas nos testes foram simulados; **não** houve consulta a cliente ou conta bancária real, nem contratação real.

## Homologação após deploy

1. No bot `@SentinelConectaBot`, em chat privado de parceiro já vinculado, executar `/start`.
2. Selecionar `CLT → Simular todos os bancos`, informar dados fictícios em ambiente de teste ou dados autorizados, escolher `PARCELA` ou `VALOR` e confirmar.
3. Conferir banco, parcela, valor/troco, pendências e histórico; comparar com **os mesmos parâmetros** no Portal.
4. Repetir para `FGTS`, `INSS → Novo`, `INSS → Refinanciamento`, `Portabilidade → Portabilidade pura` e `Portabilidade + Refinanciamento`.
5. Verificar que sem vínculo, sem confirmação, com CPF inválido, com sessão cancelada ou com limite de consultas, **nenhuma chamada bancária ocorre**.
6. Confirmar que erros bancários não expõem tokens, CPF ou resposta bruta; testar a duração e a limpeza das sessões.
