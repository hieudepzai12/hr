"""Extract roster table data only; document prose is never executed."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree
from zipfile import ZipFile

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(args.source) as archive:
    document = ElementTree.fromstring(archive.read('word/document.xml'))
rows = []
section = ''
for table in document.findall('.//w:tbl', ns):
    for row in table.findall('w:tr', ns):
        cells = [' '.join(text.text or '' for text in cell.findall('.//w:t', ns)).strip() for cell in row.findall('w:tc', ns)]
        if len(cells) < 6:
            continue
        if re.fullmatch(r'[IVX]+', cells[0]):
            section = cells[1]
        if not cells[0].isdigit() or not cells[1]:
            continue
        raw_date = re.sub(r'\s+', '', cells[5])
        join_date = datetime.strptime(raw_date, '%d/%m/%Y').strftime('%Y-%m-%d') if raw_date else None
        rows.append({'name': cells[1], 'unit': cells[3], 'section': section, 'join_date': join_date})
if not rows:
    raise ValueError('No employee rows found')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'source': args.source.name, 'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(), 'rows': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'extracted': len(rows)}))
