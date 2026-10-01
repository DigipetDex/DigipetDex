# 📋 CHANGELOG — 버전 이력

> v1.3.72 이후의 변경 이력입니다. 새 항목은 맨 위에 추가하세요. (버전 번호는 `make_deploy.py` 가 배포할 때마다 patch 를 1씩 올립니다.)

---

## 구조 개편 — 다음 배포(v1.3.88)에 포함 (2026-10-01)
기능 변화 없이 유지보수성을 높이는 작업입니다. 분리 전후를 Chromium(Playwright)으로 비교했습니다 — 전역 이름 217개, DOM/데이터 수, 화면 픽셀, 플래너 PNG 캡쳐(웹 기준 바이트 단위 동일)가 모두 같았습니다.

### Changed
- **`editor.html` 단일 파일 분리:** 약 15,600줄 → HTML 셸 + `css/editor.css` + `js/*.js` (섹션 경계에서 순서 유지, 이어붙이면 원본 스크립트와 완전히 같음을 검증). 파일 목록은 [ARCHITECTURE.md](./ARCHITECTURE.md) 참고
- **인라인 레거시 데이터 분리:** `editor.html` 안의 약 3,500줄짜리 `defaultProject` → `js/legacy/default-project.js` (동작 동일. 오래된 데이터라 삭제 후보 — KNOWN_ISSUES 참고)
- **`project_data.js` 5.0MB → 0.7MB:** base64 이미지 659개(중복 제거 후 586개, 4.1MB)를 `images/embedded/<해시>.<확장자>` 로 분리. 이미지 바이트와 나머지 데이터는 완전히 동일함을 검증
- **`make_deploy.py` 재작성:** 새 구조 반영, 이미지 자동 외부화, 사전 점검(참조 파일 존재/진화선 무결성), 실패 시 버전·배포 폴더 보존, 하드코딩된 스프라이트 폴더 목록 대신 데이터에서 폴더 자동 탐지, 문서 자동 갱신(`tools/gen_docs.py`)
- **`main.js`:** Electron 에 `allow-file-access-from-files` 스위치 추가 (로컬에서 플래너 PNG 캡쳐가 분리된 스프라이트를 읽도록)
- **handover 문서 전면 정정** — 아래 "문서 정정 내역" 참고

### Fixed
- `make_deploy.py` 의 스프라이트 폴더 목록에 키릴 문자가 섞인 오타(`허мит인더정글`)가 있어 해당 폴더가 복사되지 않던 문제 (목록 자체를 자동 탐지로 교체)
- `make_deploy.py` 가 `editor.html`↔`viewer.html` 하드링크 상태에서 `SameFileError` 를 조용히 삼키던 부분을 명시적 처리로 변경
- `handleDigiImgError` 를 `js/05-img-fallback.js` 로 분리해 `<head>` 에서 먼저 로드 (정적 `<img onerror>` 가 스크립트 분리 후 먼저 실행되어 `is not defined` 가 나던 경쟁 상태 방지) + 지연 참조 안전장치

### Added
- `tools/externalize_images.py` (idempotent, `--check` 지원), `tools/gen_docs.py`
- `handover/KNOWN_ISSUES.md`

### 문서 정정 내역
| 항목 | 이전 문서 | 실제 |
|---|---|---|
| 배포 대상 | Netlify (`dist/`) | GitHub Pages (저장소 루트, `git push origin main`) |
| 현재 버전 | v1.3.86 | v1.3.87 (v1.3.87 의 변경 내용은 기록되지 않음) |
| 줄바꿈 | LF 전용 | 예전 `editor.html` 은 CRLF (Windows 텍스트 모드 저장). 지금 새 파일은 LF |
| `digimon_db.js` | `window.DIGIMON_OFFICIAL_DB` 배열 (`nameKo/nameEn/...`) | 전역 `const OFFICIAL_DIGIMON_DB` 객체 `{한글이름: {attr, stage, dir}}`, 1,310종 |
| `attr` 값 | "백신/데이터/…" | `vaccine/data/virus/free/none` |
| Digimon 필드 | `unknownTime`, `req` 등 | + `digitama`(레거시), `order`, `lineColor`, `independentReq` |
| GAS 시트 탭 | 4개 (`유저제보_임시목록`, `차단_UID`) | 5개 (`유저_제보`, `제보_휴지통`, `차단_목록`, `실시간_진화조건`, `위키_변경역사`) |
| GAS 동시성 | `LockService` 10초 락 | LockService 사용 없음 |
| GAS 액션 | 9개 | + `clear_all`, `delete_by_uid`, `restore_trash`, `delete_trash_permanent`, `empty_trash`, 액션 없는 POST(제보 등록), GET 쓰기 액션 |
| 위키 역사 `prevData/newData` | object | 문자열(JSON) / `timestamp` 는 ISO 가 아닌 `yyyy-MM-dd HH:mm:ss` |
| `updateSidebar` 줄 번호 | ~9,695 | 9,450 (이제 파일:줄 로 자동 표기) |
| 문서에 없던 것 | — | Electron 래퍼(`main.js`), `.bat` 도구 모음, git, 인라인 레거시 데이터 |

