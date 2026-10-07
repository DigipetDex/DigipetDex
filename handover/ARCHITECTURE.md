# 🗺️ ARCHITECTURE — 파일 구성 & 핵심 함수 맵

> **마지막 업데이트:** 2026-10-07 (v1.3.95)  
> 아래 두 표(`AUTO:FILES`, `AUTO:FUNCS`)는 `tools/gen_docs.py` 가 배포 때마다 다시 씁니다. 손으로 고치지 마세요. 핵심 함수 목록/역할은 `tools/gen_docs.py` 의 `KEY_FUNCS` 에서 관리합니다.

---

## 소스 구성

이전에는 `editor.html` 하나에 CSS(약 2,400줄)·JS(약 12,000줄)·레거시 데이터(약 3,500줄)가 모두 들어 있었습니다. 지금은 아래처럼 나뉘어 있고, **분리 전후 동작은 동일**합니다 (JS 는 순서를 유지한 채 파일만 나눈 것).

<!-- AUTO:FILES -->
| 파일 | 줄 수 | 내용 |
|---|---:|---|
| `editor.html` | 1,281 | HTML 셸 (마크업 + `<script>` 로드 순서) |
| `css/editor.css` | 2,524 | 전체 스타일 (다크 테마, 모바일 대응) |
| `js/05-img-fallback.js` | 35 | 이미지 로드 실패 폴백(handleDigiImgError) — head 태그에서 가장 먼저 로드 |
| `js/00-config.js` | 4 | 앱 설정 상수 (STORAGE_KEY, APP_VERSION — make_deploy.py가 APP_VERSION을 갱신) |
| `js/10-search-utils.js` | 473 | 영문-한글 디지몬 이름 매핑 및 바이링구얼 검색 유틸 |
| `js/20-mode.js` | 54 | 뷰어/에디터 모드 판별 |
| `js/30-state-conditions.js` | 976 | 프로젝트 상태/저장, 세대별 기본 조건, 동명 동기화, 조건 공개 판정, DiM 필터 |
| `js/40-render-tree.js` | 653 | 진화 트리 캔버스 렌더링 (renderTree 등) |
| `js/50-node-sidebar.js` | 337 | 노드 클릭/연결 모드, 연결선 색상, 우측 패널(사이드바) |
| `js/60-condition-clipboard.js` | 954 | 조건 클립보드 및 조건 입력 핸들러 |
| `js/70-digimon-crud.js` | 164 | 디지몬 추가/삭제/분기 추가 |
| `js/80-export.js` | 340 | 스프레드시트/엑셀/CSV/JSON 내보내기 및 저장 |
| `js/90-zoom-mobile.js` | 251 | 캔버스 줌/팬, 모바일 제스처, 바텀시트 |
| `js/95-training-calc.js` | 337 | 30회 훈련 손익 & 리셋 판독기 |
| `js/96-mode-save-deploy.js` | 116 | 뷰어/에디터 모드 전환 버튼, project_data.js 다이렉트 저장(Ctrl+S), 앱 내 원클릭 배포 버튼 |
| `js/100-wiki-report.js` | 2,369 | 유저 제보/위키 변경역사/GAS 연동/실시간 조건 배포 |
| `js/105-status-board.js` | 204 | 조건 공개 현황판 (DiM별 진화 루트 공개율, 미공개 루트 목록 → 트리 이동/제보) |
| `js/106-attr-chart.js` | 199 | 디지펫 속성 상성표 (헤더 [상성표] 버튼 모달, 선택한 디지몬의 속성 강조) |
| `js/110-planner.js` | 1,135 | 진화 경로 플래너, 저장된 경로 관리 |
| `js/120-planner-canvas.js` | 630 | 플래너 캔버스(PNG/클립보드) 생성 및 window load 초기화 |

> JS 합계 9,231줄. 스크립트는 전부 classic script 이며 **로드 순서 = 실행 순서**입니다 (`editor.html` 의 `<script>` 순서).
<!-- /AUTO:FILES -->

