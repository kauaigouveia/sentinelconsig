# Paraná Banco — consulta e acompanhamento via API

## Configuração

Hub de Integrações → Paraná Banco · API → selecionar a promotora.

Cadastrar ambiente (padrão: Homologação), client_id, client_secret, banco interno Paraná e código do promotor retornado em `codigoDoPromotor`. As informações são exclusivas da empresa/promotora. O segredo é criptografado em SystemConfig com AES-GCM e nunca retornado ao frontend. Não há migration nem alterações nas planilhas Paraná existentes.

Hosts de autenticação fornecidos pelo usuário:

- Produção: `https://api-marketplace.paranabanco.com.br/v1/auth/token`.
- Homologação: `https://api-marketplace-hom.paranabanco.com.br/v1/auth/token`.

Os exemplos adicionais confirmaram o prefixo `/consignado-cartao` para os recursos. URLs são fixas por ambiente, sem host arbitrário ou redirecionamento.

OAuth: POST form-urlencoded com grant_type=client_credentials, scope=openid, client_id e client_secret. Cache de token isolado por tenant/promotora/fingerprint, com validade baseada em `expires_in` menos 30s. O exemplo retorna 300s; o texto que menciona 60 minutos não é usado para estender o token. Não se persiste id_token nem access_token. Requisições enviam X-Client-Id e os recursos também enviam Authorization Bearer.

## Operações entregues

1. Salvar conexão e testar autenticação salva, por ação explícita.
2. Listar `GET /consignado-cartao/v1/propostas`: 1–100 itens, cursor retornado pelo banco e filtros de identificador/status/convênio suportados no backend. A tela oferece número e próxima página. A janela de até sete dias é a disponibilizada pelo banco nesse método; não se inventam parâmetros de data para o GET.
3. Exibir somente registros cujo `codigoDoPromotor` seja igual ao configurado. A listagem não cria clientes/propostas e não atribui parceiros por `usuario` ou código.
4. Atualizar uma proposta já cadastrada: botão no detalhe e integração com “Atualizar propostas via APIs”. O servidor escolhe a promotora do registro, nunca a de um seletor global.
5. Consultar `POST /consignado-cartao/v2/propostas/consultar`, Content-Type application/json-patch+json, usando CPF do cadastro e número da proposta (ou codigoDaProposta se o identificador cadastrado for UUID).
6. Exigir retorno único com mesmo CPF, identificador e código do promotor. Divergências/duplicidades, origem WorkBank/Finanto/Nossa e versão local alterada impedem atualização. Identificadores são tratados como texto.
7. Sincronizar valor liberado para o cliente, valor bruto, parcela, prazo e saldo somente quando retornados; zero é preservado. Valores inválidos bloqueiam a gravação. Não se recalculam taxas ou comissões.
8. Aplicar status somente por mapeamento configurado para Paraná/empresa/promotora, para status ativo com alteração automática permitida. Sem mapeamento, os valores podem atualizar e o status interno é preservado, com aviso na tela. Histórico e identificadores externos/status/data de consulta são persistidos transacionalmente; parceiro, banco, cliente e promotora não são reassociados.

Permissões: integrations.view/manage para configuração; proposals.view para listar; integrations.sync/manage + proposals.view + proposals.update para sincronizar. Configuração/teste exigem integrations.manage. Portal do parceiro e isolamento existentes não são modificados.

## Limites desta entrega

Os exemplos recebidos também descrevem oportunidades, cadastro de clientes/dados bancários, consentimento/SMS, formalização e gestão de webhook. Esses fluxos não são expostos nesta entrega de consulta/acompanhamento; não há chamada a endpoints de contratação, aprovação ou cancelamento. O simulador por planilha não foi substituído por API.

Testes usam somente fetch/Prisma em memória e dados fictícios. Não se enviam os CPFs de exemplo ao banco e não se escrevem dados de teste em produção. Autenticação real, liberação comercial, payloads reais e atualização autenticada ainda dependem da conferência autorizada pela empresa. HTTP 204 significa lista vazia; erros e ausência de resultado não são tratados como sucesso da sincronização.

## Credenciais por ambiente

Homologação e Produção possuem configurações criptografadas independentes por empresa e promotora. Trocar o seletor apenas carrega os campos daquele ambiente e limpa a senha ainda não salva. Uma senha em branco preserva exclusivamente a senha já cadastrada no mesmo ambiente; nunca utiliza a do outro.

“Salvar e usar este ambiente” salva e define a conexão ativa para consultas e sincronizações. O teste de autenticação usa o ambiente exibido sem alterar a conexão ativa. A listagem usa a conexão ativa identificada na tela. Configurações anteriores são preservadas no próprio ambiente, sem migrations. Nenhuma credencial é devolvida ao navegador.

## Novo INSS — oportunidades

Em Simulações → INSS Novo, o painel Paraná consulta POST `/consignado-cartao/v1/oportunidades` com CPF, Bearer e X-Client-Id da conexão ativa da empresa/promotora. A consulta é explícita; não gera contrato, consentimento, SMS ou webhook. Retorna somente ofertas `OfertaNovoInss` principais e secundárias, com ou sem seguro, válidas e com valores positivos, filtradas pelo benefício e espécie informados. Cartões são excluídos. Prazo, parcela e taxa vêm do banco; não há recálculo pelo valor digitado nos outros simuladores.

HTTP 204 é ausência de oferta; 207 é tratado como retorno parcial, sem presumir aprovação. CPF divergente é bloqueado. Dados bancários pessoais do retorno não são enviados à interface. A oferta pode ser salva na esteira existente para a mesa, preservando ID, promotora, ambiente, seguro e validade; oferta vencida é bloqueada. A formalização bancária permanece fora desta integração. Testes locais usam respostas fictícias; validação autenticada real permanece pendente.

## Jornada corrigida de consentimento

O manual fornecido define POST `/v1/inss/beneficio/consentimento` (nome, CPF, telefone de 11 dígitos, enviarSms obrigatoriamente false) para gerar o link e POST `/v1/inss/beneficio/consentimento/ativo` para confirmar tokenAtivo. A consulta de oportunidades agora verifica o aceite no servidor antes de qualquer pedido de oferta. Validade informada pelo banco é respeitada; null não é convertido em prazo inventado. O manual informa processamento agendado entre 22h e 06h.

A tela não oferece seletor nem nomes de promotoras. A jornada consulta automaticamente as conexões Paraná habilitadas da empresa autenticada; não utiliza conexões de outra empresa nem troca credenciais entre ambientes. Cada oferta retém promotora e ambiente de origem internamente. Quando o banco exige autorizações separadas, são apresentados os links retornados pelas conexões, sem presumir que o aceite de uma autorize as demais. Falhas conhecidas mostram causas sanitizadas por código; o erro real HTTP 400 da sessão do usuário ainda precisa ser reconferido após concluir o consentimento.

Happy INSS/CLT foi incorporado como painel na tela comum da respectiva modalidade, preservando as jornadas e endpoints existentes, sem formulários aninhados, sem chamadas bancárias automáticas e respeitando a habilitação atual.
