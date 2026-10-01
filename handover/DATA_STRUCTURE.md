# 📐 DATA_STRUCTURE — 데이터 구조 상세 레퍼런스

> **소스:** `project_data.js` — `window.DIGIPET_DEFAULT_DATA` (2026-10-01 실제 데이터로 검증)

---

## 최상위 구조

```js
{
  dims: string[],                      // DiM 카드 이름 목록 (순서 = 탭 순서)
  dimMeta: { [dimName]: DiMeta },      // DiM 메타정보
  digimons: { [id]: Digimon },         // 디지몬 객체 맵
  evolutions: Evolution[],             // 진화선 배열
  gasWebhookUrl: string                // GAS Webhook URL
}
```

파일 형식은 항상 아래 두 줄 헤더 + `JSON.stringify(project, null, 2)` + `;` 입니다 (Electron 저장, `tools/externalize_images.py` 모두 같은 형식).
```js
// 디지펫 바이탈 링크 프로젝트 데이터
window.DIGIPET_DEFAULT_DATA = { ... };
```

---

## DiM (`dims`, `dimMeta`)

```js
dims: ["아구몬 EX", "감마몬", "에인션트 워리어즈(브이몬)", "미스틱 페더(피요몬)🚧", "매드 블랙 로어(아구몬 흑)❌", ...]
dimMeta: { "아구몬 EX": { location: "데이터 초원" } }   // 등장 지역 (선택)
```
- 이름 끝의 `🚧`(작업 중), `❌`(레이드 보상 등 특수 카드) 같은 표식은 **이름의 일부**입니다. 이름이 바뀌면 `digimon.dim` 과 `dimMeta` 키가 함께 바뀌어야 합니다 (`renameDim()` 이 처리).
- `digimon.dim` 은 단일 문자열입니다 (쉼표 구분 다중 DiM 없음 — 현재 0건). 한 개 디지몬이 여러 DiM 에 나오면 DiM 마다 **별도 디지몬 객체**를 만들고, 동명 객체는 `syncSameNameDigimons()` 로 이미지/속성/세대/스탯을 맞춥니다.
- 알려진 불일치: 메탈가루몬(`metalgarurumon`)의 `dim` 이 빈 문자열입니다. 또 `dims` 38개 중 1개는 `dimMeta` 항목이 없습니다 ([KNOWN_ISSUES.md](./KNOWN_ISSUES.md)).

---

## 디지몬 객체 (`Digimon`)

```ts
{
  id: string,             // "greymon", "digitama_bota", "digi_1790192360278" (신규는 타임스탬프 기반)
  name: string,           // "그레이몬"
  stage: Stage,           // 세대 (아래 참조)
  attr: "vaccine" | "data" | "virus" | "free" | "none",   // ⚠ 영문 키 (화면 표시는 백신/데이터/바이러스/프리/-)
  img: string,            // "images/embedded/<해시>.gif" | "아구몬/Greymon.gif" | URL | (구형) data URI
  dim: string,            // 소속 DiM 이름
  digitama?: string,      // [레거시/미사용] 일부(36종)에만 있고 값이 '아구몬 EX' / '알 종류' / '파피몬 EX 알' 등으로 제각각. 코드에서 읽지 않음
  order: number,          // 같은 세대 컬럼 안에서의 정렬 순서 (드래그로 변경)
  lineColor: string,      // 이 디지몬으로 들어오는 선 기본 색 (hex)

  // 기본 스탯 (선택)
  baseHp?: number, baseAp?: number, baseSpd?: number,

  // 조건
  independentReq?: boolean, // false 가 아니면 true 로 취급. DiM별 독립 조건 사용 여부 (현재 370개 true)
  req?: Requirement,        // 기본 진화 조건 (단일 루트/폴백용)

  // 조건 공개 상태 (updateDigimonConditionStatus 가 자동 계산)
  unknownTime: boolean,     // true = 조건 불명 (전체 회색)
  partialUnknown: boolean,  // true = 일부 불명 (사선 반반)
  conditionStatus?: "known" | "unknown" | "partial" | null   // 수동 override (있으면 자동 계산보다 우선; 현재 0건)
}
```

### 세대(`Stage`)
```
"디지타마" "유년기 I" "유년기 II" "성장기" "성숙기" "완전체"
"궁극체" "궁극체2" "초궁극체" "초궁극체II" "아머체"
```
- `궁극체2` — 2026-09-30 추가 (궁극체에서 폼체인지하지만 초궁극체는 아닌 경우). 현재 1종.
- `digimon_db.js` 에는 추가로 `"불명"` 이 있으며 이는 프로젝트 `stage` 값으로는 쓰이지 않습니다.