### 로드 방식
- 번들러 없이 `editor.html` 의 `<script src>` 가 순서대로 로드합니다. 전부 classic script 이므로 최상위 `const/let/function` 은 파일 사이에서 전역으로 공유됩니다.
- **`js/05-img-fallback.js` 는 `<head>`** 에서 먼저 로드됩니다. HTML 의 정적 `<img onerror="handleDigiImgError(...)">` 가 본문 스크립트보다 먼저 실행될 수 있기 때문입니다 (분리 과정에서 실제로 발생한 경쟁 상태를 막기 위한 조치).
- `?v=<버전>` 쿼리는 `make_deploy.py` 가 자동으로 갱신합니다 (브라우저 캐시 방지).
- 로컬(`file://`)에서 열 때는 `main.js` 가 Electron 에 `allow-file-access-from-files` 스위치를 줘서, 캔버스 캡쳐가 `images/` 의 스프라이트를 읽을 수 있습니다. 일반 브라우저로 `file://` 을 열면 PNG 캡쳐에서 스프라이트/아이콘이 빠집니다 (웹 서버/GitHub Pages 에서는 정상).

---

## 핵심 함수 위치

<!-- AUTO:FUNCS -->
| 함수 | 위치 | 역할 |
|---|---|---|
| `applyViewerModeUI()` | `js/20-mode.js:15` | 뷰어/에디터 모드에 맞춰 UI·제목·배지 갱신 |
| `saveState()` | `js/30-state-conditions.js:29` | project 를 localStorage 에 자동 저장 |
| `getDefaultReqForStage()` | `js/30-state-conditions.js:48` | 세대별 기본 요건 반환 (시간만, 나머지 빈칸) |
| `ensureDigimonRequirements()` | `js/30-state-conditions.js:114` | 로드 시 기본값 정리 (구형 더미값 1200/8 제거 등) |
| `handleDigiImgError()` | `js/05-img-fallback.js:4` | 이미지 로드 실패 시 폴백 경로 탐색 (js/05 — <head>에서 가장 먼저 로드) |
| `syncSameNameDigimons()` | `js/30-state-conditions.js:249` | 동명 디지몬 간 img/attr/stage/baseHp·Ap·Spd 동기화 |
| `isEvoRevealed()` | `js/30-state-conditions.js:526` | 단일 진화선 공개 여부 판별 |
| `updateDigimonConditionStatus()` | `js/30-state-conditions.js:554` | 해당 디지몬의 모든 incoming 루트 종합 판정 |
| `recalculateAllDigimonConditionStatuses()` | `js/30-state-conditions.js:619` | 전체 디지몬 일괄 재판정 (renderTree 시 매번 호출) |
| `renderTree()` | `js/40-render-tree.js:194` | 진화 트리 전체 렌더링 (recalculate 포함) |
| `updateSidebar()` | `js/60-condition-clipboard.js:149` | 우측 패널(사이드바) 갱신 |
| `handleReqFieldChange()` | `js/60-condition-clipboard.js:660` | 조건 입력 필드 변경 이벤트 핸들러 |
| `executeDirectSave()` | `js/96-mode-save-deploy.js:17` | project_data.js 저장 (Electron IPC / File System API / 다운로드 폴백) |
| `openReportModalForDigi()` | `js/100-wiki-report.js:161` | 위키 제보 모달 오픈 |
| `submitReport()` | `js/100-wiki-report.js:290` | 위키 제보 저장 & GAS 전송 |
| `applyReportToTree()` | `js/100-wiki-report.js:1682` | 제보 1건을 트리에 반영 |
| `renderWikiHistoryListUI()` | `js/100-wiki-report.js:702` | 위키 변경 역사 목록 렌더링 |
| `revertWikiRevision()` | `js/100-wiki-report.js:911` | 위키 역사 롤백 ("restore" | "undo") |
| `syncLiveConditionsToGas()` | `js/100-wiki-report.js:1870` | 전체 조건 GAS 배포 (Pre-Merge 안전장치 포함) |
| `fetchAndApplyLiveConditions()` | `js/100-wiki-report.js:2054` | 서버 최신 조건 로드 & 병합 |
| `collectConditionStats()` | `js/105-status-board.js:28` | 조건 현황판: DiM별 진화 루트 공개/미공개 집계 |
| `openStatusBoardModal()` | `js/105-status-board.js:174` | 조건 현황판 모달 열기 (헤더 [조건 현황] 버튼) |
| `loadImgAsync()` | `js/120-planner-canvas.js:56` | 캔버스용 이미지 로더 (crossOrigin=anonymous, 실패 시 null) |
| `generatePlannerChainCanvas()` | `js/120-planner-canvas.js:81` | 플래너 PNG 캡쳐 렌더링 (Canvas) |
<!-- /AUTO:FUNCS -->

---

## 앱 모드 분기

```js
// js/20-mode.js
const isViewerByPath  = pathname 이 viewer.html / index.html / "/viewer" / "/" 로 끝남
const isViewerByParam = ?view 또는 ?mode=viewer
const isMobileDevice  = window.innerWidth <= 768
let   isViewerMode    = 위 셋 중 하나라도 참
```

