# Roteiros bancários INSS

Material fornecido pela empresa em 16/10/2026. Nove roteiros: FACTA, FINANTO, BMG, Daycoval, Banrisul, Paraná, C6, Presença e Safra/Alfa. O texto original está em source-2026-10-16.txt. O catálogo operacional para consulta fica em src/data/bankPlaybooks.json, com banco, versão e recebimento. O catálogo compartilhado exclui o nome da promotora Banrisul e trechos de suporte comercial/comissão de correspondentes.

## Uso

Simulações internas: painel recolhível de roteiros na página e nos formulários INSS/Novo/Port/Refin/Port+Refin. Portal: painel nas simulações INSS. A conferência usa nascimento, espécie, modalidade, prazo, valor quando informado corretamente e UF escolhida explicitamente. Bancos sem API também aparecem. O roteiro não ativa integração, gera proposta, recalcula oferta, substitui a aprovação do banco ou altera regras financeiras das APIs.

O avaliador identifica as restrições inequívocas codificadas (faixas de idade/prazo/teto, UF, suspensões de modalidade, representação e algumas espécies). Todos os demais resultados são POSSIBILIDADE A CONFERIR, nunca APROVADO. Não é um motor de elegibilidade completo: carência, perícia, duração de pensão, origem do contrato, pagas, risco acumulado por CPF, exceções comerciais, conta, documentos e data exata do último vencimento exigem conferência no texto. Nenhuma recusa é enviada ao banco automaticamente a partir desse painel.

## IA

A Sentinela existente ganhou a ferramenta searchBankPlaybooks. Perguntas que mencionam bancos/roteiros/espécies recebem recuperação prévia de trechos. A ferramenta também fica disponível para as demais perguntas de política. As respostas devem citar banco, versão e seção, declarar ausências e não completar regras com conhecimento geral. O provedor Gemini já existente é usado; nenhuma chave ou novo provedor foi instalado.

O portal usa endpoint próprio autenticado por sessão do parceiro, com limite e bloqueio de troca obrigatória de senha. O ator e tenant vêm da sessão; parceiros só podem consultar a ferramenta de roteiros, com bloqueio explícito de ferramentas gerenciais no servidor. A busca textual e o texto completo permanecem disponíveis mesmo quando a IA estiver indisponível. Os textos dos roteiros são dados passivos, nunca instruções do modelo. Não houve chamada real ao modelo nesta implementação.

## Divergências preservadas

- FINANTO: fluxo descreve troco mínimo de 5%/R$100, tabela informa faixas 2%/3%/5%; confirmar regra vigente. Limites de parcela também deixam lacunas nos números 100–101 e 299–300, e a faixa de pagas menciona acima de 41 sem esclarecer exatamente 41.
- Presença: espécie 32 não aparece na relação recebida; não foi adicionada por suposição.
- Daycoval: espécie 18 listada, mas assistenciais são excluídos; tabelas de idade/risco de portabilidade têm sobreposição que exige conferência.
- Safra: 72/78 aparecem na lista permitida e dentro do intervalo 61–79 não permitido. Portabilidade está indicada como bloqueada na versão 193.
- Pensão FACTA: faixas de idade 31–41 e 41–44 se sobrepõem. Preservadas como fonte, sem resolução automática.

As versões recebidas são referência operacional histórica. Não foram confirmadas com os bancos como política vigente em produção. Novos roteiros precisam de revisão de fonte e das condições codificadas antes de substituir versões.

## Verificação desta entrega

19 testes aprovados em seis arquivos: bank_playbooks, bank_playbook_routes, bank_playbooks_ui, sentinela_bank_playbooks, parana_clt e presenca_inss_prefill. Cobrem nove fontes, consulta sem API, limites por idade/modalidade, ressalvas, busca por trecho, ausência de informações comerciais na distribuição, autenticação do portal, tenant fixado na sessão, limitação de ferramentas do parceiro e recuperação de fonte antes da resposta da IA. Gemini e transporte bancário simulados; nenhuma consulta real a banco ou modelo nesta rodada. Checagem TypeScript aprovada.

Build local aprovado (Prisma generate, Vite e esbuild), mantendo aviso já existente de chunks acima de 500 kB. Busca por Enter testada para impedir envio acidental do formulário de proposta. Não foram executados migrations, seeds, consultas bancárias reais nem chamadas ao modelo real. Validação com usuários em produção permanece pendente.

## Revisão pelos PDFs fornecidos em 16/10/2026

FACTA, BMG, Daycoval e Paraná foram substituídos por resumos operacionais conferidos nos PDFs. O texto colado anterior permanece apenas como histórico em source-2026-10-16.txt; não é utilizado pela busca em execução desses quatro bancos. FINANTO, Banrisul, C6, Presença e Safra permanecem na fonte anterior. A lista de arquivos, hashes SHA-256 e contagem de páginas fica em pdf-sources-2026-10-16.json. As páginas citadas contam a capa como página 1, inclusive quando o rodapé interno é diferente. Os PDFs originais não foram modificados.

- FACTA: confirmadas tabelas visuais das páginas 3 e 8; iletrados apenas Novo; SC incluída na exigência física 60+; RS 180 dias qualificado como exceção histórica de 2024; removida afirmação não comprovada de dez arquivos. Linhas antigas de 87/88 na p. 8 não sobrepõem a suspensão explícita da p. 7. A exceção BRB originado FACTA e a lista geral de bancos não portados continuam exigindo conferência.
- BMG: versão real da capa é 21/07/2026, não o nome do arquivo. Espécie 21 exige 28 anos completos. Invalidez 4/5/6/32/33/92: 60+, ou 55–59 com pelo menos quinze anos de concessão; ausência da data exige revisão. Mantidas cinco pagas no Refin com exceção 108x, uma paga na Port, mínimo de troco R$ 50,00 no Refin da Port e formalização física por UF.
- Daycoval: versão 76.0 atualizada em 02/07/2026. Preservadas sobreposições das tabelas e lacuna de 52 anos na invalidez. Acordos de pagas do resumo anterior não aparecem neste PDF e não são tratados como confirmados. Margem de 40% descrita como percentual informado, sem transformar em margem livre.
- Paraná: fonte código 331 sem data de versão expressa na capa. Quadro geral de troco R$ 1,00 não elimina mínimo específico de Refin R$ 100,00 da p. 4; Port+Refin também R$ 100,00. Mantidas ressalvas 33180/33181, idades de término divergentes e exceções da Comunicação de Decisão. Regras específicas de pagas na p. 31 prevalecem como referência sobre menção genérica de doze na p. 26, sujeitas à conferência do acordo.

A IA e os trechos de consulta passam a citar página do PDF, banco, versão e arquivo. Não houve atualização de APIs bancárias, ativação de produtos ou confirmação de vigência junto aos bancos. Dados de exemplo de telas, documentos pessoais, credenciais e nomes de promotoras não foram incorporados aos resumos.

Verificação da revisão PDF: 15 testes aprovados em quatro arquivos (bank_playbooks, bank_playbooks_ui, bank_playbook_routes, sentinela_bank_playbooks); TypeScript e build local aprovados, com o aviso conhecido de chunks acima de 500 kB. Conferência visual das páginas FACTA 3/8, BMG 1/3/5, Daycoval 3 e Paraná 3/4, além da leitura do texto das páginas operacionais relevantes. Dados reais de clientes e chamadas reais aos bancos/modelo não utilizados.
