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