- `editor.html` 로 열면 에디터 모드, `index.html`/`viewer.html`/루트(`/`) 로 열면 뷰어 모드입니다. 그래서 배포 사이트(루트)는 항상 뷰어이고, 에디터는 `editor.html` 직접 접속 또는 Electron 으로만 열립니다.
- `body.viewer-mode .editor-only` 는 숨김, 에디터 모드에서는 `.viewer-only` 가 숨김 (CSS).
- 뷰어 모드에서는 localStorage 복원을 건너뛰고 항상 최신 배포 데이터를 사용합니다 (`js/30-state-conditions.js`).

---

## 데이터 흐름

```
digimon_db.js → OFFICIAL_DIGIMON_DB (이름 자동완성/도감)
project_data.js → window.DIGIPET_DEFAULT_DATA
    └─ activeDefaultData (project_data.js 로드 실패 시 빈 프로젝트 + 콘솔 에러)
         └─ project (인메모리; 에디터 모드는 localStorage 값이 있으면 그것을 우선)
              ├─ ensureDigimonRequirements() (더미값 정리)
              └─ fetchAndApplyLiveConditions() (GAS 최신 조건 병합)
                   └─ recalculateAllDigimonConditionStatuses()
                        └─ renderTree()
```

저장: `executeDirectSave()` → Electron 이면 IPC `save-project-data` 로 `project_data.js` 직접 기록, 브라우저면 File System API → 다운로드 순으로 폴백. 저장본에 base64 이미지가 섞여 있어도 다음 `make_deploy.py` 실행 때 자동으로 `images/embedded/` 로 분리됩니다.

---

## 조건 판정 우선순위

```
1. digi.conditionStatus === "known"   → 강제 공개  (관리자 수동 override)
2. digi.conditionStatus === "unknown" → 강제 불명
3. digi.conditionStatus === "partial" → 강제 일부불명
4. stage ∈ [유년기I, 유년기II, 성장기] → 항상 공개
5. isIdle=true 또는 note에 "방치"/"조건없음"/"시간경과" 포함 → 공개
6. incoming 루트 수에 따라:
   ├─ 0개 공개  → unknownTime=true  🌫️
   ├─ 일부 공개 → partialUnknown=true 🌓
   └─ 전체 공개 → 둘 다 false ✅
```

---

## 구형 더미값 자동 정리 (`ensureDigimonRequirements`)

과거 템플릿 기본값 **바이탈 1200 / PP 8**이 실제 조건 없이 방치된 경우, 배틀/승률 등 다른 조건이 함께 없으면 자동으로 빈칸 처리합니다.

```js
// 단, 배틀 등 다른 조건이 있으면 제거하지 않음 (예: 브이드라몬 battle=48)
if ((v === "1200" || v === "1,200") && p === "8" && !hasOther) {
  req.vital = "";
  req.pp = "";
}
```

현재 이 예외로 남아 있는 진화선: 브이몬→브이드라몬, 루가몬→루갈몬 (둘 다 battle=48). 루갈몬 쪽은 브이드라몬 값을 복사한 것일 수 있어 실제 조건 확인이 필요합니다 ([KNOWN_ISSUES.md](./KNOWN_ISSUES.md)).

---

## 진화 플래너 캔버스 아이콘/스프라이트 로드

```js
generatePlannerChainCanvas()   // js/120-planner-canvas.js
  └─ Promise.all(icons.map(loadImgAsync))   // 진화시간/바이탈/PP/승률 .webp
  └─ 디지몬 스프라이트도 loadImgAsync (crossOrigin="anonymous", 실패 시 null → 그리지 않음)
       └─ canvas.toBlob → 클립보드(ClipboardItem) 또는 PNG 다운로드
```

`crossOrigin="anonymous"` 이므로 이미지가 **같은 출처(웹)** 이거나 Electron(`allow-file-access-from-files`) 이어야 캡쳐에 포함됩니다.

---

## 동명 디지몬 동기화 규칙

`syncSameNameDigimons(source)` 동기화 항목:

| 항목 | 동기화 여부 |
|---|---|
| img (이미지) | ✅ |
| attr (속성) | ✅ |
| stage (세대) | ✅ |
| baseHp / baseAp / baseSpd | ✅ |
| req (진화 조건) | ❌ DiM별 고유 유지 |
| unknownTime / partialUnknown | ❌ DiM별 고유 유지 |
