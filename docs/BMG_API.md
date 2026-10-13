# Integração BMG

Fonte: `api_parceiros_consignado_1.yaml`, fornecido pelo usuário.

## Configuração

Integrações → Saúde das APIs → Banco BMG. Cada empresa cadastra ambiente,
usuário de integração, senha, loja, canal, CPF do operador e entidade INSS.
A configuração começa desabilitada no sandbox. As credenciais e a autorização
por SMS ficam criptografadas no servidor e separadas por empresa.

## Fluxos disponíveis

- Autenticação Basic no `/v1/token`, sem usar o endpoint antigo de token.
- Autorização do cliente por SMS: envio, validação e sessão de 30 minutos.
- INSS: consulta de ofertas e condições elegíveis para o benefício informado.
- Refinanciamento/portabilidade: consulta das simulações de ofertas mediante
  contrato e valor desejado, conforme `/v1/ofertas/simulacoes`.
- CLT: elegibilidade e simulações do Crédito do Trabalhador.
- Inclusão CLT pela mesa: seleção da oferta, dados de contato, documento,
  endereço e conta; envio ao BMG após ação explícita do atendente.
- O `idSimulacao` e a inscrição do empregador da inclusão CLT vêm da resposta
  armazenada pelo servidor, vinculada ao CPF e ao usuário autorizado.
- Identificadores numéricos longos são preservados integralmente ao ler e enviar JSON.
- A ADE retornada em `codigoAdesao` é cadastrada no Sentinel com banco, cliente,
  parceiro, valores e prazo da oferta; o acompanhamento de simulações do parceiro
  faz a conciliação com essa proposta.
- Consulta de status e link de formalização usa a ADE cadastrada no Sentinel.
- BMG participa da ordem de exibição de bancos por modalidade e empresa.

## Limites documentados e validação pendente

A inclusão INSS Novo/Refin exige `codigoTabela`, `produto` e outros campos
cujo encadeamento não foi demonstrado no retorno documentado das ofertas.
Não são gerados códigos presumidos para permitir contratação.

A gravação de portabilidade está identificada como “em breve” no YAML e não
é enviada por esta implementação. Consulta de condições não comprova que
a gravação está comercialmente liberada.

A consulta de proposta documenta número, CPF, status e data; não documenta
novos valores financeiros. O status bruto BMG é exibido, sem mapear estados
como APROVADA para pagamento ou conclusão no Sentinel.

Não há reenvio automático de inclusão: um envio sem confirmação fica bloqueado
para evitar propostas duplicadas. Se a ADE foi confirmada e houve falha local,
a mesma ação recupera o cadastro sem criar nova proposta no banco.

Compilação não substitui homologação com credenciais da empresa. Simulação,
inclusão, consulta e formalização ainda precisam de validação com respostas
reais do BMG antes de se considerar a integração completa.