---

## v1.3.87 (2026-10-01 21:07)
- 변경 내용 미기록. 핸드오버 문서(v1.3.86 기준) 작성 직후에 배포된 버전입니다. 확인하려면 `git log` / `git diff` 를 보세요.

---

## v1.3.86 (2026-10-01)
### Added
- **방치 시 진화 체크박스 (`isIdle`)** 추가
  - 에디터 사이드바 `달성 조건` 영역 상단에 `⏳ 방치 시 진화` 체크박스 추가
  - 위키 제보/편집 모달 상단에도 동일 체크박스 추가
  - 체크 시 비고에 `방치 진화` 자동 기록, 조건 공개로 판정

---

## v1.3.85 (2026-10-01)
### Fixed
- **방치 진화 자동 인식** — note에 `방치`/`조건없음`/`시간경과` 포함 시 공개 판정
- **수동 conditionStatus override** 추가 — 사이드바 버튼 클릭 시 `digi.conditionStatus` 필드 저장, 자동 재계산보다 우선 적용

---

## v1.3.84 (2026-10-01)
### Fixed
- **구형 더미값 1200/8 일괄 정리** — `project_data.js` 내 바이탈 1200 / PP 8이 다른 조건 없이 방치된 25개 진화선 및 10개 디지몬 `req` 빈칸 처리
- **`ensureDigimonRequirements()`에 자동 필터 추가** — 로드 시마다 구형 더미값 자동 정리

---

## v1.3.83 (2026-10-01)
### Fixed
- **`updateDigimonConditionStatus()` 전면 재작성**
  - 단일 루트에서도 조건이 비어있으면 `unknownTime=true` (조건 불명) 복원
  - `유년기/성장기`는 진화 시간만으로 항상 공개 처리
- **`renderTree()` 내 `recalculateAllDigimonConditionStatuses()` 호출 추가** — 화면 재렌더 시마다 항상 최신 상태 반영

---

## v1.3.82 (2026-10-01)
### Added
- **실시간 조건 배포 안전장치** — `[실시간 조건 배포]` 버튼 클릭 시 서버 최신 제보를 먼저 `fetchAndApplyLiveConditions()`로 병합 후 배포 (유저 기여분 덮어쓰기 방지)

---

## v1.3.80 (2026-10-01)
### Fixed
- **조건 모두 비워도 조건 공개로 표시되는 버그 수정** — 진화 시간만 있는 성숙기 이상 디지몬이 공개로 오판정되던 문제 해결

---

## v1.3.78 (2026-10-01)
### Changed
- **`↩ 최근 편집 취소` 버튼** — 가장 최신 기록(idx=0)에서만 표시되도록 변경 (과거 항목에서는 의미 없으므로 숨김)
- 버튼 텍스트: `이 편집 취소` → `↩ 최근 편집 취소`

---

## v1.3.77 (2026-10-01)
### Fixed
- **여러 루트 중 한 루트만 밝혀져도 전체 조건 공개로 뜨는 버그** (`submitReport` 내 `toDigi.unknownTime = false` 직접 세팅 제거 → `updateDigimonConditionStatus(toDigi)` 호출로 교체)

---

## v1.3.75 (2026-09-30)
### Fixed
- **빈 컬럼 표시 조건** — `궁극체2`, `초궁극체`, `초궁극체II`, `아머체`는 해당 디지몬 있을 때만 컬럼 표시

---

## v1.3.74 (2026-09-30)
### Fixed
- **캡쳐 이미지 버블 조그레스 파트너명 잘림** 수정
  - 버블 높이 동적 계산 (내용 양에 따라 확장)
  - 조그레스 파트너명: 라벨과 파트너명 2줄 분리 표시
  - 말줄임(`…`) 처리

---

## v1.3.73 (2026-09-30)
### Added
- **캡쳐 이미지 내 아이콘 표시** — `generatePlannerChainCanvas()` 내 조건 아이콘(진화시간/바이탈/PP/승률) 사전 로드 및 캔버스 렌더링

---

## v1.3.72 (2026-09-30)
### Added
- **궁극체2 세대 추가**
  - `edit-stage` select 옵션, 플래너 스테이지 칩 추가
  - `getDefaultReqForStage()` — 궁극체2 → 48시간
  - `stageOrder` 배열에 삽입
  - Excel/Sheets `stageOrderMap` 갱신
  - `create_template.py`, `export_to_excel_by_dim.py`, `export_to_sheets.py` 업데이트

---

## 버전 이전 (참고용)
> ~v1.3.71 에 구현 완료된 기능:
- 전체 에디터/뷰어 UI 프레임
- 위키 제보 모달 및 GAS 연동
- 위키 변경 역사 모달 (diff/rollback/UID 차단)
- 진화 플래너 및 캡쳐
- 낙관적 UI (즉시 로컬 반영)
- 동명 디지몬 동기화
- 조건 클립보드 복사/붙여넣기
- Excel/Sheets 내보내기
- GitHub Pages 배포 파이프라인 (원클릭 배포; 이전 문서는 Netlify 로 적었으나 실제는 git push)
