# 📖 DIGIPET 바이탈 링크 — AI 프로젝트 인수인계 문서

> **작성일:** 2026-10-01  
> **마지막 버전:** v1.3.98 (10.07 17:01)  
> **프로젝트 경로:** `f:\Game\DIGIPET\`  
> **배포 사이트:** https://digipetdex.github.io/DigipetDex/ (GitHub Pages, 저장소 `DigipetDex/DigipetDex`)

> 버전 줄은 `make_deploy.py` 가 배포할 때마다 자동으로 고칩니다. 구조 개편(CSS/JS/이미지 분리) 내용은 [CHANGELOG.md](./CHANGELOG.md) 의 "구조 개편" 항목을 먼저 읽으세요.

---

## 1. 프로젝트 개요

**DIGIPET 바이탈 링크**는 반다이 **바이탈 브레이슬릿(Vital Bracelet)** 시리즈 DiM 카드별 디지몬 진화 트리와 달성 조건을 시각적으로 탐색·편집·공유하는 웹 애플리케이션입니다.

### 핵심 특징
- **에디터 모드:** 관리자가 진화 트리/조건/스탯을 편집
- **뷰어 모드:** 일반 유저가 조건을 확인하고 위키 제보/수정
- **실시간 집단지성:** Google Apps Script + Sheets를 백엔드로 유저 제보 즉시 반영
- **진화 플래너:** 루트를 구성하여 PNG/클립보드 캡쳐 출력
- **Electron 전용 에디터:** `npm start` / `에디터_실행.bat` 로 실행. `project_data.js` 직접 저장과 원클릭 배포를 제공

### GAS Webhook URL
```
https://script.google.com/macros/s/AKfycbx1XUIl4kVde4m0G1RhLNiNAloJIR7BVpfvqnSV2Eah8scuEA79Bg3fKYTnqEOttjji/exec
```

### 규모 (2026-10-01 기준)
DiM 38개 · 디지몬 672종 · 진화선 1,070개 · 공식 도감(`digimon_db.js`) 1,310종

---

## 2. 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | Vanilla HTML5 / ES6+ JS(classic script, 번들러 없음) / Vanilla CSS (다크 테마) |
| Canvas | HTML5 Canvas (플래너 PNG 캡쳐) |
| Desktop | Electron (`main.js`, `preload.js`) — 에디터 전용 |
| Backend | Google Apps Script (서버리스 Webhook API) |
| Database | Google Sheets (5개 탭) |
| Build | Python 3 (`make_deploy.py`) — 번들링 없이 복사/버전/점검만 수행 |
| 데이터 포맷 | JS 파일에 담긴 JSON (`project_data.js`, `digimon_db.js`) |
| 배포 | **GitHub Pages** (저장소 루트가 그대로 서비스됨). `dist/`, `배포용/` 는 로컬 확인용 산출물이며 `.gitignore` 대상 |

> ⚠ 이전 문서는 Netlify 배포라고 적혀 있었으나 실제 배포 경로는 `원클릭_배포.bat` / Electron `deploy-to-netlify` 핸들러(이름만 Netlify)가 실행하는 **`git push origin main` → GitHub Pages** 입니다. `.netlify/` 폴더와 `최초_Netlify_로그인.bat` 은 과거 흔적입니다.

---

## 3. 파일 구조 및 역할

```
f:\Game\DIGIPET\
├── editor.html              ← 유일한 HTML 소스 (마크업 + <script> 로드 순서만 담은 셸)
├── css/editor.css           ← 전체 스타일
├── js/                      ← 스크립트 소스 (상세는 ARCHITECTURE.md)
│   ├── 05-img-fallback.js   ← <head> 에서 가장 먼저 로드 (정적 <img onerror> 용)
│   ├── 00 ~ 120-*.js        ← 본문 스크립트 (파일명 숫자 = 로드 순서)
├── index.html / viewer.html ← editor.html 복사본 (make_deploy.py 가 생성. 직접 수정 금지)
├── project_data.js          ← 메인 DB (digimons, evolutions, dims, dimMeta). 이미지는 경로만 보유
├── images/embedded/         ← project_data.js 에서 분리된 스프라이트 (해시 이름, 자동 생성)
├── digimon_db.js            ← 공식 디지몬 사전 (OFFICIAL_DIGIMON_DB 객체)
├── google_apps_script.js    ← GAS 백엔드 소스 (Apps Script 에 직접 붙여넣어 배포)
├── make_deploy.py           ← 배포 패키징 스크립트
├── tools/                   ← externalize_images.py, gen_docs.py
├── main.js / preload.js     ← Electron 진입점 / IPC 브리지
├── version.json             ← 현재 버전 (make_deploy.py 가 갱신)
├── create_template.py, export_to_excel_by_dim.py, export_to_sheets.py,
│   download_humulos_gifs.py ← Excel/Sheets 내보내기, 스프라이트 다운로더 보조 스크립트
├── *.bat                    ← 실행/배포 도우미 (아래 5절)
├── 진화시간.webp / 바이탈.webp / PP.webp / 승률.webp / 배틀.webp  ← 조건 아이콘
├── 아구몬/ 파피몬/ … (DiM별 폴더)  ← 로컬 스프라이트 (일부 디지몬이 경로로 참조)
└── dist/, 배포용/           ← 로컬 산출물 (git 제외)
```

### ⚠ 핵심 규칙
- **소스는 `editor.html` + `css/` + `js/`.** `index.html`, `viewer.html`, `dist/`, `배포용/` 은 직접 수정 금지. 수정 후 `python make_deploy.py`
- `editor.html` 과 `viewer.html` 은 **하드링크**일 수 있습니다(같은 파일). 정상입니다.
- `project_data.js` 는 base64 이미지를 직접 넣지 마세요. 넣어도 배포 때 자동으로 `images/embedded/` 로 분리됩니다.
- 새 `.js` 파일을 추가하면 `editor.html` 에 `<script src="js/….js">` 를 **순서에 맞게** 추가해야 합니다. 선언(`const/let/function`)이 전역을 공유하므로 로드 순서가 곧 의존 순서입니다.
- **줄바꿈:** 새 구조의 파일은 LF 로 저장합니다. 예전 `editor.html` 은 CRLF 였습니다. Python 은 텍스트 모드(`open(..., 'r', encoding='utf-8')`)로 읽으면 어느 쪽이든 `\n` 으로 보이므로 문자열 치환 패턴은 `\n` 기준으로 작성합니다.
- **인코딩:** UTF-8 전용
- PowerShell 에서 한글 포함 Python 은 반드시 `.py` 파일로 작성 후 실행 (인라인 `-c` 불가)
- `.py` 파일 첫 줄 근처에 `sys.stdout.reconfigure(encoding='utf-8')`

---

## 4. 데이터 구조 요약 (`project_data.js`)

상세는 [DATA_STRUCTURE.md](./DATA_STRUCTURE.md).

```js
window.DIGIPET_DEFAULT_DATA = {
  digimons: { "greymon": { id, name, stage, attr, img, digitama, dim, order, lineColor,
                           baseHp?, baseAp?, baseSpd?, independentReq?, req, unknownTime, partialUnknown } },
  evolutions: [ { from, to, lineColor, time, vital, pp, battle, winRate, dungeon, jogress, item, note, isIdle? } ],
  dims: ["아구몬 EX", ...],           // DiM 이름 (일부는 🚧/❌ 표식 포함)
  dimMeta: { "아구몬 EX": { location: "데이터 초원" } },
  gasWebhookUrl: "https://..."
}
```
- `attr` 는 **영문 키**: `vaccine` / `data` / `virus` / `free` / `none`
- `img` 는 `images/embedded/<해시>.gif` 같은 상대 경로(또는 `아구몬/Agumon.gif` 형태의 로컬 폴더 경로)

### 세대(stage) 종류 및 순서
```
디지타마 → 유년기 I → 유년기 II → 성장기 → 성숙기 → 완전체
→ 궁극체 → 궁극체2 → 초궁극체 → 초궁극체II → 아머체
```

### 컬럼 표시 규칙
- **항상 표시:** 디지타마, 유년기I/II, 성장기, 성숙기, 완전체, 궁극체
- **해당 디지몬 있을 때만:** 궁극체2, 초궁극체, 초궁극체II, 아머체

---

## 5. 실행 / 배포 도우미

| 파일 | 하는 일 |
|---|---|
| `에디터_실행.bat` | `npx electron .` — Electron 에디터 실행 (권장) |
| `편집기_실행.bat` | 브라우저로 `index.html` 과 `editor.html` 열기 (file:// — 플래너 PNG 캡쳐에서 스프라이트/아이콘이 빠질 수 있음) |
| `배포용_폴더_만들기.bat` | `python make_deploy.py` 만 실행 |
| `원클릭_배포.bat` | `make_deploy.py` → `git add -A` → commit → `git push origin main` (GitHub Pages) |
| `뷰어_동기화.bat` | `editor.html` → `index.html`/`viewer.html` 단순 복사 (버전 갱신/이미지 분리 없음 — 배포에는 `make_deploy.py` 사용) |
| `도트_GIF_다운로더.bat` | `download_humulos_gifs.py` 실행 |

Electron 앱의 **저장**(`Ctrl+S`)은 `project_data.js` 에 직접 쓰고, **배포 버튼**은 `make_deploy.py` + git push 를 실행합니다(`main.js`).

---

## 6. 조건 판정 로직

### `isEvoRevealed(evo, stage)` (`js/30-state-conditions.js`)
```
유년기I/II, 성장기 → time이 있으면 공개
그 외 성숙기 이상 →
  isIdle=true  OR  note에 "방치/조건없음/시간경과" 포함  → 공개
  바이탈/PP/배틀/승률/조그레스/아이템/던전 중 하나라도 입력  → 공개
  아무것도 없음 → 미공개
