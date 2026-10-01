# -*- coding: utf-8 -*-
"""궁극체2 스테이지 추가 - 1,2번 항목 (14공백 들여쓰기)"""

with open('editor.html', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. edit-stage select: 궁극체2 추가 (14 spaces)
old = '<option value="궁극체">궁극체</option>\n              <option value="초궁극체">초궁극체</option>'
new = '<option value="궁극체">궁극체</option>\n              <option value="궁극체2">궁극체2</option>\n              <option value="초궁극체">초궁극체</option>'
if old in content:
    content = content.replace(old, new, 1)
    changes += 1
    print("[1] edit-stage select: OK")
else:
    print("[1] edit-stage select: NOT FOUND")

# 2. planner chip 추가 (14 spaces)
old = '<button type="button" class="planner-chip" data-stage="궁극체">궁극체</button>\n              <button type="button" class="planner-chip" data-stage="초궁극체">초궁극체</button>'
new = '<button type="button" class="planner-chip" data-stage="궁극체">궁극체</button>\n              <button type="button" class="planner-chip" data-stage="궁극체2">궁극체2</button>\n              <button type="button" class="planner-chip" data-stage="초궁극체">초궁극체</button>'
if old in content:
    content = content.replace(old, new, 1)
    changes += 1
    print("[2] planner chip: OK")
else:
    print("[2] planner chip: NOT FOUND")

with open('editor.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n총 {changes}개 변경 완료")
