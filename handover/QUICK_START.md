# ⚡ QUICK_START — 새 AI를 위한 즉시 작업 가이드

> 이 파일을 먼저 읽으세요. 10분 안에 프로젝트를 파악할 수 있습니다.

---

## 1. 프로젝트를 한 줄로 설명하면?

> **바이탈 브레이슬릿 디지몬 진화 트리 에디터 + 실시간 위키 도감**  
> (서버 없이 Google Sheets + GitHub Pages 로 운영, 유저 집단지성 제보 시스템 탑재)

---

## 2. 파일 수정의 기본 원칙

```
수정할 파일: editor.html (마크업) / css/editor.css (스타일) / js/*.js (로직) / project_data.js (데이터)
수정 완료 후: python make_deploy.py
```

절대 `index.html`, `viewer.html`, `dist/`, `배포용/` 을 직접 수정하지 마세요. `make_deploy.py` 가 `editor.html` 에서 이 파일들을 자동 생성합니다.

**어느 파일을 고쳐야 하나?** → [ARCHITECTURE.md](./ARCHITECTURE.md) 의 "핵심 함수 위치" 표에서 함수 이름으로 `파일:줄` 을 찾으세요. 모르는 함수는 `js/` 에서 `grep -n "function 이름"` 으로 찾습니다.

- 새 `.js` 파일을 만들면 `editor.html` 의 `<script src="js/…">` 목록에 **의존 순서대로** 추가합니다.
- 최상위 `const/let` 은 전부 파일 간 전역 공유입니다. 같은 이름을 다른 파일에서 다시 선언하면 `SyntaxError` 가 납니다.

---

## 3. Python 스크립트 작성 규칙 (⚠️ Windows PowerShell)

```python
# 한글 포함 .py 파일 필수 형식
# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('js/30-state-conditions.js', 'r', encoding='utf-8') as f:
    text = f.read()
```

**절대 금지:** `python -c "..."` 인라인 실행 (한글/특수문자 깨짐)  
**항상 `.py` 파일로 저장 후** `python script.py` 로 실행

---

## 4. 문자열 치환 시 주의사항

- 줄바꿈: 텍스트 모드로 읽으면 `\n` 으로 통일돼 보입니다 (CRLF 파일이어도). **`\r\n` 패턴으로 찾지 마세요.**
- 들여쓰기: JS 는 최상위가 **4칸** 들여쓰기입니다 (원래 `<script>` 안에 있던 코드라서). 함수마다 공백 수가 다르니 실제 파일을 확인하세요.
- 한글 포함 target content: `replace_file_content` 도구보다 **Python 스크립트가 더 안정적**
- 예전 일회성 패치 스크립트(`add_stage2.py`, `fix_always_show.py`)는 `editor.html` 안의 문자열을 찾도록 쓰여 있어 **지금은 NOT FOUND** 가 납니다 (이미 적용된 변경이고, 코드는 `js/` 로 옮겨졌습니다). 같은 방식으로 새 패치를 쓸 때는 대상 파일을 `js/…` 로 바꾸세요.

---

## 5. 자주 쓰는 파이썬 패턴

```python
# 문자열 치환 (표준 패턴) — 대상 파일 경로만 바꿔서 사용
# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'js/30-state-conditions.js'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = '''<복사할 원본 코드>'''
replacement = '''<대체할 코드>'''

if text.count(target) == 1:
    text = text.replace(target, replacement, 1)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print("SUCCESS")
else:
    print("NOT FOUND or AMBIGUOUS:", text.count(target))
```

---

## 6. 조건 공개 상태 판정 (핵심 개념)

성숙기 이상 디지몬의 조건 공개 판정:

```
바이탈, PP, 배틀, 승률, 조그레스, 아이템, 던전 중 하나라도 입력 → 공개 ✅
isIdle = true 또는 note에 "방치" 포함 → 공개 ✅
아무것도 없음 (시간만 있음) → 조건 불명 ❌
```

유년기I / 유년기II / 성장기:
```
항상 공개 ✅ (진화 시간만으로 판정)
```

---

## 7. 주요 버그 수정 히스토리 (재발 방지)

| 버그 | 원인 | 수정 위치 |
|---|---|---|
| 한 루트만 입력해도 전체 공개 | `submitReport()`에서 `unknownTime=false` 강제 세팅 | → `updateDigimonConditionStatus()` 호출로 교체 |
| 조건 비어도 공개로 표시 | 기존 `unknownTime`이 false인 채 유지 | → 단일 루트에서도 `unknownTime=!isRev` 설정 |
| 바이탈 1200/PP 8 더미값 공개 표시 | 초기 템플릿 기본값이 조건으로 오인 | → `ensureDigimonRequirements()` 자동 정리 |
| 실시간 배포 시 유저 제보 덮어쓰기 | 에디터 오래 켜두면 구버전 데이터로 배포 | → Pre-Merge 안전장치 추가 |
| 스크립트 분리 후 `handleDigiImgError is not defined` | 정적 `<img onerror>` 가 본문 스크립트보다 먼저 실행 | → `js/05-img-fallback.js` 를 `<head>` 에서 먼저 로드 |

---

## 8. GAS 통신 흐름 요약

```
유저 제보 저장
  → POST: wiki_edit (no-cors, 응답 읽기 불가)
  → 로컬 먼저 반영 (낙관적 UI)

관리자 전체 배포
  → GET: get_live_conditions (서버 최신 로드)
  → 병합 (merge)
  → POST: sync_live_conditions (전체 덮어쓰기)

앱 로드 시
  → GET: get_live_conditions → 로컬 데이터에 병합
```

---

## 9. 로컬 실행 / 테스트 요령

- **Electron(권장):** `에디터_실행.bat` 또는 `npm start`. `Ctrl+S` 로 `project_data.js` 즉시 저장.
- **브라우저 확인:** 간단한 정적 서버가 편합니다 — `python -m http.server 8000` 후 `http://localhost:8000/editor.html`(에디터) / `…/index.html`(뷰어). `file://` 로 열면 플래너 PNG 캡쳐에 스프라이트/아이콘이 빠질 수 있습니다.
- 에디터 모드는 `localStorage` 의 이전 작업을 우선 복원합니다. 데이터가 이상하면 `초기화` 버튼(`btn-reset-storage`, "기본 샘플 데이터로 복원")이나 브라우저 저장소를 지우고 확인하세요.
- 배포: `원클릭_배포.bat` (make_deploy → git commit → push). 반영까지 GitHub Pages 가 1~2분 걸립니다.

---

## 10. 참조 파일 목록

| 파일 | 용도 |
|---|---|
| [HANDOVER.md](./HANDOVER.md) | 프로젝트 전체 개요 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 파일 구성 / 핵심 함수 위치 |
| [CHANGELOG.md](./CHANGELOG.md) | 변경 이력 + 문서 정정 내역 |
| [DATA_STRUCTURE.md](./DATA_STRUCTURE.md) | 데이터 구조 레퍼런스 |
| [GAS_API_REFERENCE.md](./GAS_API_REFERENCE.md) | GAS API 명세 |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | 알려진 문제 / 개선 후보 |
