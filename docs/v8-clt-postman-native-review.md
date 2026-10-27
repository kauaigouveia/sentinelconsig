# V8 CLT — autorização pela API e simulação direta

## Fonte e revisão do fluxo

Em 27/10/2026 o responsável forneceu respostas reais do Postman e confirmou ter consultado a equipe interna do banco sobre o processamento do termo por `/authorize`, sem confirmação adicional do trabalhador na interface. Esta é uma orientação operacional fornecida pelo responsável; não representa uma nova homologação bancária executada pelo Codex.

Esta revisão substitui a interface de assinatura assistida do commit `793b99f`. Não é exigido termo cadastrado, assinatura, checkbox do trabalhador, SMS, OTP, link externo ou aprovação administrativa por consulta para o caminho nativo. O caminho público anterior permanece por compatibilidade e conserva suas verificações próprias.

Não incorporamos ao repositório os documentos, nomes, contatos ou identificadores reais fornecidos. Fixtures usam exclusivamente pessoas e identificadores sintéticos.

## Sequência

1. Sessão autenticada, permissão de simulação, empresa ativa e conexão V8 ativa/habilitada para CLT com suas credenciais existentes.
2. POST `/private-consignment/consult`: documento, gênero, nascimento, nome, e-mail, telefone e provider QI. Reserva persistente anterior ao POST e vínculo consulta/empresa/conexão/documento.
3. Ação **Autorizar consulta V8** no cartão. O operador informa os dados reais do dispositivo que o navegador não disponibiliza. O backend revalida sessão/ator, empresa, vínculo da consulta e estado bancário antes de POST `/private-consignment/consult/{consult_id}/authorize`.
4. Body de autorização exclusivamente `consult_id`, `operationalSystem`, `deviceModel`, `deviceName`, `deviceType`. A auditoria criptografada registra `BANK_API_AUTHORIZATION`, ator, dispositivo, horários e resultado, com `humanAcceptanceCollected: false` e `independentlyVerifiedIdentity: false`. Não fabrica assinatura ou aceite humano. Uma autorização já registrada não gera novo POST, inclusive após atualização do contrato local.
5. Acompanhamento GET paginado, limitado e cancelável ao trocar de contexto. A resposta do POST não é convertida artificialmente em SUCCESS: aguardar o status efetivamente retornado. REJECTED/FAILED interrompem o cálculo. Timeout/incerteza não permite reenvio automático de POST.
6. Em SUCCESS, margem positiva e autorização auditada: consultar `/private-consignment/simulation/configs?provider=QI`, usar configuração/prazos retornados e enviar a simulação direta. Não há parcela fixa ou taxa de entrada. O primeiro clique da jornada não exige parcela; o modo automático deriva a parcela admissível da margem da consulta.
7. POST `/private-consignment/simulation` com `consult_id`, `config_id`, `number_of_installments`, `provider: QI` e **somente** `installment_face_value` **ou** `disbursed_amount`.

Configurações são obtidas novamente no cálculo, sem IDs fixos. A API permanece autoridade sobre vigência e limites adicionais não documentados. A jornada não cria proposta, contratação ou formalização.

## Normalização financeira preservada

| Campo | Significado |
| --- | --- |
| `disbursement_amount` | Valor líquido efetivamente liberado |
| `installment_value` / `number_of_installments` | Parcela / prazo |
| `operation_amount` | Total nominal das parcelas |
| `issue_amount` | Emissão antes do desconto apresentado |
| `iof_amount` | IOF, com alternativa no objeto `disbursement_option` |
| `monthly_interest_rate` | Fração mensal; multiplicação por 100 somente na tela |
| `is_insured` / `insurance_amount` | Seguro e valor, incluindo zero |
| `first_installment_date` | Primeiro vencimento |
| `id_simulation` | Referência bancária |

Provider solicitado QI e retornado CELCOIN são mantidos separados. Não calcular CET a partir da taxa nominal; ausência = **Não informado**. A unidade da taxa em configurações não é presumida nem bloqueia o POST.

## Validação

Testes sintéticos cobrem autorização direta, cinco campos do payload, ausência de assinatura/aceite fabricados, permissões, isolamento de ator/empresa, referência própria, timeout, concorrência, recuperação e normalização financeira. Integrações externas são simuladas.

A persistência é validada somente no cluster PostgreSQL descartável identificado pelo guard (diretório, identidade, porta, usuário e banco), sem migrations. Resultados exatos estão no PR. A falha histórica do seletor Happy/INSS permanece explicitamente identificada, sem alteração no teste ou componente em relação à main.

Resultados desta revisão: regressão ampliada 260/261 aprovada (uma falha histórica Happy/INSS); PostgreSQL/Prisma descartável 12/12; interface final 7/7, incluindo a seleção da consulta após autorização. Os testes de interface se sobrepõem à regressão, não devem ser somados como casos independentes. TypeScript, build frontend/backend e `git diff --check` aprovados. O aviso de chunks grandes no build permanece.

## Limites e próxima validação

Nenhuma chamada bancária real foi executada no desenvolvimento. O teste completo no Sentinel com a API real ainda depende de execução autorizada, caso de teste e acesso operacional válidos. As respostas do Postman comprovam o caminho executado pelo responsável, não todos os cenários do sistema.

Não houve alteração de FACTA, schema, migrations, credenciais ou configurações de produção. Merge e publicação continuam sem autorização. Para reversão, reverter o commit desta revisão em branch de revisão, preservando registros operacionais e auditoria; nenhuma reversão de banco é necessária.
