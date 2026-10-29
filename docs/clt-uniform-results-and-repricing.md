# CLT multibancos — margem, condições e dispositivo V8

## Organização da interface

A jornada mantém os cartões operacionais de cada banco. O modelo `cltPresentation` separa consulta/margem de condições de crédito e conserva a resposta de apresentação original em `row`, sem alterar valores do banco. Margem não é tratada como valor liberado.

A seção superior apresenta os dados disponíveis por instituição/vínculo. Campos ausentes são “Não informado”. Não se deduz autorização a partir de uma oferta. A tabela inferior é a apresentação única das condições: prazos e tabelas distintos são preservados; repetições equivalentes são deduplicadas; seleção comparativa limitada a três; ordenação e rolagem horizontal com cabeçalho fixo. IOF, emissão, seguro, total nominal e primeiro vencimento usam somente os campos confirmados dos adapters. CET ausente não é calculado.

Os cartões de ofertas dos componentes embarcados deixam de ser renderizados na jornada compartilhada; seus fluxos independentes continuam disponíveis. FINANTO permanece fora do CLT.

## Novo cálculo por parâmetros

O botão SIMULAR CONDIÇÕES inicia uma execução bancária SIMULATE a partir da consulta própria recuperada. Parcela positiva, prazo zero/todos ou específico e modalidade são validados. O backend revalida os limites oficiais; não confia em margem enviada pelo navegador. R$ 200 permanece R$ 200 quando a margem é R$ 529,93. Respostas que ultrapassam o limite de parcela não são apresentadas como ofertas válidas.

Uma nova combinação de parâmetros possui execução raiz própria, com horário, origem e bancos incluídos. Margens e histórico são preservados, mas ofertas antigas não são copiadas para a nova tabela. Resultados progressivos do servidor continuam entrando após o primeiro frame NDJSON. Retornos tardios de painéis de uma combinação anterior não contaminam os novos resultados. Falha de um banco preserva os retornos dos demais. Reservas persistentes impedem reenvio de POST incerto; não há idempotência baseada somente em memória.

O cálculo não cria termos nem renova autorizações. Leituras de estado/margem podem ser repetidas para conferir validade, sem reiniciar o cadastro ou consentimento.

## Capacidade por instituição

- V8: reutiliza consult_id próprio e autorizado, configurações e prazos retornados. installment_face_value contém a parcela solicitada; não se exige taxa de entrada. Taxa mensal decimal é convertida apenas para exibição.
- FACTA: envia valor_parcela na modalidade correspondente e preserva matrícula/vínculo. Valida o limite da margem oficial antes de pedir condições.
- Nossa QI/UY3: estados independentes; solicitações de cálculo usam o valor informado no campo documentado. Somente autorização confirmada pela API libera margem e condições. Os prazos possíveis dependem das tabelas e do retorno efetivo da API; nenhum campo de prazo não documentado foi inventado.
- VCTEX: reutiliza pré-operação e termo já válidos por usuário, empresa e promotora. Consulta taxas existentes e usa simulate/installments para cada prazo permitido. refresh(..., false) proíbe criar/renovar pré-operação para recalcular. Todo transporte continua pelo gateway Oracle existente.
- BMG: o endpoint CLT implementado consulta ofertas sem receber parcela/valor. Cálculos personalizados são apresentados como não suportados pelo contrato disponível, sem enviar parâmetros inventados. As ofertas e o fluxo SMS/OTP já existentes são preservados.
- Integrações com parâmetros específicos ainda não mapeados no cálculo compartilhado continuam com suas ações próprias e indicação explícita da limitação. Isso não significa que o produto bancário deixou de existir.

## Dispositivo e autorização V8

Fonte documental: https://docs.v8sistema.com/guide/crédito-privado-clt/termo-de-consentimento

A documentação lista consult_id, operationalSystem, deviceModel, deviceName e deviceType. O responsável forneceu evidência de aceitação de descrições PC/Computador Windows; essa evidência foi usada como contrato fornecido pelo usuário, sem realizar nova chamada real no desenvolvimento.

O navegador fornece o sistema/classe de dispositivo e, quando disponível, modelo via Client Hints. Na ausência de modelo, a descrição genérica identifica apenas a classe do ambiente. Windows não é rotulado Windows 11 por suposição. Nome genérico não é tratado como hostname nem identificação de hardware; a auditoria registra esse caráter descritivo.

Quando os campos estão completos e há uma consulta própria WAITING_CONSENT na jornada automática, a autorização é solicitada uma vez. Não há POST automático em novo cálculo financeiro. Rejeição/timeout não dispara repetição automática. O backend mantém validação de sessão, empresa, promotora, propriedade, integração ativa e contrato autorizado. A auditoria mantém humanAcceptanceCollected=false; resposta HTTP 200 não é assinatura do trabalhador. O acompanhamento aguarda confirmação oficial para avançar. Se o ambiente não puder ser identificado legitimamente, os campos faltantes permanecem necessários.

## Evidências e limites

Testes automatizados usam dados sintéticos, transporte simulado e persistência injetada. Cobrem margem/valor liberado, condições distintas e duplicadas, comparação, ordenação, dimensões desktop/mobile, parâmetros 200/529,93, limites inválidos, falhas parciais, NDJSON progressivo, consulta própria, reconhecimento de dispositivos, isolamento e não repetição de autorização.

Isso não equivale a homologação com instituições reais, PostgreSQL real ou coleta de consentimento humano. Nenhuma consulta bancária real foi feita para validar esta alteração. Não houve migrations, seeds, alteração de credenciais, gateways ou configuração de produção.

Publicação: push normal na main após aprovação técnica, conforme o pedido. Reversão: commit de revert e republicação normal; preservar histórico e reservas, sem apagar dados bancários.
