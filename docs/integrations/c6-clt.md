# C6 CLT

Implementada a jornada documentada no manual local manual-de-integracao-APIs-C6Bank.pdf, páginas 48–50: POST generate-liveness com nome/cpf/data_nascimento/telefone opcional e POST authorization/status com cpf. Token no Authorization sem Bearer, Accept específico por rota, host fixado ao domínio de produção documentado, timeout e redirects bloqueados. Link validado apenas para c6consig.com.br e subdomínios, HTTP/HTTPS conforme retorno do manual.

Ativação independente cltEnabled em Integrações > C6. Reutiliza credenciais isoladas por empresa/promotora existentes. Não ativa automaticamente produtos. Interface interna e portal com checagem da sessão e permissão, limitação de chamadas, no-store, sem tokens ou resposta bruta no navegador e sem registros de dados pessoais em logs nesta implementação. Cliente precisa autorizar no link. Estado AUTORIZADO não representa oferta ou aprovação de crédito.

O usuário informa que as simulações aparecem após a autorização. Solicitado exemplo sanitizado para confirmar se são exibidas no link do C6 ou retornadas no JSON. O manual disponível não contém contrato de resposta de ofertas CLT. Não foi inventado endpoint ou adaptada simulação INSS para CLT; importação de ofertas e contratação continuam pendentes dessa confirmação.

Checagem TypeScript aprovada. Sem testes automatizados, consultas reais ao C6 ou geração de autorização para clientes nesta rodada.
