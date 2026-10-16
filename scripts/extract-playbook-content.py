"""Build the searchable reading edition from the supplied source PDFs."""
import json
import re
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[1]
assets = root / 'server/assets/bank-playbooks'
index = json.loads((assets / 'text-index.json').read_text(encoding='utf-8'))
allowed = {item['id']: item for item in index}
books = json.loads((root / 'src/data/bankPlaybooks.json').read_text(encoding='utf-8'))
topics = {
    'Portabilidade': r'portabilidade|\bport\b',
    'Idade e benefício': r'idade|etári|especie|espécie|pension|invalidez',
    'Valores e prazos': r'valor|prazo|parcela|troco|saldo|limite',
    'Refinanciamento': r'refinanciamento|\brefin\b',
    'Documentação': r'document|comprovante|identidade|assinatura|formaliza',
    'Restrições e exceções': r'não atende|não aceita|vedad|restri|exceç|analfabet|representante',
}
output = []
for book in books:
    with pdfplumber.open(assets / (book['id'] + '.pdf')) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            page = page.dedupe_chars()
            key = f"{book['id']}-p{number}"
            if key not in allowed:
                continue
            source = allowed[key]
            text = page.extract_text(use_text_flow=True) or re.sub(r'^\[PDF p\. \d+\]\s*', '', source['text'])
            text = '\n'.join(line for line in text.splitlines() if not re.search(r'Este documento contém informação RESTRITA|Classificação\s*:|Voltar ao Índice|^MANUAL OPERACIONAL ÚNICO|^É Banco\.|^É Digital\.|^É Bradesco\.|^Digio -\s*Público|^Presença · Roteiro', line, re.I))
            original_lines = [line.strip() for line in text.splitlines() if line.strip()]
            # Only replace full-width ruled tables; partial detection would lose context.
            tables = []
            for table in page.find_tables():
                rows = table.extract()
                populated = sum(sum(bool(cell and cell.strip()) for cell in row)>=2 for row in rows)
                if len(rows)>=2 and populated>=len(rows)*.65 and table.bbox[2]-table.bbox[0]>page.width*.60:
                    tables.append(table)
            blocks = []
            if tables:
                remaining = page.filter(lambda obj: not any(t.bbox[0] <= (obj.get('x0',0)+obj.get('x1',0))/2 <= t.bbox[2] and t.bbox[1] <= (obj.get('top',0)+obj.get('bottom',0))/2 <= t.bbox[3] for t in tables)).extract_text(use_text_flow=True) or ''
                # Keep the original full text when a table is not reliably rectangular.
                valid = all(len(t.extract()) >= 2 and len(t.extract()[0]) >= 2 for t in tables)
                if valid:
                    for t in tables:
                        blocks.append({'kind':'table','rows':[[re.sub(r'\s+', ' ', cell or '').strip() for cell in row] for row in t.extract()]})
                    text = remaining
            # Preserve policy wording, joining wrapped lines but separating bullets and labels.
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            paragraphs = []
            for line in lines:
                if re.search(r'https?://|www\.|@|criado por|atualizado por|Este documento contém informação RESTRITA|Classificação\s*:|Voltar ao Índice|^MANUAL OPERACIONAL ÚNICO|^É Banco\.|^É Digital\.|^É Bradesco\.|^Digio -\s*Público|^Presença · Roteiro|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\(\d{2}\)\s*\d{4,5}[- ]\d{4}',line,re.I):
                    continue
                if paragraphs and line==paragraphs[-1]:
                    continue
                if re.match(r'^\d+(?:/\s*\d+)?$',line):
                    continue
                starts = bool(re.match(r'^(?:[•●▪✓➢\-*]|\d+[.)]|[a-z][)])\s',line))
                short_heading = len(line)<70 and (line.isupper() or line.endswith(':'))
                if not paragraphs or starts or short_heading or paragraphs[-1].endswith(('.',':',';')):
                    paragraphs.append(line)
                else:
                    paragraphs[-1] += ' ' + line
            header = r'roteiro operacional|INSS.*Entidade|EMPRÉSTIMO CONSIGNADO|INSTITUTO NACIONAL|Banco Daycoval S/A|Elaborado pelo|Classificação|Voltar ao|Presença ·|Base Presença|CÓD 331|^\d+$'
            title = next((line for line in original_lines[:20] if 5<len(line)<110 and not re.search(header,line,re.I)), f'Orientações · página {number}')
            output.append({'id':key,'bankId':book['id'],'title':title,'page':number,'topics':[name for name,pattern in topics.items() if re.search(pattern,source['text'],re.I)] or ['Orientações gerais'],'paragraphs':paragraphs,'tables':blocks,'partnerSafe':source['partnerSafe']})
    print(book['id'], flush=True)
editorial = json.loads((root / 'docs/bank-playbooks/reading-editorial.json').read_text(encoding='utf-8'))
output = [dict(section, title=editorial['titles'].get(section['id'],section['title'])) for section in output if section['id'] not in editorial['exclude']]
(assets / 'reading-content.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
