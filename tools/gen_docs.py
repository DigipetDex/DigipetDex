# -*- coding: utf-8 -*-
"""handover 문서 중 '코드와 어긋나기 쉬운 부분'(버전, 파일별 구성, 핵심 함수 위치)을 자동으로 갱신한다.
make_deploy.py 가 배포할 때마다 실행하며, 단독 실행도 가능: python tools/gen_docs.py

- handover/HANDOVER.md     : `> **마지막 버전:**` 줄
- handover/ARCHITECTURE.md : <!-- AUTO:FILES --> ... <!-- /AUTO:FILES -->, <!-- AUTO:FUNCS --> ... <!-- /AUTO:FUNCS -->
핵심 함수 목록과 역할 설명은 아래 KEY_FUNCS 에서 관리한다. (함수 이름이 바뀌면 경고를 출력)
"""
import os
import re
import sys
import json
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KEY_FUNCS = [
    ("applyViewerModeUI", "뷰어/에디터 모드에 맞춰 UI·제목·배지 갱신"),
    ("saveState", "project 를 localStorage 에 자동 저장"),
    ("getDefaultReqForStage", "세대별 기본 요건 반환 (시간만, 나머지 빈칸)"),
    ("ensureDigimonRequirements", "로드 시 기본값 정리 (구형 더미값 1200/8 제거 등)"),
    ("handleDigiImgError", "이미지 로드 실패 시 폴백 경로 탐색 (js/05 — <head>에서 가장 먼저 로드)"),
    ("syncSameNameDigimons", "동명 디지몬 간 img/attr/stage/baseHp·Ap·Spd 동기화"),
    ("isEvoRevealed", "단일 진화선 공개 여부 판별"),
    ("updateDigimonConditionStatus", "해당 디지몬의 모든 incoming 루트 종합 판정"),
    ("recalculateAllDigimonConditionStatuses", "전체 디지몬 일괄 재판정 (renderTree 시 매번 호출)"),
    ("renderTree", "진화 트리 전체 렌더링 (recalculate 포함)"),
    ("updateSidebar", "우측 패널(사이드바) 갱신"),
    ("handleReqFieldChange", "조건 입력 필드 변경 이벤트 핸들러"),
    ("executeDirectSave", "project_data.js 저장 (Electron IPC / File System API / 다운로드 폴백)"),
    ("openReportModalForDigi", "위키 제보 모달 오픈"),
    ("submitReport", "위키 제보 저장 & GAS 전송"),
    ("applyReportToTree", "제보 1건을 트리에 반영"),
    ("renderWikiHistoryListUI", "위키 변경 역사 목록 렌더링"),
    ("revertWikiRevision", "위키 역사 롤백 (\"restore\" | \"undo\")"),
    ("syncLiveConditionsToGas", "전체 조건 GAS 배포 (Pre-Merge 안전장치 포함)"),
    ("fetchAndApplyLiveConditions", "서버 최신 조건 로드 & 병합"),
    ("loadImgAsync", "캔버스용 이미지 로더 (crossOrigin=anonymous, 실패 시 null)"),
    ("generatePlannerChainCanvas", "플래너 PNG 캡쳐 렌더링 (Canvas)"),
]


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def js_files():
    """editor.html 의 <script src="js/..."> 순서(= 로드 순서)대로. HTML 에 없는 js/ 파일은 뒤에 붙인다."""
    html = os.path.join(BASE, 'editor.html')
    ordered = []
    if os.path.exists(html):
        ordered = [m for m in re.findall(r'<script\s+src="(js/[^"?]+)', read(html))]
    found = []
    for root, _, files in os.walk(os.path.join(BASE, 'js')):
        for n in files:
            if n.endswith('.js'):
                found.append(os.path.relpath(os.path.join(root, n), BASE).replace(os.sep, '/'))
    ordered = [f for f in ordered if f in found]
    return ordered + sorted(f for f in found if f not in ordered)


def describe(rel):
    first = read(os.path.join(BASE, rel)).split('\n', 1)[0]
    m = re.match(r'/\*\s*(.*?)\s*\*/', first)
    return m.group(1) if m else ''


def files_block():
    rows = ["| 파일 | 줄 수 | 내용 |", "|---|---:|---|"]
    total = 0
    for rel in js_files():
        n = read(os.path.join(BASE, rel)).count('\n')
        total += n
        rows.append(f"| `{rel}` | {n:,} | {describe(rel)} |")
    css = os.path.join(BASE, 'css', 'editor.css')
    if os.path.exists(css):
        n = read(css).count('\n')
        rows.insert(2, f"| `css/editor.css` | {n:,} | 전체 스타일 (다크 테마, 모바일 대응) |")
    html = os.path.join(BASE, 'editor.html')
    if os.path.exists(html):
        rows.insert(2, f"| `editor.html` | {read(html).count(chr(10)):,} | HTML 셸 (마크업 + `<script>` 로드 순서) |")
    rows.append(f"\n> JS 합계 {total:,}줄. 스크립트는 전부 classic script 이며 **로드 순서 = 실행 순서**입니다 (`editor.html` 의 `<script>` 순서).")
    return '\n'.join(rows)


def funcs_block():
    index = {}
    for rel in js_files():
        for i, line in enumerate(read(os.path.join(BASE, rel)).split('\n'), 1):
            m = re.match(r'\s*(?:async\s+)?function\s+(\w+)\s*\(', line)
            if m and m.group(1) not in index:
                index[m.group(1)] = (rel, i)
    rows = ["| 함수 | 위치 | 역할 |", "|---|---|---|"]
    for name, role in KEY_FUNCS:
        if name in index:
            rel, ln = index[name]
            rows.append(f"| `{name}()` | `{rel}:{ln}` | {role} |")
        else:
            print(f"⚠ gen_docs: 함수 '{name}' 을(를) 찾지 못했습니다 — tools/gen_docs.py 의 KEY_FUNCS 를 갱신하세요")
            rows.append(f"| `{name}()` | (찾을 수 없음) | {role} |")
    return '\n'.join(rows)


def replace_block(text, tag, content):
    pat = re.compile(rf'(<!-- AUTO:{tag} -->\n).*?(\n<!-- /AUTO:{tag} -->)', re.S)
    if not pat.search(text):
        print(f"⚠ gen_docs: 마커 AUTO:{tag} 를 찾지 못했습니다")
        return text
    return pat.sub(lambda m: m.group(1) + content + m.group(2), text)


def main():
    hdir = os.path.join(BASE, 'handover')
    if not os.path.isdir(hdir):
        print('handover 폴더가 없어 건너뜁니다')
        return
    ver = {}
    vf = os.path.join(BASE, 'version.json')
    if os.path.exists(vf):
        ver = json.loads(read(vf))
    label = ver.get('version_label', '?')

    p = os.path.join(hdir, 'HANDOVER.md')
    if os.path.exists(p):
        t = read(p)
        t = re.sub(r'(> \*\*마지막 버전:\*\* ).*', lambda m: m.group(1) + f"{label}  ", t, count=1)
        write(p, t)

    p = os.path.join(hdir, 'ARCHITECTURE.md')
    if os.path.exists(p):
        t = read(p)
        t = replace_block(t, 'FILES', files_block())
        t = replace_block(t, 'FUNCS', funcs_block())
        t = re.sub(r'(> \*\*마지막 업데이트:\*\* ).*',
                   lambda m: m.group(1) + f"{datetime.now().strftime('%Y-%m-%d')} ({ver.get('version', '?')})  ", t, count=1)
        write(p, t)
    print('handover 문서 자동 갱신 완료:', label)


if __name__ == '__main__':
    main()