```

### `updateDigimonConditionStatus(digi)` (같은 파일)
```
conditionStatus = "known"   → 강제 공개 (수동 override)
conditionStatus = "unknown" → 강제 불명
conditionStatus = "partial" → 강제 일부불명
없을 시:
  incoming 루트 전체 체크
  0개 공개   → unknownTime=true  (조건 불명, 회색)
  일부 공개  → partialUnknown=true (일부 불명, 사선)
  전체 공개  → 둘 다 false (조건 공개, 풀컬러)
```

---

## 7. GAS API (google_apps_script.js)

전체 명세는 [GAS_API_REFERENCE.md](./GAS_API_REFERENCE.md). 자주 쓰는 것만:

| action | 방식 | 설명 |
|---|---|---|
| `sync_live_conditions` | POST | 전체 조건 일괄 업로드 (관리자 배포) |
| `wiki_edit` | POST | 단건 유저 제보/수정 저장 |
| `wiki_revert` / `delete_wiki_history` / `clear_all_wiki_history` | POST | 위키 역사 복구/삭제 |
| `block_uid` / `unblock_uid` | POST | UID 차단/해제 |
| `get_live_conditions` / `get_wiki_history` | GET | 최신 조건 / 변경 역사 로드 |

> 🔑 **관리자 액션은 토큰이 필요합니다.** Apps Script 스크립트 속성 `ADMIN_TOKEN` 과 에디터 [📬 제보 확인] 창의 '관리자 토큰' 칸(이 PC 의 localStorage 에만 저장)이 같아야 합니다. 쓰기는 POST 전용. [GAS_API_REFERENCE.md](./GAS_API_REFERENCE.md) 참고.

---

## 8. 위키 시스템 흐름

```
유저 제보 클릭
  → openReportModalForDigi()      // 모달 오픈, 기존 값 채우기
  → submitReport()                // 저장
      ├─ 즉시 로컬 인메모리 반영 (낙관적 UI)
      ├─ updateDigimonConditionStatus(toDigi)
      ├─ saveState() + renderTree()
      └─ GAS POST: wiki_edit (비동기, no-cors)
           └─ Sheets: 실시간_진화조건 갱신 + 위키_변경역사 기록

