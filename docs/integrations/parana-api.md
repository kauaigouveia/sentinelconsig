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
