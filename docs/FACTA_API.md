# FACTA no Sentinel

Revisão do [portal oficial](https://webservice.facta.com.br/documentacao/) em 08/10/2026. Os 15 manuais publicados foram inventariados; os contratos usados nesta integração foram conferidos nos respectivos capítulos de parâmetros e respostas. As cópias de trabalho ficam fora do repositório. Nenhum token de exemplo foi reutilizado.

## Ambientes, autenticação e ativação

- Produção: `https://webservice.facta.com.br`; homologação: `https://webservice-homol.facta.com.br`.
- `GET /gera-token`: Basic com usuário/senha; resposta com `token`, `erro`, `mensagem`. Validade documentada de uma hora. Cache por empresa/usuário/ambiente, renovação antecipada e Bearer nas consultas.
- Credenciais e chamadas ficam no servidor. A empresa ativa **Habilitar nas simulações** e, separadamente, **Varredura automática** na configuração FACTA. As simulações começam desativadas.
- HTTP 200 não basta: `erro:true` é recusa. Mensagens do banco são preservadas. Consultas toleram uma renovação após 401; envio de autorização não é repetido automaticamente.
- Validar credenciais, habilitação comercial dos produtos e liberação do IP do servidor com a FACTA. Homologação não comprova acesso de produção. FGTS é documentado com endereço de produção.

## Produtos implementados

### INSS novo — manual 11.0

`GET /proposta/operacoes-disponiveis`: `produto=D`, `tipo_operacao=13`, `averbador=3`, `convenio=3`, CPF e nascimento em `DD/MM/AAAA`. `opcao_valor=1` usa `valor` do contrato; `opcao_valor=2` usa `valor_parcela`. `prazo` é opcional na API, definido pela seleção no Sentinel.

Retorno `tabelas[]`: `codigoTabela`, `tabela`, `taxa`, `prazo`, `coeficiente`, `contrato`, `parcela`; `valor_liquido` é usado somente quando presente. **Contrato não é valor líquido**. O seletor existente de “valor liberado” significa valor solicitado; a FACTA consulta valor do contrato nesse modo, e o resultado identifica bruto e líquido separadamente.

Filtragem local aplica taxa/prazo escolhidos e restrições explicitamente identificadas no nome da tabela (espécie, invalidez e LOAS/BPC). O método não documenta um parâmetro de espécie. Tabelas de nome genérico não comprovam elegibilidade definitiva: outras validações pertencem à contratação pelo banco.

### INSS refinanciamento — manual 6.0

`GET /proposta/contratos-refinanciamento`: CPF, operação 14, averbador 3, convênio 3. `lista_contratos_refin` é um objeto indexado pelo contrato, com matrícula, parcela, saldo e dados adicionais. O Sentinel mostra apenas contratos do benefício informado e exige seleção explícita e renda.

A consulta de operações usa `tipo_operacao=14`, `valor_renda` e `contratos_refin`. O contrato é revalidado antes do cálculo. Retorno inclui contrato, parcela, saldo e líquido.

### INSS portabilidade e portabilidade com refinanciamento — manual CIP 11.0

Consulta de operações com `tipo_operacao=003500`, parcela de refin, prazo novo, CPF/nascimento, `prazo_restante`, `saldo_devedor`, `valor_parcela_original` e `prazo_original`.

Há duas listas distintas: `tabelas_portabilidade` e `tabelas_refin_portabilidade`. As primeiras refletem o contrato portado; as segundas refletem o refin. Só combinamos tabelas com ao menos um grupo preenchido em comum; listas de `grupos` separadas por vírgula são interpretadas individualmente, normalizando caixa e espaços. Guardamos ambos os códigos. O líquido do refin é o troco; o valor bruto não é usado como substituto. Portabilidade isolada usa a lista de portabilidade e compara seu prazo com as parcelas restantes; não aplica a taxa de refinanciamento à dívida portada. Em Port/Refin, a taxa, o prazo e a parcela enviados vêm dos campos de refinanciamento; a parcela original continua separada. Quando não há oferta, a mensagem distingue ausência de tabelas, benefício incompatível, taxa, prazo ou grupo; taxas e prazos alternativos são informados apenas quando retornados pela API.

### CLT — crédito do trabalhador 9.0 e consulta do trabalhador 2.0

1. Ação explícita de autorização: `POST /solicita-autorizacao-consulta`, formulário URL encoded, `averbador=10010`, nome, CPF, celular formatado e `tipo_envio=SMS`. A assinatura ocorre no canal do banco.
2. Atualização: `GET /consignado-trabalhador/autoriza-consulta?cpf=...`. Lê `dados_trabalhador.dados[]` e valida o CPF retornado.
3. Cada vínculo traz matrícula, CNPJ/nome do empregador, nascimento, admissão, renda, base da margem, margem disponível, elegibilidade e `erro_mensagem`. A interface apresenta campos e restrições legíveis.
4. Operações disponíveis: averbador **10010**, operação 13, convênio 3, nascimento e `valor_renda`; modo por contrato ou parcela e prazo opcional.
5. Para cada condição, consulta `/consignado-trabalhador/analise-politica-credito` com CPF, matrícula, nascimento/admissão, prazo e valor bruto **retornados**. Apenas `aprovado=1` gera oferta. A recusa preserva `mensagem`. Não estimamos contrato para preencher campos obrigatórios da política.

O capítulo da autorização apresenta exemplo com averbador 3, divergente da tabela de parâmetros. Foi adotado **10010**, consistente com o produto CLT. O endpoint opcional `/consignado-trabalhador/consulta-ofertas` não é necessário ao fluxo de consulta e comparação implementado.

### FGTS — manual 11.0 e tabelas 2.0

1. `GET /fgts/saldo?cpf=...`: saldo em `retorno`, períodos `dataRepasse_N` / `valor_N`.
2. `GET /comercial/tabelas-coeficientes?averbador=20095&tipo_operacao=13`: tabelas dinâmicas em `dados[]`, código comercial `CD_TABELA_FF`, código interno `CD_TABELA`, nome `TABELA` e taxa quando preenchida.
3. `POST /fgts/calculo`: JSON com CPF, código comercial da tabela e `parcelas[]`. Mantemos os índices; períodos além da quantidade solicitada recebem zero. Taxa omitida quando não informada pelo catálogo.
4. Oferta exige `permitido=SIM` e `valor_liquido` positivo. Usa `taxa`, `parcelas_selecionadas`, `simulacao_fgts` e nome retornado. Falha de uma tabela não elimina as demais.

## Atualização de propostas — manual 8.0

`GET /proposta/andamento-propostas`: `af` ou filtros de data/movimento/alteração, `pagina`, `quantidade` (máximo 5.000), convênio, averbador e filtros de substabelecido. Datas têm janela máxima de 30 dias; com `consulta_sub=S`, máximo de 10 dias.

Retorno `propostas[]`: AF, proposta, contrato, CPF, `status_proposta`, `status_crivo` e datas. A associação exige mesma empresa, banco FACTA e identificador; CPF sozinho não cria vínculo. Duplicidade e CPF divergente impedem atualização. Consulta individual exige AF correspondente no retorno.

A atualização mantém status bruto, crivo, movimento, histórico e status interno/categoria quando o mapeamento é conhecido. Status desconhecido ou conflitante preserva o interno. AF é identificador, nunca código de recusa. Suspensão judicial e desaverbação após pagamento não são classificadas como pago/integrado.

O worker pagina a descoberta e acompanha por AF as propostas vinculadas ainda pendentes, inclusive antigas. A opção de desativar o worker na empresa prevalece sobre o padrão do ambiente.

Também revisados no manual: ocorrências (`/proposta/consulta-ocorrencias`), consulta do cliente, `/proposta/propostas-atualizadas` (alterações do dia, filtro `data_alteracao`) e cancelamento. Cancelamento e originação são operações externas distintas da atualização e não são executados pelo cálculo.

## Inventário dos demais manuais

| Manual | Contrato identificado | Uso nesta entrega |
| --- | --- | --- |
| INSS cartão benefício 10.0 | Operação 33, averbador 3, renda, CPF/nascimento, valor do contrato; etapas de cadastro/formalização | Revisado; sem nova modalidade de cartão |
| Portabilidade múltipla INSS 1.0, 09/09/2026 | Operação `003600`, `token_tabela=S`, contratos indexados de 1 a 6; retornos e etapas próprias | Revisado; formulário atual comporta um contrato |
| CLT offline 3.0 | `cltoff.facta.com.br`, token próprio, `/clt/base-offline`; histórico com criação/atualização, intervalo de três segundos | Revisado; sem substituir consulta atual por histórico |
| FGTS offline 3.0 | `fgtsoff.facta.com.br`, token exclusivo, `/fgts/base-offline`; duas consultas por segundo, autorização histórica | Revisado; não substitui saldo atual da CEF |
| SIAPE 1.0 | Operação 13, averbador 15, simulação por contrato/parcela, CPF/nascimento e etapas de contratação | Revisado; sem criar modalidade SIAPE |
| Portabilidade SIAPE 1.0 | Averbador 15, fluxo de port/refin com dados da dívida e etapas próprias | Revisado; sem misturar com INSS |
| Métodos complementares 5.0 | `/proposta-combos/`: produto, banco, operação, órgão emissor, averbador, convênio, país/UF/cidade, estado civil, benefício, patrimônio, documento, Pix, gerente | Revisado; catálogos para futura originação |

INSS, refin, CIP, cartão, múltipla, CLT, FGTS e SIAPE têm etapas de cadastro separadas (`etapa1-simulador`, refin da portabilidade quando aplicável, dados pessoais, cadastro da proposta e formalização). Os cálculos desta entrega **não digitam uma proposta nem enviam formalização**. A atualização funciona para propostas FACTA já existentes e vinculadas no Sentinel.

## Verificação e pendências operacionais

Testes com respostas representativas dos manuais cobrem transporte, parâmetros, valores bruto/líquido, grupo de port/refin, benefício dos contratos, recusa CLT, FGTS, isolamento de integrações e vínculo de propostas. Conferir também TypeScript e build.

Falta a validação real em homologação/produção com credenciais desta empresa, autorização efetiva do cliente e IP do servidor liberado. Confirmar especialmente a resposta de elegibilidade CLT, o cálculo FGTS por código comercial sem taxa no catálogo e as combinações de grupos habilitadas comercialmente. Não foram feitas solicitações reais de consentimento nem alterações externas de propostas durante a implementação.
