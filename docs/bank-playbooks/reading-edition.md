# Edição de consulta dos roteiros

A aba Roteiros apresenta conteúdo pesquisável, sem depender do leitor de PDF.

- `server/assets/bank-playbooks/quick-reference.json`: quadros de consulta rápida revisados por assunto, com banco e página de origem. Alterações devem preservar todas as condições e ressalvas da regra.
- `server/assets/bank-playbooks/reading-content.json`: texto complementar e tabelas extraídos dos documentos fornecidos. A ordem do fluxo de texto é usada para evitar misturar colunas independentes.
- `reading-editorial.json`: títulos legíveis e exclusão de capas, índices, contatos e páginas de navegação.
- `scripts/extract-playbook-content.py`: recria o conteúdo complementar com `pdfplumber`; utiliza a lista de páginas previamente filtradas de `text-index.json`. Não altera os PDFs ou os quadros de consulta rápida.

Nem toda página do PDF compõe a edição de leitura: exemplos com dados pessoais, páginas sem texto extraível e material de navegação podem estar ausentes. O original permanece disponível como referência da fonte. Células mescladas vazias não recebem valores presumidos.

A pesquisa interna aceita banco, assunto e palavras do conteúdo, sem distinguir acentos. A IA recebe a mesma base textual, com indicação de página; no portal, somente seções marcadas para consulta de parceiros. Informações de correspondente, remuneração e contatos internos permanecem restritas.

Esta edição não modifica políticas automáticas de elegibilidade, cálculos ou ativação das APIs.
