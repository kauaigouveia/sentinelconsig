# SentinelConectaBot — extrato INSS em PDF e simulação pela conversa

Data: 16/11/2026

## Funcionalidade implementada

O fluxo `/start → Portabilidade INSS → Enviar extrato INSS` recebe um documento PDF textual na conversa privada do Telegram de um parceiro **previamente vinculado e ativo**. A conversa executa os seguintes passos:

1. Validar o bot ativo da empresa, vínculo de chat, parceiro ativo e tenant ativo, com proteção contra replay do `message_id`.
2. Confirmar que o documento é PDF e tem no máximo **5 MB**; obter o arquivo pelo `getFile` do Telegram (domínio fixo) com tempo limite, checar magic bytes `%PDF-` e analisar até **20 páginas** em memória.
3. Extrair o extrato por `parseInssStatement`, mesmo parser estrutural já usado no upload do portal. PDFs digitalizados, senha, divergências de benefício, linha ilegível, CPF inválido ou documentos em outro layout são **rejeitados**; **não faz OCR**.
4. Exibir até **13 contratos** encontrados, com o banco, os quatro caracteres finais do número, parcelas em aberto, parcela original e saldo. O nome, CPF, benefício completo e identificador completo de contrato **não são persistidos no estado de simulação do bot**.
5. O parceiro escolhe **até três contratos por vez**, em mensagem como `1,2,4`, e informa, por botões, que possui autorização do titular e se ele é analfabeto.
6. Executar **somente leitura**, usando as planilhas do tenant habilitadas em `SystemConfig` e a mesma `previewPortRefin` do Portal: **Daycoval**, **C6** e **Paraná**. Seleciona a maior cotação positiva de troco dentre as condições calculadas por contrato e por banco; para Daycoval, também avalia pares e a trinca de contratos, conforme os roteiros. Não soma alternativas, não executa contratação nem grava propostas.
7. Enviar resultado em mensagens de no máximo 3850 caracteres, discriminando contrato e parcela original, parcela ajustada pela portabilidade quando calculada, parcela do novo refinanciamento, prazo, taxa e troco estimado. Também informar bancos não cadastrados, desativados ou sem resultado e fornecer link autenticado para a mesa/Portal do Parceiro.

## Segurança, retenção e escopo

- O webhook existente só aceita chats privados, valida o `secret_token` do Telegram e bot ativo. O fluxo também valida novamente o vínculo e a autorização do parceiro/tenant antes de baixar o documento e antes de revelar resultados.
- O bot não faz requisições bancárias novas nem atualiza regras, taxas, índices ou esquema do banco; só calcula com a versão da planilha **já ativa e homologada** por cada empresa. A versão Daycoval de 13/11 não é ativada por esta funcionalidade.
- O documento original é processado em memória. Após a leitura, o estado temporário criptografado contém apenas nascimento, espécie, UF, início do benefício, margem de empréstimo e dados financeiros mínimos dos contratos, com o identificador de origem reduzido aos quatro últimos caracteres. Nenhum CPF, NB completo, nome ou PDF original é persistido nessa etapa.
- A revisão tem TTL de **10 minutos**; é descartada ao cancelar, trocar de menu, concluir o cálculo ou receber nova leitura. O endpoint do cron Telegram foi ampliado para remover sessões antigas com mais de 15 minutos sem atividade. **Esse processo depende da execução do cron externo**, já necessária aos avisos existentes no plano Hobby; sessões abandonadas continuam criptografadas até a limpeza/expiração por nova interação se o cron não estiver ativo. O Telegram mantém seus arquivos segundo as próprias políticas, fora do controle do Sentinel.
- Nenhum campo sensível é incluído em logs, URLs ou resposta HTML da aplicação. Não anexar PDFs reais a logs, issues, repositório ou testes.
- Sem aprovação bancária, pré-contratação ou débito por esse novo fluxo. As simulações **não** são inseridas automaticamente na esteira; o registro de cotações permanece no portal autenticado.

## Limitações declaradas

- **INSS Novo, refinanciamento isolado, CLT e FGTS** continuam com os caminhos de simulação do Portal do Parceiro. O recebimento de PDF pelo bot nesta entrega é específico para **Portabilidade + Refinanciamento INSS**.
- O parser reconhece exclusivamente o layout textual do extrato INSS validado pelo Sentinel; PDFs escaneados ou formatos diversos precisam de fluxo de revisão manual.
- Não foram realizadas consultas reais a bancos, dados de clientes, Telegram de produção, nem importações de planilhas. A composição depende dos critérios efetivamente informados no PDF e das regras/comercialização vigentes.
- O cálculo por PDF usa **108 meses como prazo máximo solicitado**, deixando o motor aplicar os prazos aceitos pelas planilhas homologadas. A comparação exibe a maior cotação calculável por contrato/banco, não todas as tabelas.
- A confirmação de autorização e alfabetização é autodeclarada pelo parceiro; documentos e situações que dependem de provas adicionais exigem a conferência da mesa.
- Os resultados são estimativos e não constituem promessa de aprovação, elegibilidade definitiva ou contratação.
- A latência p95 com uma planilha real e PDF real **ainda não foi homologada**. Recomendado iniciar teste com um PDF textual sem dados de cliente real ou previamente autorizado, verificar tempo de webhook e realizar revisão operacional antes de divulgar a todo o canal.

## Validação realizada

- `npm run lint` (TypeScript): aprovado.
- Testes com **PDF textual sintético real** criado em memória e lido por `pdfjs-dist`: extração de contratos, limites, downloads via URL fixa, minimização de dados.
- Testes do handler real com banco e Bot API simulados: vínculo, seleção, confirmação, limpeza de contexto, prevenção de replay.
- Verificações de segregação multiempresa, roteiros de portabilidade e frontend/Portal preservadas.
- `npm run build`: aprovado; nenhuma migração ou credencial nova.

## Checklist de homologação após deploy

1. Confirmar Vercel `READY` e bot `@SentinelConectaBot` registrado no ambiente/empresa pretendida.
2. Em chat privado de **parceiro já vinculado**, enviar `/start` e escolher `Portabilidade INSS → Enviar extrato INSS`.
3. Enviar um PDF textual de teste, conferir os dados mascarados e escolher `1` ou `1,2,3`, confirmar autorização e alfabetização.
4. Conferir valores com a mesma planilha e mesmo prazo no Sentinel; validar que bancos indisponíveis não geram oferta fictícia.
5. Confirmar o cancelamento de sessão, a expiração após 10 minutos, a ausência de dados do cliente em logs/URLs e o cron de limpeza.
6. Só então divulgar a funcionalidade aos parceiros, com política de privacidade e autorização de tratamento de dados adequada.
