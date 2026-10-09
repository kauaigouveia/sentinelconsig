# Revisão da portabilidade FACTA — 09/10/2026

Fonte: [Manual CIP INSS v11.0, 19 páginas](https://webservice.facta.com.br/documentacao/assets/Manual-do-WebService-FACTA-v11.0-PORTABILIDADE-CIP-INSS.pdf).

## Consulta de condições

- Páginas 4–5: GET `/proposta/operacoes-disponiveis`, `tipo_operacao=003500`, `produto=D`, `averbador=3`, `convenio=3`, `opcao_valor=2`. Implementado.
- `prazo` corresponde ao refin solicitado; `prazo_restante` pertence ao contrato original. `valor_parcela` e `valor_parcela_original` são separados. `prazo_original` aparece nos exemplos. Implementado.
- Páginas 6–7: listas `tabelas_portabilidade` e `tabelas_refin_portabilidade`. O exemplo tem port de 36 meses a 1,7% e refin de 84 meses a 1,45%. Taxas e prazos das duas etapas não devem ser igualados.
- Página 19: `grupos` identifica tabelas que podem ser combinadas. O retorno real informado pelo usuário contém vários grupos separados por vírgula em uma tabela. A implementação separa esses grupos e combina tabelas com ao menos um grupo preenchido em comum, normalizando caixa e espaços, sem comparação parcial de nomes nem duplicação do mesmo par.
- O manual não documenta filtro de taxa na consulta nem estabelece 84 meses como máximo. A taxa selecionada é um filtro local do refin; sem taxa selecionada todas são consideradas. Não se deve transformar o exemplo de 84 meses numa restrição de prazo.
- O troco é `valor_liquido`; `contrato` é o valor bruto. Implementado sem substituir líquido ausente pelo bruto.
- Página 2: o banco avalia comprometimento de margem com dados Dataprev. A consulta pode ser recusada mesmo com autenticação válida. Respostas com erro são preservadas; esta revisão também preserva a mensagem do banco quando retorna listas vazias sem erro.

## Cadastro e formalização

| Páginas | Etapa | Efeito |
|---|---|---|
| 8–9 | POST `etapa1-simulador` | Grava valores da portabilidade e retorna `id_simulador` |
| 10–11 | POST `etapa1-refin-portabilidade` | Grava refin e contrato de origem; exige banco e contrato de compra |
| 12–15 | POST `etapa2-dados-pessoais` | Grava cliente, benefício, documentos, endereço e pagamento |
| 15–16 | POST `etapa3-proposta-cadastro` | Gera `codigo`, `codigo_refin_port` e URL de formalização |
| 17–18 | POST `envio-link` | Envia mensagem ao cliente |

Esses POSTs gravam registros ou enviam mensagens. A comparação atual consulta condições; não executa esse cadastro. A integração completa de digitação deverá guardar os dois identificadores externos e acompanhar as duas propostas. O gateway atual não libera esses endpoints de cadastro.

## Evidência e limite

Teste de regressão reproduz a combinação do exemplo do manual, mantendo port/refin com taxas distintas e descartando grupo incompatível. Outro teste preserva o motivo do banco em consulta vazia.

No print do usuário, a taxa estava em “Todas as taxas disponíveis”; portanto filtro de taxa não explica aquele resultado. O diagnóstico posterior informou uma tabela de portabilidade com `GP_MAIOR 12 PAGAS 2, GP_MAIOR 12 PAGAS 90, GRUPO 12 PGS 90D` e 52 tabelas de refin nos grupos `GP_MAIOR 12 PAGAS 2` e `GP_MAIOR 12 PAGAS 90`. Isso revelou comparação indevida da lista inteira com um grupo individual. Corrigido com interseção de grupos e teste de regressão baseado nos nomes retornados. A confirmação das ofertas em produção permanece pendente de nova consulta após deploy.
