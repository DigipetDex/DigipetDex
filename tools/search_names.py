# -*- coding: utf-8 -*-
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

with open('project_data.js', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('{')
end = text.rfind('}') + 1
project = json.loads(text[start:end])
digimons = project.get('digimons', {})

names = sorted({d.get('name', '').strip() for d in digimons.values()})

query_targets = [
    '미라쥬', '벨젭', '베르제', '알포스', '이리시', '아이리스', '오메가', '카드라', '카오스드라', 
    '파라사이', '헤클', '헤라클', '황팔', '황제', '타리언트', '타이런트', '레피드', '래피드',
    '샤우트', '샤인', '샤크라', '알파', '듀크', '레이브', '벨페', '펜리', '스사노오', '스피노', '마린'
]

print("=== SEARCHING IN PROJECT_DATA.JS ===")
for q in query_targets:
    matched = [n for n in names if q in n]
    if matched:
        print(f"[{q}] -> {matched}")
    else:
        print(f"[{q}] -> (없음)")
