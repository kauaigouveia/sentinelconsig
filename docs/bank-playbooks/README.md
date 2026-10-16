# Biblioteca de roteiros PDF — substituição em 16/10/2026

A pedido do usuário, removidos os resumos anteriores, as transcrições antigas, o resumo separado de portabilidade, o agrupamento automático de frases e o cadastro antigo de texto da consulta. O catálogo agora contém exatamente os 14 PDFs fornecidos nesta rodada: FACTA, FINANTO, BMG, Daycoval, Banrisul, Paraná, C6, Presença, Safra, iCred, BRB, Digio, Mercantil e VCTEX. Total de 367 páginas.

## Consulta

Cartões por banco, busca por nome, leitor PDF incorporado, navegação por página, zoom/busca nativos do navegador, abertura em outra aba e download. Tabelas, colunas, imagens, observações e páginas são preservadas no próprio PDF. Não são apresentadas novas sínteses de política. Datas dos nomes de arquivo não são tratadas como datas de vigência; a versão deve ser conferida na capa do documento.

PDFs em server/assets/bank-playbooks, fora de public. A rota /api/bank-playbooks/:id/pdf exige sessão interna com simulations.view, identifica os arquivos pelo catálogo fixo e impede caminhos arbitrários. Não há rota de PDF no portal do parceiro. Respostas privadas e sem cache, inline/download e transmissão por stream com suporte a HTTP Range, sem carregar o PDF inteiro em uma resposta JSON. Os PDFs permanecem idênticos aos fornecidos; hashes SHA-256 e contagens em pdf-sources-2026-10-16.json. Capas conferidas visualmente. Assets explicitamente incluídos no pacote da função, sem monitorar build Vercel.

## IA

Índice textual server-side dos PDFs novos, por página, sem inferência de tabelas. Páginas com identificadores de clientes/credenciais detectados foram excluídas do índice; linhas de contato/links são removidas. A consulta do parceiro não usa páginas marcadas como comerciais/de correspondentes. PDFs integrais são de consulta interna. Respostas da IA devem citar banco e página, reconhecer limitações de extração e não reconstruir colunas ou afirmar aprovação. O índice não substitui a leitura visual do documento. Nenhuma chamada real ao modelo nesta implementação.

## Reset

Cadastros antigos BANK_PLAYBOOK_CUSTOM_ não aparecem no catálogo nem na IA. Namespace V2 separado mantém esses registros inativos para recuperação, sem executar exclusão indiscriminada no banco de dados. POST de texto antigo retorna 409. Os arquivos locais originais do usuário não foram apagados ou modificados.

As fórmulas, instituições STR e filtros estruturados das simulações permanecem em seus módulos próprios. A recomendação textual antiga do painel foi retirada; critérios quantitativos novos não são inferidos automaticamente de PDF. Revisões das regras executáveis devem ser feitas com conferência específica das tabelas.

Não foram executadas migrations, seeds, chamadas bancárias reais ou testes automatizados nesta rodada. Validação interativa em produção e leitura financeira de todas as tabelas não são presumidas pela compilação.

Entrega de arquivos grandes baseada em streaming Node, conforme https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions. Validação de deploy não executada.

Checagem TypeScript aprovada; capas dos 14 documentos renderizadas e conferidas. Não houve validação de deploy ou leitura financeira integral das 367 páginas.
