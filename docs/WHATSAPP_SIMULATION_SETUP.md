# WhatsApp da mesa de simulação

## Infraestrutura pendente

A Oracle do gateway tem 951 MiB de RAM, sem swap e 41 GB de disco livre. Não instalar a composição nesse servidor. O perfil padrão tem orçamento inicial de pelo menos 4 GB. O usuário autorizou uma tentativa experimental em outra Micro dedicada de 1 GB, descrita abaixo; estabilidade nessa memória ainda não está comprovada.

A shape VM.Standard.E2.1.Micro não pode ser redimensionada. Confirmar a shape no painel antes de planejar ampliação. Se for Micro, criar outra instância para a Evolution; o gateway bancário pode continuar no IP atual. Não mover o gateway sem planejar a liberação do novo IP pelos bancos.

Fonte: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/resizinginstances.htm

### Restrição: somente gratuito

O print confirmou `VM.Standard.E2.1.Micro`. Manter o gateway nessa instância e criar a Evolution separadamente em `VM.Standard.A1.Flex` Always Free, Ubuntu ARM64, inicialmente 1 OCPU e 6 GB de RAM, disco de boot 50 GB, na região principal da conta. A imagem oficial da Evolution `latest` oferece linux/arm64 (manifest consultado em 09/10/2026).

Antes de criar, conferir a cota já usada e o custo estimado zero no painel. Não usar shape paga, upgrade de conta nem créditos temporários como substitutos de Always Free. A A1 não tinha capacidade disponível. O usuário criou uma segunda Micro como tentativa experimental.

Na documentação consultada em 09/10/2026, A1 oferece 1.500 OCPU-horas e 9.000 GB-horas gratuitos por mês (equivalentes a 2 OCPUs e 12 GB nas contas Always Free); boot e block volumes somados têm limite de 200 GB por conta. Os recursos existentes contam nessa cota. Não prometer custo zero fora das cotas ou se o fornecedor mudar as condições.

Fonte: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Tentativa experimental: segunda Micro de 1 GB

Instância criada em 09/10/2026: `sentinel-api-whatsapp`, Ubuntu 22.04, Always Free, IP público `150.230.94.155`, privado `10.0.0.113`. Gateway bancário continua em `150.230.86.123`. A Oracle permite até duas Micro dentro das cotas. Confirmar a cota total de discos e custo zero; não aumentar recursos para uma shape paga.

Usar somente um número de WhatsApp. Os limites abaixo são um orçamento experimental, não requisitos oficiais nem evidência de funcionamento: API 512 MiB (heap Node 320 MiB), PostgreSQL 128 MiB e Redis 64 MiB, somados a 2 GiB de swap em disco para picos. O sistema operacional usa memória adicional. Swap não dá o desempenho de RAM.

Os scripts recusam executar quando identificam `/etc/sentinel-gateway` ou a unidade `sentinel-gateway.service`. Copiar esta pasta para `~/sentinel-evolution` no terminal da nova instância. Não copiar um `.env` de outro servidor; gerar chaves próprias.

```bash
cd ~/sentinel-evolution
sudo bash install-dependencies.sh
sudo bash prepare-micro.sh
sudo docker compose -f compose.yaml -f compose.micro.yaml up -d
sudo bash status-micro.sh
```

`install-dependencies.sh` prepara swap e instala Docker pelo repositório oficial assinado, Nginx e Certbot. Não executa containers de demonstração. `prepare-micro.sh` gera segredos e fixa a imagem oficial pelo digest; não inicia containers. `status-micro.sh` mostra RAM, swap, estado, reinícios, OOM e HTTP local, sem imprimir segredos ou mensagens.

**Sempre usar os dois arquivos `-f` no perfil Micro.** `docker compose up -d` sem eles aplicaria os limites maiores do perfil padrão. A API para após três falhas no perfil experimental; depois de corrigir, iniciar novamente com o mesmo comando. Se houver OOM, ciclos de reinício ou swap contínuo com lentidão, interromper a tentativa com `sudo docker compose -f compose.yaml -f compose.micro.yaml stop` e aguardar A1; não promover uma conexão instável para atendimento.

Antes de conectar o número, confirmar API iniciada e estável. Depois acompanhar memória/reinícios durante conexão QR, recepção de mensagens, anexos e resposta da mesa.

Em 09/10/2026, a composição Micro foi instalada por SSH via Tailscale na instância `sentinel-api-whatsapp` (`10.0.0.113`, público `150.230.94.155`). Docker, swap de 2 GB, PostgreSQL, Redis, Nginx e certificado HTTPS foram configurados. O firewall padrão do Ubuntu tinha uma regra INPUT de rejeição: foram acrescentadas somente as portas TCP 80/443, inclusive em `/etc/iptables/rules.v4`, preservando SSH e Tailscale. A conexão real do WhatsApp e a estabilidade sob atendimento ainda dependem da leitura do QR e validação com parceiros.

Usar `CORS_ORIGIN=*` e `CORS_CREDENTIALS=false`: a versão instalada rejeita chamadas sem cabeçalho Origin quando a lista de origens é restrita, incluindo chamadas servidor a servidor. As operações continuam autenticadas pelo cabeçalho `apikey`; CORS não substitui essa autenticação.

DNS `whatsapp.sentinelconsig.com.br` deve apontar para `150.230.94.155`, preservando `gateway.sentinelconsig.com.br`. A mesma sub-rede OCI já possui entrada TCP 80/443; confirmar firewall no novo Ubuntu. Não publicar 8081, 5432 ou 6379.

