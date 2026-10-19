"""Extract Word business evidence to a private review file; never create employees or infer reporting lines."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('documents', nargs='+', type=Path)
args = parser.parse_args()
sources = []
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'dgm': 'http://schemas.openxmlformats.org/drawingml/2006/diagram'}
for document in args.documents:
    with zipfile.ZipFile(document) as archive:
        if sum(info.file_size for info in archive.infolist()) > 50 * 1024 * 1024:
            raise ValueError('Document expands beyond 50 MB')
        root = ET.fromstring(archive.read('word/document.xml'))
        paragraphs = [''.join(p.itertext()).strip() for p in root.findall('.//w:p', namespaces)]
        tables = []
        for table in root.findall('.//w:tbl', namespaces):
            tables.append([[' '.join(''.join(p.itertext()).strip() for p in cell.findall('.//w:p', namespaces)) for cell in row.findall('w:tc', namespaces)] for row in table.findall('w:tr', namespaces)])
        diagrams = []
        for part in archive.namelist():
            if part.startswith('word/diagrams/data') and part.endswith('.xml'):
                diagram = ET.fromstring(archive.read(part))
                diagrams.extend({'source_node': point.get('modelId'), 'text': ' | '.join(node.text or '' for node in point.findall('.//a:t', namespaces)), 'verification_status': 'needs_verification'} for point in diagram.findall('.//dgm:pt', namespaces) if point.findall('.//a:t', namespaces))
        sources.append({'source': document.name, 'verification_status': 'needs_verification', 'paragraphs': [p for p in paragraphs if p], 'tables': tables, 'diagram_nodes': diagrams})
target = Path(__file__).resolve().parent.parent / 'imports' / 'organization-review.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps({'notice': 'Review all names, responsibilities and reporting lines before entering confirmed records. No database changes.', 'sources': sources}, ensure_ascii=False, indent=2), encoding='utf-8')
print('Private review file created in imports/organization-review.json (excluded from Git). No database changes.')
