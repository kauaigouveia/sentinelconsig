# Simulações no Portal do Parceiro

## Regras

- O portal consulta as integrações habilitadas e configuradas do próprio tenant: FACTA, FINANTO, Nossa Fintech e Happy, conforme os produtos e modalidades suportados pelos serviços existentes.
- Uma consulta com pelo menos uma oferta de valor líquido positivo gera um registro automático em Simulações efetuadas. Todas as ofertas positivas da consulta ficam no mesmo registro; a maior é exibida como referência.
- Código do parceiro e operador do portal são obtidos da sessão. O parceiro acessa somente seu histórico.
- Cada consulta possui um identificador para evitar duplicação por reenvio. Consultas novas são novos registros, inclusive para o mesmo cliente.
- O prazo é de cinco dias úteis, de segunda a sexta, no mesmo horário em America/Bahia. Feriados não são descontados nesta versão.
- A associação automática exige mesmo tenant, parceiro, CPF, produto, modalidade, banco, prazo e condições financeiras. Tolerâncias: R$ 0,05 na parcela e R$ 1 no valor liberado. FGTS não exige parcela mensal. Uma ADE converte apenas uma consulta, a mais recente compatível.
- Se as condições digitadas mudarem, a mesa pode vincular manualmente uma ADE cadastrada para o mesmo cliente e parceiro.
- A simulação convertida exibe DIGITADA e o número da ADE. Após o prazo sem digitação, passa para OFERTA PERDIDA. Digitação posterior converte a oferta e preserva o indicador de atraso.
- O relatório em Simulações / Análises agrupa consultas pelo mês de criação e parceiro. Inclui digitadas, perdidas, aguardando, atraso, conversão e exportação CSV. Digitação posterior atualiza o mês original da consulta.

## Implantação

1. Publicar o código e aplicar a migração `20261009190000_partner_simulation_tracking`. O script `vercel-build` já executa `prisma migrate deploy`.
2. Configurar `CRON_SECRET` na Vercel, ambiente Production, e publicar novamente se a variável for adicionada depois. Não usar prefixo `VITE_` nem compartilhar esse segredo com parceiros.
3. `vercel.json` agenda GET `/api/cron/partner-simulations` diariamente às 03:00 UTC (00:00 Bahia). O endpoint exige Bearer CRON_SECRET e falha fechado se não configurado. As leituras do histórico/relatório também reconciliam as simulações, assim como cadastro e atualização de propostas.
4. Confirmar em produção uma consulta pelo portal e uma ADE correspondente. Compilação local não confirma credenciais, permissões bancárias nem execução do cron na Vercel.

As exigências específicas dos bancos continuam válidas: autorização do cliente, IN100, seleção de vínculo, plano Happy quando necessário e contrato de refinanciamento FACTA. Funcionalidades não suportadas pelo serviço de cada banco não são presumidas.

Referência: [segurança e gerenciamento de cron na Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
