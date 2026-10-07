# 🗄️ GAS API 레퍼런스

> **소스:** `google_apps_script.js` (Google Apps Script 편집기에 통째로 붙여넣어 배포. 설치 절차는 파일 맨 위 주석 참고)  
> **Webhook URL:** `https://script.google.com/macros/s/AKfycbx1XUIl4kVde4m0G1RhLNiNAloJIR7BVpfvqnSV2Eah8scuEA79Bg3fKYTnqEOttjji/exec`  
> 배포 설정: 웹 앱 / 실행 사용자 "나" / 액세스 **"모든 사용자(Anyone)"** (필수)

> 🔑 **관리자 토큰:** 스크립트 속성 `ADMIN_TOKEN` 에 등록한 값과 요청의 `adminToken` 이 같아야 관리자 액션(아래 표의 🔒)이 실행됩니다. 속성이 없으면 관리자 액션은 전부 `{status:"unauthorized"}` 로 거부됩니다. 에디터는 토큰을 `localStorage["digipet_admin_token"]` 에만 보관합니다(`project` 에 넣으면 project_data.js 로 공개 배포되므로 금지).

> ⚠ **코드를 수정하면 반드시 Apps Script 에서 '새 버전'으로 다시 배포**해야 반영됩니다. 이 저장소의 `google_apps_script.js` 는 소스 보관용이며 자동 배포되지 않습니다.

---

## Google Sheets 탭 구조 (5개)

| 탭 이름 | 역할 |
|---|---|
| `실시간_진화조건` | 현재 공개 중인 전체 진화 조건 (관리자 배포 기준 + 위키 편집이 즉시 반영됨). 컬럼: DiM, 출발, 진화, 속성, 조건상태, 진화 시간, 바이탈, PP, 배틀, 승률, 조그레스, 아이템, 비고, 최종 갱신일시, HP, AP, SPD, 마지막 편집자 |
| `위키_변경역사` | 모든 편집 이력. 컬럼: 리비전 ID, 일시, DiM, 출발, 진화, 변경 요약, 이전 데이터, 변경 데이터, 편집자, 편집 코멘트 |
| `유저_제보` | 유저 제보 보관 (액션 없는 POST 로 쌓임) |
| `제보_휴지통` | 삭제된 제보 (복원/영구삭제 가능) |
| `차단_목록` | 차단된 UID/IP (컬럼: 차단 UID, 차단일시, 사유) |

탭이 없으면 최초 접근 시 자동 생성됩니다.

---

## POST API

모든 요청은 `Content-Type: text/plain` 으로 전송합니다(프리플라이트 회피). 유저 액션(`wiki_edit`, `wiki_revert`)은 `mode: "no-cors"` + 낙관적 UI, **관리자 액션은 `postAdminToGas()`(`js/100-wiki-report.js`)가 응답을 읽어** `unauthorized` 면 알림을 띄웁니다. 모든 POST 는 `LockService` 스크립트 락(최대 20초 대기) 안에서 처리됩니다. 관리자 외 요청은 본문 20,000자 초과 시 거부됩니다.

🔒 관리자 토큰 필요: `sync_live_conditions`, `delete`/`move_to_trash`, `clear_all`/`move_all_to_trash`, `delete_by_uid`, `restore_trash`, `delete_trash_permanent`, `empty_trash`, `block_uid`, `unblock_uid`, `delete_wiki_history`, `clear_all_wiki_history`.

`sync_live_conditions` 는 덮어쓰기 전에 `실시간_진화조건` 을 날짜별 탭 `실시간_진화조건_백업_yyMMdd_HHmmss` 로 복사(최근 10개 보관)하고, 빈 목록은 거부합니다. 덮어쓴 뒤에는 값이 바뀐 진화선마다 `위키_변경역사` 에 편집자 "관리자 배포" 로 기록합니다(응답의 `changedCount`). 그래서 관리자 배포로 지워진 값도 위키 역사에서 되돌릴 수 있습니다.

`실시간_진화조건` 맨 끝 열은 "던전 조건" 입니다(없으면 위키 편집/되돌리기 때 헤더를 자동 보정). 위키 편집/되돌리기는 행을 **DiM + 출발 + 진화** 로 찾습니다(`findConditionRowIndex`). 서버는 `JSON.parse(e.postData.contents)` 로 파싱합니다.

