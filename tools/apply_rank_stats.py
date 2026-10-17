# -*- coding: utf-8 -*-
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

# 업데이트할 스탯 정의
STATS_TO_APPLY = {
    '네오묘티스몬': {'baseHp': 300, 'baseAp': 105, 'baseSpd': 90},
    '노블펌프몬': {'baseHp': 285, 'baseAp': 75, 'baseSpd': 90},
    '디아블로몬': {'baseHp': 320, 'baseAp': 105, 'baseSpd': 110},
    '라그나로드몬': {'baseHp': 380, 'baseAp': 180, 'baseSpd': 120},
    '라플레시몬': {'baseHp': 345, 'baseAp': 145, 'baseSpd': 160},
    '로제몬': {'baseHp': 270, 'baseAp': 115, 'baseSpd': 140},
    '로제몬: 버스트 모드': {'baseHp': 365, 'baseAp': 155, 'baseSpd': 150},
    '마린엔젤몬': {'baseHp': 245, 'baseAp': 125, 'baseSpd': 140},
    '마왕몬': {'baseHp': 300, 'baseAp': 130, 'baseSpd': 120},
    '메기드라몬': {'baseHp': 330, 'baseAp': 130, 'baseSpd': 90},
    '메디벌듀크몬': {'baseHp': 300, 'baseAp': 120, 'baseSpd': 120},
    '무르무크스몬': {'baseHp': 300, 'baseAp': 115, 'baseSpd': 130},
    '벨페몬: 레이지 모드': {'baseHp': 320, 'baseAp': 120, 'baseSpd': 100},
    '브레이크드라몬': {'baseHp': 315, 'baseAp': 120, 'baseSpd': 100},
    '블래스트몬': {'baseHp': 300, 'baseAp': 100, 'baseSpd': 150},
    '블룸로드몬': {'baseHp': 275, 'baseAp': 125, 'baseSpd': 150},
    '샤카몬': {'baseHp': 400, 'baseAp': 160, 'baseSpd': 120},
    '스피노몬': {'baseHp': 285, 'baseAp': 110, 'baseSpd': 150},
    '아르케엔젤몬': {'baseHp': 205, 'baseAp': 80, 'baseSpd': 100},
    '아마게몬': {'baseHp': 420, 'baseAp': 135, 'baseSpd': 140},
    '얼티메이트브라키몬': {'baseHp': 335, 'baseAp': 100, 'baseSpd': 80},
    '에이션트볼케몬': {'baseHp': 300, 'baseAp': 110, 'baseSpd': 140},
    '에이션트와이즈몬': {'baseHp': 285, 'baseAp': 120, 'baseSpd': 130},
    '카오스드라몬(X항체)': {'baseHp': 405, 'baseAp': 155, 'baseSpd': 130},
    '카오스듀크몬': {'baseHp': 300, 'baseAp': 125, 'baseSpd': 110},
    '페닉스몬': {'baseHp': 285, 'baseAp': 125, 'baseSpd': 140},
    '플레시오몬': {'baseHp': 280, 'baseAp': 115, 'baseSpd': 150},
    '피에몬': {'baseHp': 270, 'baseAp': 85, 'baseSpd': 140},
}

with open('project_data.js', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('{')
end = text.rfind('}') + 1
prefix = text[:start]
suffix = text[end:]
project = json.loads(text[start:end])
digimons = project.get('digimons', {})

updated_count = 0
updated_names = set()

for did, d in digimons.items():
    dname = d.get('name', '').strip()
    if dname in STATS_TO_APPLY:
        # 미기입 상태인지 재확인 (기존 스탯이 이미 있으면 보호)
        has_hp = bool(d.get('baseHp'))
        has_ap = bool(d.get('baseAp'))
        has_spd = bool(d.get('baseSpd'))
        if not (has_hp or has_ap or has_spd):
            stat = STATS_TO_APPLY[dname]
            d['baseHp'] = stat['baseHp']
            d['baseAp'] = stat['baseAp']
            d['baseSpd'] = stat['baseSpd']
            updated_count += 1
            updated_names.add(dname)
            print(f"Updated: {dname} (ID: {did}, DiM: {d.get('dim')}) -> HP={stat['baseHp']}, AP={stat['baseAp']}, SPD={stat['baseSpd']}")
        else:
            print(f"Skipped (already has stats): {dname} (ID: {did})")

print(f"\nTotal digimon objects updated: {updated_count}")
print(f"Total unique names updated: {len(updated_names)}")

# project_data.js 저장
new_json = json.dumps(project, ensure_ascii=False, indent=2)
with open('project_data.js', 'w', encoding='utf-8', newline='') as f:
    f.write(prefix + new_json + suffix)

print("Saved project_data.js successfully.")
