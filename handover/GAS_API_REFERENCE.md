# 🗄️ GAS API 레퍼런스

> **소스:** `google_apps_script.js` (Google Apps Script 편집기에 통째로 붙여넣어 배포. 설치 절차는 파일 맨 위 주석 참고)  
> **Webhook URL:** `https://script.google.com/macros/s/AKfycbx1XUIl4kVde4m0G1RhLNiNAloJIR7BVpfvqnSV2Eah8scuEA79Bg3fKYTnqEOttjji/exec`  
> 배포 설정: 웹 앱 / 실행 사용자 "나" / 액세스 **"모든 사용자(Anyone)"** (필수)

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

클라이언트는 `Content-Type: text/plain` + `mode: "no-cors"` 로 전송합니다(프리플라이트 회피). **응답 본문을 읽을 수 없으므로** 클라이언트는 낙관적 UI(로컬 먼저 반영)를 씁니다. 서버는 `JSON.parse(e.postData.contents)` 로 파싱합니다.

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

쿼리스트링 방식: `?action=xxx&t={timestamp}` (`t` 는 캐시 방지용). 위 POST 의 쓰기 액션 대부분(`wiki_edit`, `wiki_revert`, `delete*`, `clear_all*`, `restore_trash`, `empty_trash`, `block_uid`, `unblock_uid`, …)이 **GET 으로도 동작**합니다.

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

### (action 없음) 제보 목록
```
GET ?t=...
→ { "status": "success", "count": N, "reports": [...], "trashCount": M, "trash": [...], "blockedUids": [...] }
```

---

## 주의사항

1. **인증이 없습니다.** 어떤 액션에도 관리자 확인이 없고, 웹 앱이 "모든 사용자" 로 열려 있습니다. URL 은 클라이언트 코드(`js/100-wiki-report.js` 의 `DEFAULT_GAS_WEBHOOK_URL`, `project_data.js` 의 `gasWebhookUrl`)에 공개돼 있으므로 URL 을 아는 사람은 `sync_live_conditions`, `clear_all_wiki_history`, `empty_trash` 등을 호출할 수 있습니다. 차단 목록 검사는 제보/위키 편집에만 적용됩니다. → [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
2. **동시성 보호가 없습니다.** 이전 문서에는 `LockService` 10초 락을 쓴다고 적혀 있었으나 `google_apps_script.js` 에는 `LockService` 호출이 없습니다. 동시에 `sync_live_conditions`(clear 후 쓰기)와 `wiki_edit` 가 겹치면 편집이 유실될 수 있습니다. 클라이언트의 Pre-Merge 안전장치(`syncLiveConditionsToGas` 가 먼저 서버 최신본을 병합)가 이를 완화합니다.
3. **no-cors 전송** — 응답 바디를 읽을 수 없어 낙관적 UI 방식을 채택했습니다. 서버 거부(`blocked`)도 클라이언트가 알 수 없습니다. (GET 은 응답을 읽습니다.)
4. 파싱 실패 시 `data = e.parameter` 로 폴백합니다.