| action | 필수 필드 | 설명 |
|---|---|---|
| (action 없음) | `dim, fromName, toName, ... uid` | 새 유저 제보를 `유저_제보` 에 추가 (차단 UID/IP 면 `status:"blocked"`) |
| `sync_live_conditions` | `conditions[]` | `실시간_진화조건` 을 **clear 후 전체 덮어쓰기** (관리자 배포) |
| `wiki_edit` | `dim, fromName, toName, uid, prevData, newData, ...` | `위키_변경역사` 에 행 추가 + `실시간_진화조건` 해당 행 갱신 (차단 UID/IP 면 거부) |
| `wiki_revert` | `revisionId, uid` | 해당 리비전으로 되돌림 |
| `delete_wiki_history` | `revisionId` | 역사 항목 1건 삭제 |
| `clear_all_wiki_history` | — | 역사 전체 삭제 |
| `delete` / `move_to_trash` | `row` (또는 `id`) | 제보 1건을 휴지통으로 |
| `clear_all` / `move_all_to_trash` | — | 모든 제보를 휴지통으로 |
| `delete_by_uid` | `uid` | 해당 UID 의 모든 제보를 휴지통으로 |
| `restore_trash` | `row` | 휴지통에서 복원 |
| `delete_trash_permanent` | `row` | 휴지통 항목 영구 삭제 |
| `empty_trash` | — | 휴지통 비우기 |
| `block_uid` / `unblock_uid` | `uid` (`reason`) | UID 차단/해제 |

### `sync_live_conditions` 예시
```json
{
  "action": "sync_live_conditions",
  "conditions": [
    { "dim": "아구몬 EX", "from": "아구몬", "to": "그레이몬", "attr": "vaccine", "status": "공개",
      "time": "24시간", "vital": 1200, "pp": 5, "battle": "", "winRate": "", "jogress": "", "item": "",
      "note": "", "baseHp": 1200, "baseAp": 800, "baseSpd": 180, "editor": "관리자 배포" }
  ]
}
```

### `wiki_edit` 예시
```json
{
  "action": "wiki_edit",
  "dim": "아구몬 EX", "fromName": "아구몬", "toName": "그레이몬",
  "uid": "user-uid-string", "rawUid": "...", "maskedIp": "1.2.*.*",
  "comment": "바이탈 수정", "diffSummary": "바이탈: 800 → 1000",
  "prevData": { "vital": 800, "pp": 6 }, "newData": { "vital": 1000, "pp": 6 }
}
```
`prevData`/`newData` 는 시트에 JSON 문자열로 저장됩니다.

---

## GET API

쿼리스트링 방식: `?action=xxx&t={timestamp}` (`t` 는 캐시 방지용). **GET 은 읽기 전용**입니다. 쓰기 액션을 GET 으로 보내면 `{status:"error", message:"이 작업은 POST 요청으로만 가능합니다."}` 를 돌려줍니다.

### `get_live_conditions`
```
GET ?action=get_live_conditions&t=...
→ { "status": "success", "count": N, "conditions": [ { dim, from, to, attr, status, time, vital, pp, ..., lastEditor } ] }
```

### `get_wiki_history`
```
GET ?action=get_wiki_history&t=...&to=<진화 디지몬명>&dim=<DiM>&limit=100
→ { "status": "success", "count": N,
    "history": [ { revisionId, timestamp, dim, fromName, toName, diffSummary, prevData, newData, uid, comment } ],
    "blockedUids": [...] }
```
- `to`/`dim` 필터는 부분 일치(소문자). 필터가 있으면 최근 300행, 없으면 `limit` 행만 스캔합니다 (속도 최적화). 최신순.

### (action 없음) 제보 목록 🔒
제보자 UID/IP 가 들어 있어 관리자 토큰이 필요합니다. 없거나 틀리면 `{status:"unauthorized", reports:[], blockedUids:[]}`.
```
GET ?adminToken=<토큰>&t=...
→ { "status": "success", "count": N, "reports": [...], "trashCount": M, "trash": [...], "blockedUids": [...] }
```

---

## 주의사항

1. **유저 액션은 여전히 누구나 호출할 수 있습니다** (`wiki_edit`, `wiki_revert`, 신규 제보). 위키 특성상 의도된 것이며, 차단 목록·크기 제한만 적용됩니다. UID 는 클라이언트가 보내는 값이라 우회가 가능합니다.
2. **관리자 토큰을 바꾸려면** 스크립트 속성 값을 바꾸고 에디터의 토큰 칸도 같은 값으로 저장하면 됩니다 (재배포 불필요).
3. **유저 액션은 no-cors 전송** — 응답 바디를 읽을 수 없어 낙관적 UI 방식을 채택했습니다. 서버 거부(`blocked`)를 유저 화면에서는 알 수 없습니다.
4. 파싱 실패 시 `data = e.parameter` 로 폴백합니다.