### stageOrder (트리 컬럼 순서)
```js
const stageOrder = ["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체",
                    "궁극체", "궁극체2", "초궁극체", "초궁극체II", "아머체"];
```

### 이미지 (`img`) 규칙
- 새 구조: `images/embedded/<sha1 앞 16자>.<gif|png|jpg|webp>` — 같은 이미지는 하나의 파일을 공유합니다 (디지몬 659개가 586개 파일).
- 에디터에서 새 이미지를 올리면 임시로 data URI 가 들어갈 수 있고, **다음 `make_deploy.py` 가 자동으로 파일로 분리**합니다.
- 일부 디지몬은 `아구몬/Agumon.gif` 같은 로컬 폴더 경로를 씁니다. 로드 실패 시 `handleDigiImgError()` 가 `sprites/`, `아구몬/`, `파피몬/` 순으로 파일명 폴백을 시도합니다.

---

## 진화 조건 (`Requirement`)

```ts
{
  time: string,                 // "1시간" | "3시간" | "24시간" | "36시간" | "48시간" | "-" ...
  vital: number | string,       // 필요 바이탈 (""=미입력). 숫자/문자열이 섞여 있음
  pp: number | string,          // 필요 PP (""=미입력)
  battle: number | string,      // 배틀 횟수 (예: 48, "100회 이상")
  winRate: string,              // 승률 (예: "50%", "70")
  dungeon: string,              // 던전 조건 ("-" 또는 "")
  jogress: string,              // 조그레스 파트너 이름
  item: string,                 // 필요 아이템
  note: string,                 // 비고/메모
  isIdle?: boolean              // true = 방치 진화 (시간 경과만으로 진화) — 현재 1건
}
```
> `vital`/`pp`/`battle` 은 number 와 string 이 섞여 있으므로 비교할 때 `String(v)` 로 맞추세요 (예: `ensureDigimonRequirements` 의 더미값 판정).

---

## 진화선 (`Evolution`)

```ts
{
  from: string,        // 출발 디지몬 ID
  to: string,          // 도착 디지몬 ID
  lineColor: string,   // 진화선 색상 (hex, e.g. "#EF4444")
  // + Requirement 와 동일한 필드 (time, vital, pp, battle, winRate, dungeon, jogress, item, note, isIdle?)
}
```

---

## 위키 역사 항목 (`WikiHistoryItem`, GAS `get_wiki_history` 응답)

```ts
{
  revisionId: string,   // "rev_..." (GAS 가 부여)
  timestamp: string,    // "yyyy-MM-dd HH:mm:ss" (스크립트 시간대, ISO 8601 아님)
  dim: string,
  fromName: string,
  toName: string,
  diffSummary: string,  // "바이탈: 800 → 1000" (또는 "조건/스탯 갱신")
  prevData: string,     // 편집 전 스냅샷 — 시트 셀에 저장된 JSON 문자열 (클라이언트에서 JSON.parse)
  newData: string,      // 편집 후 스냅샷 — 동일
  uid: string,          // 편집자 UID (되돌림이면 " [되돌림]" 이 붙음)
  comment: string       // 편집 사유
}
```

### `diffSummary`가 "조건/스탯 갱신"으로만 나오는 경우
- prevData ↔ newData 비교 시 수치 차이가 없거나
- 코멘트만 입력하고 실제 조건 변경이 없을 때 출력되는 폴백 문구

---

## `digimon_db.js` 구조

```js
const OFFICIAL_DIGIMON_DB = {              // ⚠ window.* 가 아니라 전역 const
  "노스페라몬": { attr: "virus", stage: "궁극체", dir: "nosferamon" },
  "아르티오몬": { attr: "vaccine", stage: "궁극체", dir: "artiomon" },
  ...
}
```
- 키 = 한글 이름, 값 = `{ attr(영문 키), stage, dir(영문 폴더/파일명 슬러그) }`, 1,310종.
- 위키 편집 모달의 `<datalist>` 자동완성과 이름 입력 시 속성/세대 자동 채우기(`applyDigimonInfoByName`)에 사용.
- 영어 이름 검색용 별칭은 `js/10-search-utils.js` 의 `COMMON_ENGLISH_DIGI_ALIASES` 에 있습니다.

---

## 특수 값 컨벤션

| 값 | 의미 |
|---|---|
| `""` (빈 문자열) | 미입력 / 해당 없음 |
| `"-"` | 명시적으로 없음 (던전 등) |
| `"없음"` | 사용자가 직접 없음 입력 (jogress, item 필드) |
| `"불명"` | 진화 시간이 알려지지 않은 경우 |
