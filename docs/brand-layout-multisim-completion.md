# Marca, navegação e multissimulação INSS

## Marca
As imagens JPG fornecidas pelo responsável são as referências oficiais. Recortes PNG com alpha preparados com image_gen, preservando símbolo SC, lettering, proporções e versões clara/escura. Originais não modificados. Fundo do login e banner copiados integralmente. Inventário, dimensões, hashes e instruções de extração: `sentinel-brand-v5-assets.json`.

BrandLogo centraliza a escolha visual por tema. Tamanhos proporcionais: assinatura de login260×96, assinatura do menu152×54; símbolo em áreas compactas. `object-fit:contain` evita deformação. O favicon tem URL versionada para evitar reaproveitamento do ícone anterior. Logos e favicons próprios dos tenants continuam tendo prioridade; nenhum cadastro de empresa foi alterado.

## Layout
Todos os grupos permitidos do menu permanecem abertos após navegar, pesquisar ou trocar de empresa. Continuam existindo recolhimento do menu inteiro e comportamento móvel. Não se ampliam permissões nem se adicionam destinos.

Controles do cabeçalho usam altura comum de36px no desktop e44px no móvel, em vez de controles com alturas do cabeçalho inteiro. Busca, perfil, tema, status e notificações mantêm suas funções. Breadcrumb remove o segundo “Início” quando o roteiro já o fornece.

## Multissimulação
O trabalho de até13 contratos estava no checkout anterior, fora da publicação da paleta. Foi integrado à jornada existente e ganhou botão explícito “Multissimulação INSS”. O parceiro/operador preenche o cliente uma vez, adiciona contratos e recebe resultados por contrato e instituição.

Caminhos individuais reutilizados: Daycoval, C6 e Paraná por planilha; Nossa Fintech, FACTA e FINANTO pelas integrações existentes. Indisponibilidade de uma instituição não impede as demais. Nenhuma fórmula ou taxa foi inventada. Não há contratação ou proposta automática.

Unificações Daycoval de dois ou três contratos são opcionais e calculadas por planilha. Para13 contratos são364 alternativas, paginadas em blocos de35. Elas são alternativas sobrepostas, não ofertas somáveis, e ficam marcadas para revisão. A avaliação documental é aplicada separadamente a cada contrato. O endpoint reutiliza autenticação, permissão `simulations.create` e tenant da sessão. O orçamento de leitura dos cálculos comporta13 contratos; limites de upload e alteração das planilhas permanecem preservados.

Fila de contratos, campos e resultados são limpos ao trocar de usuário/empresa. Requisições são canceladas ao encerrar ou trocar contexto. O botão bloqueia execução simultânea e não repete automaticamente POST após falha. Não há chamadas bancárias durante build ou testes.

## Validação
Testes locais usam dados sintéticos, HTTP com dependências injetadas, intérprete real de fórmulas com planilha sintética e mocks bancários. Não equivalem à homologação de seis APIs reais. Sem banco operacional, migrations, seeds ou gateway Oracle.

O teste histórico de integridade da migração azul continua protegendo os módulos não alterados nesta tarefa. As quatro exceções desta rodada (entrada da multissimulação, breadcrumb, cabeçalho e padrão de marca no editor white label) possuem mudanças funcionais/visuais explícitas e verificações focadas, em vez de exigir seu markup antigo.

Resultados finais e eventual publicação devem ser registrados na entrega. A instalação local de pacotes foi recomposta a partir do lockfile, sem atualização de dependências.

## Resultados finais
-70 testes distintos aprovados em10 arquivos. A primeira rodada detectou somente a expectativa da antiga logo SVG; atualizada para as duas variantes oficiais e os9 testes desse arquivo passaram novamente.
-TypeScript aprovado (`npm run lint`); build aprovado (avisos existentes de chunks grandes e imports dinâmicos/estáticos). `git diff --check` aprovado.
-Navegador real, harness com rede externa/gravações bloqueadas: login nos dois temas, login móvel390CSS, marcas transparentes carregadas, todos os grupos expandidos, abertura da multissimulação. Controles medidos em35,99px no desktop e43,99px no móvel.
-Capturas em `brand-v5/`. As imagens nativas podem incluir área excedente do navegador. Não representam sessão de produção. Automação do preenchimento de data nativa foi limitada pelo navegador; a transição e execução de dois contratos foram verificadas pelos testes de UI com mocks, não por chamada bancária.
-Nenhuma alteração em schema, migrations, gateways ou credenciais; nenhum teste bancário real.