관리자 실시간 배포 버튼
  → fetchAndApplyLiveConditions() // 서버 최신 제보 먼저 병합
  → recalculateAllDigimonConditionStatuses()
  → GAS POST: sync_live_conditions (전체 업로드)
```

---

## 9. 위키 역사 모달 버튼 구분

| 버튼 | 동작 |
|---|---|
| `↺ 이 버전으로 복구` | 해당 리비전의 `newData`(편집 결과)를 현재 상태에 적용 |
| `↩ 최근 편집 취소` | **최신 항목(idx=0)에만 노출** / 해당 리비전의 `prevData`(편집 전)를 적용 |

---

## 10. 배포 절차

```bash
# 1. editor.html / css / js / project_data.js 수정 후
python make_deploy.py

# 출력 예시:
# [1/6] base64 이미지 N개를 images/embedded/ 로 분리 ...
# [2/6] 사전 점검 통과 (경고 N건)
# [3/6] 배포 버전 자동 카운트업 완료: v1.3.88 (10.01 22:10)
# [4/6] index.html / viewer.html / dist 최신 UI 생성 완료
# [5/6] 데이터, css/js, 아이콘, 이미지 폴더 복사 완료
# [6/6] handover 문서(버전/함수 위치) 자동 갱신 완료
# [성공] 'v1.3.88' 배포 준비 완료!

# 2. 웹 반영은 git push (원클릭_배포.bat 이 자동 수행)
```

`make_deploy.py` 가 하는 점검(실패 시 버전/배포 폴더를 건드리지 않고 중단): `editor.html` 이 참조하는 css/js 존재, 진화선이 가리키는 디지몬 존재. 경고만 출력: 알 수 없는 세대 값, 남은 base64 이미지, 구형 더미값(1200/8) 진화선, 이미지 파일 누락.

---

## 11. 참조 파일 목록

| 파일 | 설명 |
|---|---|
| [QUICK_START.md](./QUICK_START.md) | 새 AI 를 위한 10분 가이드 (먼저 읽기) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 파일별 구성 및 핵심 함수 위치 (자동 갱신) |
| [CHANGELOG.md](./CHANGELOG.md) | 변경 이력 |
| [DATA_STRUCTURE.md](./DATA_STRUCTURE.md) | 데이터 구조 상세 레퍼런스 |
| [GAS_API_REFERENCE.md](./GAS_API_REFERENCE.md) | GAS API 전체 명세 |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | 알려진 문제와 개선 후보 |
