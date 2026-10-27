# V8 CLT — contrato comprovado e autorização nativa

## Evidência e escopo

Em 27/10/2026 o responsável forneceu evidência de HTTP 200 no Postman para autorização e simulação direta. Os identificadores de cliente, consulta, configuração e simulação dessa evidência não foram incorporados ao repositório. Os testes reproduzem os valores financeiros com identificadores e pessoas sintéticas. Não executamos chamadas bancárias nesta implementação.

Contrato documental complementar:

- https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento
- https://docs.v8sistema.com/guide/crédito-privado-clt/simulação-crédito-clt

## Fluxo implementado

1. A sessão existente valida permissão de simulação e empresa ativa. A conexão V8 deve estar ativa, habilitada para CLT e possuir credenciais existentes.
2. Criação de consulta própria com reserva persistente antes do POST. A consulta fica vinculada à empresa, conexão e documento em armazenamento criptografado.
3. No cartão V8, apresentar o termo oficial vigente configurado. O operador entrega os controles ao trabalhador, que informa o nome, assina e aceita explicitamente. O dispositivo real é informado; o User-Agent é observado pelo backend e somente seu hash integra a auditoria.
4. O backend verifica desafio assinado, prazo, sessão, empresa, versão/hash do termo, assinatura e vínculo da consulta; registra evidência criptografada antes do POST `/private-consignment/consult/{consult_id}/authorize`. Reserva distribuída impede reenvio após resultado incerto.
5. O acompanhamento consulta somente GET, com intervalo de oito segundos, limite por etapa e cancelamento na troca de contexto. SUCCESS elegível permite calcular uma vez; REJECTED e FAILED encerram o acompanhamento.
6. Revalidar SUCCESS, consentimento auditado, margem positiva e configurações retornadas pela API no momento do cálculo. Usar os IDs e prazos retornados, sem tabela fixa, taxa de entrada ou valor de parcela fixo. A API continua sendo a autoridade sobre vigência e limites adicionais que não estejam descritos no contrato disponível.
7. O payload final contém `consult_id`, `config_id`, **somente** `installment_face_value` **ou** `disbursed_amount`, `number_of_installments` e `provider: QI`. O modo automático deriva a parcela admissível da margem retornada; o primeiro clique não exige parcela.

Não há contratação, criação de proposta ou aceite automático. SMS, OTP e link externo não são requisitos do caminho nativo. O caminho público anterior permanece por compatibilidade, com sua própria verificação de identidade.

## Normalização financeira

| Campo V8 | Uso |
| --- | --- |
| `disbursement_amount` | Valor líquido liberado, sem substituição por emissão ou alias |
| `installment_value` / `number_of_installments` | Parcela mensal / prazo |
| `operation_amount` | Total nominal das parcelas |
| `issue_amount` | Emissão antes do desconto apresentado |
| `iof_amount` | IOF; alternativa documentada no objeto `disbursement_option` |
| `monthly_interest_rate` | Fração mensal preservada; multiplicação por 100 apenas na apresentação |
| `first_installment_date` | Primeiro vencimento |
| `is_insured` / `insurance_amount` | Indicador / valor do seguro, incluindo zero |
| `id_simulation` | Referência bancária da oferta |
| provider solicitado / retornado | Campos separados, inclusive QI / CELCOIN |

CET ausente aparece como **Não informado**. Não é deduzido da taxa nominal. A unidade de taxa em configurações continua identificada como não confirmada; isso não bloqueia a requisição e não é usada em cálculo.

## Pendência documental delimitada

Não foi fornecido o texto oficial vigente nem confirmação de que a instituição aceita a evidência de assinatura assistida adotada. A apresentação do termo e esse método precisam ser configurados e referenciados uma vez por conexão. Não existe aprovação administrativa adicional por consulta elegível.

O fluxo assistido registra o ato declarado do trabalhador, mas **não comprova independentemente sua identidade** nem impede materialmente a personificação pelo operador. Essa limitação é registrada na própria auditoria (`independentlyVerifiedIdentity: false`). Não deve ser apresentado como autenticação biométrica ou identidade bancária verificada. Se a V8 exigir evidência diferente, somente `/authorize` permanece indisponível até atender o contrato; não se inventam exigências ou atestados.

Consultas SUCCESS sem evidência auditável no Sentinel permitem observação de consulta, margem e configurações, mas não habilitam POST financeiro. O HTTP 200 obtido externamente não importa um consentimento automaticamente.

## Validação e limites operacionais

Testes de contrato e interface usam mocks de banco, dados sintéticos e nenhum serviço financeiro real. A suíte de persistência opt-in usa exclusivamente o cluster PostgreSQL descartável identificado por guard (identidade, diretório, porta, usuário e banco).

- Regressão ampliada: 254 testes, 253 aprovados e uma falha histórica no seletor Happy/INSS (`happy_embedded.test.tsx`, expectativa “INSS Novo”). Teste e componente do seletor permanecem idênticos à main; nenhuma nova falha.
- Subconjunto focado de contrato, consentimento e interface: 118/118 aprovados (contido na regressão; não somar os totais).
- Persistência com Prisma/PostgreSQL real descartável: 11/11 aprovados, com chamadas bancárias simuladas.
- TypeScript, build frontend/backend e `git diff --check` aprovados. O build mantém o aviso de chunks grandes.
- Homologação bancária executada pelo Codex: nenhuma. A evidência Postman é fornecida pelo responsável, não uma chamada realizada por esta suíte.

Não houve alteração de schema, migration, credencial, configuração de produção ou FACTA. O commit é destinado somente à branch de revisão; merge e publicação não estão autorizados.

Para reversão do pacote, reverter seu commit em uma branch de revisão. Não apagar registros operacionais ou evidências de consentimento. Nenhuma reversão de banco é necessária.
