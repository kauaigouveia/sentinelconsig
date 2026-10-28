# Revisão operacional CLT multibancos — 27/10/2026

## Escopo e diagnóstico

As correções operacionais anteriores estavam no checkout local `clt-consult-first`, sem publicação. Foram incorporadas à branch `codex/vctex-clt-gateway`, preservando aquele checkout. A produção não é atualizada por este push: o PR exige revisão e autorização de merge/publicação.

A consulta inicial usa os seis dados cadastrais, sem parcela ou prazo. Parâmetros financeiros são exigidos apenas na etapa de cálculo. Não foram alterados schema, migrations, credenciais, regras de crédito ou contratos de outros produtos.

## Comportamento por integração

| Banco | Correção e próxima ação | Limite da evidência |
|---|---|---|
| Nossa Fintech | Ausência confirmada de autorização permite solicitar uma vez por instituição; apresenta o link retornado. Acompanhamento consulta autorização e margem. QI e UY3 preservam resultados independentes. | Chamadas simuladas; validade e assinatura dependem do trabalhador e do banco. |
| FACTA | Distingue OAuth expirado de autorização do cliente. Solicita SMS pelo endpoint existente com nome, CPF, celular e averbador; atualização posterior não reenvia SMS. Matrícula opaca permanece preservada. | HTTP bancário simulado; nenhuma consulta real de cliente. |
| BMG | Reutiliza telefone inicial, mantém estado de SMS pendente e exige código real informado. Após validação, consulta elegibilidade com sessão própria do usuário. | OTP e elegibilidade simulados; nenhum SMS real enviado. |
| V8 | Consulta própria pode ser criada com os seis campos quando ausente. Consulta externa não é adotada. Cartão mantém ações operacionais e indica dados faltantes; autorização continua separada, com evidência do dispositivo e sem aceite fabricado. | Não há chamada real nem comprovação de consentimento pela resposta HTTP isolada. |
| FINANTO | Inelegibilidade confirmada conserva motivo; não é transformada em erro genérico ou repetição infinita. | Não foi inventado endpoint de acompanhamento somente leitura. Quando não disponível, interface conserva o resultado e informa a limitação. |
| VCTEX | Mantém catálogo, configuração administrativa, adapter e transporte exclusivamente Oracle, termo, vínculos, taxas e simulação full previamente implementados. | DNS do gateway corresponde ao IP autorizado; POST sem chave em `/vctex` retornou 404. Rota remota e autenticação VCTEX ainda não homologadas. |

## Persistência, segurança e interface

- Reservas cifradas na estrutura existente, com CAS antes das escritas e escopo de empresa, usuário e conexão. Identificadores de execução fornecidos pelo cliente não permitem reutilizar ofertas de outro usuário.
- Operação incerta não é repetida após timeout. Reservas RUNNING/UNKNOWN não são liberadas automaticamente. Renovação de autorização concluída exige nova execução explícita, ausência confirmada pelo banco e janela técnica mínima de 30 segundos; essa janela não representa validade bancária do termo.
- Histórico consultado no backend, com seleção explícita e somente metadados próprios; dados pessoais continuam no snapshot cifrado. Fechar/reiniciar a tela limpa o formulário sem apagar histórico.
- Acompanhamento centralizado, com intervalos progressivos e cancelamento ao fechar ou trocar empresa. Atualização de status não repete a criação de consulta ou autorização. Cada banco mantém seu resultado independentemente.
- Ofertas reaproveitadas são identificadas. Botões indisponíveis explicam a pendência. BMG usa código explícito; V8 não fabrica aceite; nenhuma proposta é criada automaticamente.

## Verificação e limites

Validação final: **286 testes aprovados, zero reprovados, em 24 arquivos**, sequenciais (`--maxWorkers=1 --no-file-parallelism`) com mocks de APIs e armazenamento. TypeScript (`npm run lint`), build (`npm run build`) e `git diff --check` aprovados. Build usa URLs sintéticas locais inválidas para impedir conexão operacional; executa geração do Prisma Client, sem migrations ou seeds. Avisos existentes de chunks grandes permanecem. Não representa aprovação de toda a suíte histórica do repositório. Fixtures exclusivamente sintéticas. Nenhum teste desta entrega comprova homologação bancária real ou concorrência real entre instâncias de produção; o CAS é coberto por testes transacionais simulados.

A verificação externa Oracle foi somente DNS/HTTP sem credenciais. Não havia perfil SSH autorizado disponível para instalar o serviço dedicado. Não foram alterados IP, firewall, FACTA ou Daycoval. Habilitação operacional e diagnóstico autenticado seguem o procedimento de `vctex-clt-oracle.md`.

Não executar consultas reais de CPF ou criar termos para validar esta entrega sem autorização específica do caso. Não promover o PR à produção automaticamente. Reversão: reverter o commit desta correção em uma branch de revisão, sem apagar histórico/reservas nem alterar o banco.
