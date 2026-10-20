# Seleção de ofertas FGTS

O comparador interno permite selecionar uma linha elegível e enviar a oferta para a fila da mesa. Exige parceiro ativo e nome do cliente. Telefone é opcional, mas deve ser válido quando preenchido.

O servidor emite um comprovante criptografado por oferta, vinculado a empresa, usuário, CPF, promotora e retorno original. O comprovante expira em 30 minutos. A submissão não aceita valor/tabela alterados no navegador e usa chave única para evitar solicitações duplicadas por repetição do mesmo envio.

As solicitações são registradas como `FGTS_MULTI`, com condição selecionada, retorno original e prazo de cinco dias úteis para acompanhamento da digitação. As rotinas de reconciliação incluem esse tipo de solicitação. Nenhuma contratação é chamada na API do banco nesta etapa.

Endpoint interno: `POST /api/simulations/fgts/submit`. Requer sessão interna, permissão `simulations.create`, parceiro da empresa e comprovante válido. O portal de parceiros não acessa esse endpoint.

Diagnóstico V8: consulta FGTS por provedor (`bms`, `girotech`) e consulta configurações CLT com `provider=QI`. A disponibilidade deve ser confirmada no teste da conexão salva. HTTP 400 não é falha de autenticação e deve ser reportado por produto; diagnóstico não realiza simulação ou contratação.
