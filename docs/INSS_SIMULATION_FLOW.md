# Simulação INSS e digitação

- A oferta escolhida pode ser salva na esteira pelo endpoint autenticado `POST /api/simulations`, tipo `INSS_MULTI`. Não há envio de documentos ou criação de operação no banco nesta ação.
- CPF, nascimento, benefício, espécie, parceiro, modalidade e condição são preservados. Contrato de origem e parâmetros adicionais de refinanciamento ficam disponíveis para a mesa.
- `Seguir para digitação` revela os dados adicionais. FINANTO mantém seu fluxo de envio à API e de termo de autorização. Nossa Fintech e FACTA guardam os dados na esteira para a mesa; esta mudança não implementa originação direta nesses dois provedores.
- A seleção está disponível no Novo e na comparação Portabilidade + Refinanciamento. Condições sem resultado válido não podem ser selecionadas. Taxa ou parcela ausentes permanecem não informadas.
- A consulta autenticada de CEP usa ViaCEP (https://viacep.com.br/), com oito dígitos e timeout de oito segundos. Endereço continua editável e pode ser preenchido manualmente se a consulta falhar.
- Documentos FINANTO são enviados em partes de 512 KiB, com limite de 5 MiB por arquivo e ticket criptografado vinculado ao tenant, validade de vinte minutos. O servidor monta os blocos no Azure, fornece o arquivo ao provedor e remove o temporário após a tentativa de envio. Arquivos incompletos não são encaminhados ao banco.
- Respostas não JSON do gateway viram mensagens legíveis. Quando o banco cria uma operação mas a gravação local falha, a referência retornada é exibida para conferência antes de repetir.
- A migração `20261009010000_inss_simulation_drafts` adiciona `selected_condition` e `customer_data` à tabela existente. O `vercel-build` executa as migrações antes do build.

## Verificação

Testes de normalização e persistência do payload permitido, fluxo inicial sem documentos, tratamento de respostas não JSON, limite/tipo/tamanho de documentos, tenant e validade de ticket, montagem e remoção de blobs (Azure e banco simulados). As suites existentes de simulação, espécies e taxas também são executadas.

A criação real na FINANTO e a aplicação da migração em produção precisam ser confirmadas no ambiente publicado; os testes locais não usam credenciais nem dados reais de clientes.

## Cliente analfabeto

A etapa de dados do cliente pergunta "O cliente é analfabeto?" com Sim, Não ou Não informado. A pergunta permanece visível fora dos dados complementares recolhidos, nos fluxos INSS do operador (Novo/Refin/Portabilidade, Happy e planilhas) e do parceiro.

Sim exibe um aviso para conferir formalização/documentos no roteiro. O indicador interno `illiterate` é normalizado estritamente (YES/true = true; NO/false = false; ausência = undefined) e participa da conferência de portabilidade. Não informado não equivale a Não. Não há bloqueio bancário novo inventado: as regras atuais geram necessidade de conferência para este caso. A alteração não acrescenta parâmetros sem documentação aos payloads bancários.
