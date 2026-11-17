# Incidente — importação de extrato INSS em PDF no Telegram

Data: 17/11/2026

## Sintoma

Ao enviar um extrato textual em documento PDF pelo `@SentinelConectaBot`, o bot recebia o arquivo, mas respondia genericamente que não era possível interpretá-lo. O aviso misturava erros de download da API do Telegram, falhas técnicas de leitura do PDF.js e dados realmente divergentes.

Um documento fornecido para diagnóstico foi examinado **somente na área de trabalho**, sem ser incluído no repositório nem nos testes. Ele era um PDF textual válido, sem senha, com uma página, quatro contratos de empréstimo e registros de cartão separados. O conteúdo pôde ser extraído por ferramenta PDF local. Isso **não prova** que PDF.js tenha conseguido processá-lo no ambiente de produção; a homologação ainda é necessária.

Na produção, observou-se uma requisição de webhook com duração próxima de 24 segundos no mesmo período. A resposta antiga engolia a causa técnica, sem registrar o estágio da falha. Não foi possível determinar retrospectivamente se a falha decorreu de download, timeout ou processamento do PDF.js.

## Correções

- Dependência `pdfjs-dist/legacy/build/pdf.worker.mjs` importada explicitamente junto com o leitor no ambiente Node. Isso permite rastrear o arquivo de worker no empacotamento de funções serverless, em vez de depender somente de importações dinâmicas do PDF.js.
- Limite de leitura alterado de 18 para 28 segundos para comportar inicialização fria. Permanecem os limites de arquivo de 5 MB, até 20 páginas e quantidade máxima de linhas e itens.
- Erros separados em `TELEGRAM_DOWNLOAD`, `PDF_READER`, `PDF_CONTENT` e `PDF_TIMEOUT`, com mensagens distintas para o parceiro. Um problema técnico ou de conectividade não declara incorretamente o PDF inválido.
- O log do servidor contém somente um código de etapa, **sem nome, CPF, NB, número de contrato, arquivo, texto extraído, file_id ou token**.
- Documento original continua processado em memória; a confirmação e armazenamento temporário mínimo e criptografado continuam inalterados; não há upload de arquivos pessoais para os testes ou GitHub.
- Nenhuma mudança em cálculos, planilhas, elegibilidade, integração bancária, webhooks, credenciais, banco de dados ou schema Prisma.

## Validação

- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- **36 testes** em 4 suítes específicas: download de URL fixa, validação de PDF, extração de estrutura de 4 contratos com cartões em seção separada, limpeza de estado e diagnóstico seguro.
- **69 testes** em 11 suítes de regressão: permissões, Daycoval, simulações, portabilidade, integração Telegram, portal e frontend.
- A fixture de teste é **100% sintética**, com codificação WinAnsi explícita para reproduzir corretamente os acentos e a tabela de extrato. Não contém informação de clientes reais.
- **Pendente:** reenviar o mesmo PDF em conversa privada de parceiro já vinculado, conferir a apresentação dos quatro contratos, a escolha de até três por comparação e o cálculo apenas com planilhas habilitadas. Caso falhe novamente, o novo código da etapa em log e a mensagem do bot permitirão localizar a causa sem expor dados.

## Instruções para suporte

1. Após deploy READY, selecionar `Portabilidade INSS → Enviar extrato INSS`.
2. Enviar o PDF **como documento**, não imagem/foto.
3. Se surgir **falha de download**, reenviar o mesmo arquivo em alguns instantes.
4. Se surgir **falha de leitura ou timeout**, verificar somente o código `[telegram-pdf] failed stage` no log Vercel, sem copiar documento ou dados do beneficiário para tickets.
5. Se surgir **falha de conteúdo**, comparar o documento no leitor do Portal do Parceiro e revisar as linhas de empréstimo.
