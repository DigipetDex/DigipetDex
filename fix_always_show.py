# -*- coding: utf-8 -*-
"""궁극체2, 초궁극체를 항상-표시 목록에서 제거"""

with open('editor.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 현재: 궁극체2, 초궁극체 포함 → 항상 표시
old = '!["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체", "궁극체", "궁극체2", "초궁극체"].includes(stageName)'
# 변경: 기본 세대만 → 궁극체2/초궁극체/초궁극체II/아머체는 디지몬 있을 때만
new = '!["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체", "궁극체"].includes(stageName)'

if old in content:
    content = content.replace(old, new, 1)
    print("OK: 항상-표시 목록에서 궁극체2, 초궁극체 제거")
else:
    print("NOT FOUND")

with open('editor.html', 'w', encoding='utf-8') as f:
    f.write(content)
