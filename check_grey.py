import re
import json
from collections import Counter

with open('editor.html', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. SVG strokes
strokes = re.findall(r'stroke="([^"]+)"', text)
print('Static SVG strokes:', Counter(strokes))

# 2. Check defaultProject digimons
pos = text.find('const defaultProject =')
start = text.find('{', pos)
end = text.find(';\n', start)
proj = json.loads(text[start:end])

# Check all digimon properties
for did, d in proj['digimons'].items():
    req = d.get('req', {})
    note = req.get('note', '')
    if note or '회색' in str(d):
        print(d['name'], 'note:', note)