Fonte Docker: https://docs.docker.com/engine/install/ubuntu/ e https://docs.docker.com/engine/containers/resource_constraints/ .

## Instalação no Ubuntu com pelo menos 4 GB

Os comandos abaixo são para o terminal Ubuntu do servidor da Evolution, não PowerShell. Copiar a pasta `ops/evolution` para `/opt/sentinel-evolution`. A composição usa seu próprio banco, Redis e volumes; não reutiliza o banco do Sentinel.

1. Instalar Docker e Compose conforme a versão do Ubuntu. Verificar `docker compose version`.
2. No DNS autoritativo da Vercel, criar A `whatsapp` apontando para o IP do servidor escolhido. Não modificar o registro `gateway`.
3. Rodar:

```bash
cd /opt/sentinel-evolution
sudo bash prepare.sh
# Conferir SERVER_URL no arquivo .env, preservando as chaves.
sudo docker compose up -d
sudo docker compose ps
```

`prepare.sh` gera dois segredos diferentes sem imprimi-los, preserva `.env` existente e fixa a imagem oficial no digest baixado. Não executar `docker compose down -v`: isso apagaria os volumes.

4. Habilitar somente 80/443 na rede OCI e firewall do servidor. PostgreSQL e Redis não têm portas publicadas; a API só escuta no loopback 8081.
5. Copiar `nginx-http.conf` para `/etc/nginx/sites-available/sentinel-evolution`, habilitar o site e obter TLS:

```bash
sudo ln -s /etc/nginx/sites-available/sentinel-evolution /etc/nginx/sites-enabled/sentinel-evolution
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d whatsapp.sentinelconsig.com.br
```

Se o link já existir, não substituí-lo sem conferir o destino. Não alterar o site do gateway bancário.

## Conexão pelo Sentinel

Após o deploy que aplica a migração `20261009210000_whatsapp_simulation_channel`:

1. Central de Atendimento → WhatsApp do canal de simulação (permissão `integrations.manage`).
2. URL `https://whatsapp.sentinelconsig.com.br`; instância `sentinel-simulacao`.
3. Copiar localmente `AUTHENTICATION_API_KEY` do `.env` para o campo secreto do Sentinel. Não enviar a chave em chat ou logs.
4. Habilitar, salvar e conectar/gerar QR Code. Ler pelo WhatsApp → Aparelhos conectados.
5. Consultar conexão. Se o QR expirar, gerar novamente.

A chave e o segredo do webhook são criptografados no SystemConfig do tenant. `PUBLIC_APP_URL`, se definido no Sentinel, deve ser a origem HTTPS pública da aplicação (padrão `https://sentinelconsig.com.br`). O Sentinel registra o webhook com cabeçalho secreto e o evento MESSAGES_UPSERT.

## Atendimento

- Conversas individuais começam solicitando o código de parceiro. O código deve identificar um único parceiro ativo do mesmo tenant (sem distinção de maiúsculas/minúsculas). Telefone não precisa coincidir com o cadastro; não é alterado no cadastro. A identificação vincula somente esse novo atendimento, sem expor conversas de outros números. Código inválido não cria conversa nem avança para dados do cliente.
- A conversa aparece na mesa após o código ser validado. Após concluir/fechar um atendimento, o próximo contato precisa informar o código novamente. A coleta inicial pendente expira em 24 horas; os eventos recentes são deduplicados e respostas com falha podem ser retomadas pelo webhook.
- Grupos (`@g.us`), transmissões e canais são ignorados antes de procurar identificadores alternativos do remetente. Nenhuma resposta padrão é enviada a esses destinos. Mensagens do próprio número também são ignoradas.
- Apenas perfis `SIMULACAO`, `MASTER`, `GESTOR` e `GERENTE` podem visualizar as conversas da mesa, métricas, mensagens e anexos, ou responder/alterar status. A restrição de departamento também é aplicada no servidor e não pode ser removida por filtros ou permissões personalizadas. Eventos públicos ao tenant não contêm o texto das mensagens; o conteúdo é buscado pelos endpoints autenticados.
- O parceiro escolhe INSS, CONVENIOS PUBLICOS, FGTS ou CLT. CPF é obrigatório em todos; públicos exigem contracheque; FGTS e CLT pedem telefone; admissão somente CLT.
- Contracheque: PDF, JPG ou PNG de até 6 MB, armazenado no banco do Sentinel com download autenticado. Incluir anexos nos backups e na política de retenção de dados.
- A fila “Mesa de simulação” mostra coleta e espera pela mesa. Ao responder, o atendente assume e o bot deixa de pedir dados.
- Resposta da mesa é enviada ao WhatsApp. Falha fica visível na mensagem, com botão Reenviar. Um timeout ambíguo do provedor pode gerar duplicação ao reenviar.
- Após concluir atendimento, a próxima mensagem inicia outra coleta.
- Mensagens e fila consultadas a cada 2 segundos enquanto a aba está visível, com eventos em tempo real e atualização ao retornar à aba. A latência real também depende da API/rede.

## Validação ainda necessária com o número conectado

Percorrer os quatro convênios, anexar contracheque e confirmar resposta da mesa recebida no WhatsApp. Confirmar isolamento de parceiros e reconexão. A instalação e a resposta HTTP da API não comprovam entrega pelo provedor.

Referências da implementação: compose e schemas oficiais no repositório https://github.com/EvolutionAPI/evolution-api .
