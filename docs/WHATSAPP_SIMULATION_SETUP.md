# WhatsApp da mesa de simulação

## Infraestrutura pendente

A Oracle informada tem 951 MiB de RAM, sem swap e 41 GB de disco livre. Não instalar a composição nessa configuração. O orçamento inicial deste arquivo é uma instância de pelo menos 4 GB; monitorar consumo após conectar o número.

A shape VM.Standard.E2.1.Micro não pode ser redimensionada. Confirmar a shape no painel antes de planejar ampliação. Se for Micro, criar outra instância para a Evolution; o gateway bancário pode continuar no IP atual. Não mover o gateway sem planejar a liberação do novo IP pelos bancos.

Fonte: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/resizinginstances.htm

### Restrição: somente gratuito

O print confirmou `VM.Standard.E2.1.Micro`. Manter o gateway nessa instância e criar a Evolution separadamente em `VM.Standard.A1.Flex` Always Free, Ubuntu ARM64, inicialmente 1 OCPU e 6 GB de RAM, disco de boot 50 GB, na região principal da conta. A imagem oficial da Evolution `latest` oferece linux/arm64 (manifest consultado em 09/10/2026).

Antes de criar, conferir a cota já usada e o custo estimado zero no painel. Não usar shape paga, upgrade de conta nem créditos temporários como substitutos de Always Free. Se faltar capacidade, aguardar disponibilidade de A1 na região principal.

Na documentação consultada em 09/10/2026, A1 oferece 1.500 OCPU-horas e 9.000 GB-horas gratuitos por mês (equivalentes a 2 OCPUs e 12 GB nas contas Always Free); boot e block volumes somados têm limite de 200 GB por conta. Os recursos existentes contam nessa cota. Não prometer custo zero fora das cotas ou se o fornecedor mudar as condições.

Fonte: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

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

- Apenas parceiros ativos identificados de forma única pelo telefone cadastrado são aceitos. Cadastrar DDD; grupos e mensagens do próprio número são ignorados.
- O parceiro escolhe INSS, CONVENIOS PUBLICOS, FGTS ou CLT. CPF é obrigatório em todos; públicos exigem contracheque; FGTS e CLT pedem telefone; admissão somente CLT.
- Contracheque: PDF, JPG ou PNG de até 6 MB, armazenado no banco do Sentinel com download autenticado. Incluir anexos nos backups e na política de retenção de dados.
- A fila “Mesa de simulação” mostra coleta e espera pela mesa. Ao responder, o atendente assume e o bot deixa de pedir dados.
- Resposta da mesa é enviada ao WhatsApp. Falha fica visível na mensagem, com botão Reenviar. Um timeout ambíguo do provedor pode gerar duplicação ao reenviar.
- Após concluir atendimento, a próxima mensagem inicia outra coleta.
- Mensagens e fila consultadas a cada 2 segundos enquanto a aba está visível, com eventos em tempo real e atualização ao retornar à aba. A latência real também depende da API/rede.

## Validação ainda necessária com o número conectado

Percorrer os quatro convênios, anexar contracheque e confirmar resposta da mesa recebida no WhatsApp. Confirmar isolamento de parceiros e reconexão. A compilação local não comprova entrega pelo provedor. Nenhuma instalação remota foi executada nesta etapa.

Referências da implementação: compose e schemas oficiais no repositório https://github.com/EvolutionAPI/evolution-api .
