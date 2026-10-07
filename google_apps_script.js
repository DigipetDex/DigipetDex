/**
 * ============================================================================
 * [디지펫 바이탈 링크] 유저 제보 수집 & 실시간 진화조건 동기화 Google Apps Script
 * ============================================================================
 * 
 * [설치 및 배포 방법 (3분 소요)]
 * 1. 구글 스프레드시트 열기
 * 2. 상단 메뉴에서 [확장 프로그램] ➔ [Apps Script] 클릭
 * 3. 기존 코드를 모두 지우고 이 파일(google_apps_script.js)의 전체 내용을 복사하여 붙여넣기
 * 4. 우측 상단 [배포(Deploy)] 버튼 클릭 ➔ [새 배포(New deployment)] 선택
 *    (기존 배포가 있다면: [배포 관리] ➔ 연필(편집) ➔ 버전을 '새 버전'으로 선택 후 [배포])
 * 5. 설정 확인:
 *    - 웹 앱 (Web app)
 *    - 다음 사용자 모드로 실행: 나 (your-email@gmail.com)
 *    - 액세스 권한: 모든 사용자 (Anyone)  ★ 반드시 '모든 사용자'로 지정!
 * 6. 발급된 "웹 앱 URL"을 디지몬 에디터의 [📬 제보 확인] 창에 등록하세요.
 * 7. ⚙ 프로젝트 설정 ➔ 스크립트 속성에 ADMIN_TOKEN 을 추가하고,
 *    같은 값을 에디터 [📬 제보 확인] 창의 "관리자 토큰" 칸에 저장하세요. (아래 [보안] 참고)
 * ============================================================================
 */

var SHEET_NAME_REPORTS = "유저_제보";
var SHEET_NAME_CONDITIONS = "실시간_진화조건";
var SHEET_NAME_HISTORY = "위키_변경역사";
var SHEET_NAME_TRASH = "제보_휴지통";
var SHEET_NAME_BLOCKED = "차단_목록";

var REPORT_HEADERS = [
  "접수일시",
  "DiM",
  "출발 디지몬",
  "진화 디지몬",
  "진화 시간",
  "필요 바이탈",
  "필요 PP",
  "배틀 횟수",
  "필요 승률(%)",
  "조그레스 파트너",
  "아이템/캡슐",
  "비고/메모",
  "제보자 UID",
  "체력(HP)",
  "전투력(AP)",
  "속도(SPD)"
];

var TRASH_HEADERS = [
  "삭제일시",
  "접수일시",
  "DiM",
  "출발 디지몬",
  "진화 디지몬",
  "진화 시간",
  "필요 바이탈",
  "필요 PP",
  "배틀 횟수",
  "필요 승률(%)",
  "조그레스 파트너",
  "아이템/캡슐",
  "비고/메모",
  "제보자 UID",
  "체력(HP)",
  "전투력(AP)",
  "속도(SPD)"
];

var BLOCKED_HEADERS = [
  "차단 UID",
  "차단일시",
  "사유"
];

var CONDITION_HEADERS = [
  "DiM",
  "출발 디지몬",
  "진화 디지몬",
  "속성",
  "조건상태",
  "진화 시간",
  "필요 바이탈",
  "필요 PP",
  "배틀 횟수",
  "필요 승률(%)",
  "조그레스 파트너",
  "필요 아이템",
  "비고/메모",
  "최종 갱신일시",
  "체력(HP)",
  "전투력(AP)",
  "속도(SPD)",
  "마지막 편집자",
  "던전 조건",
  "상태 고정"
];

var HISTORY_HEADERS = [
  "리비전 ID",
  "일시",
  "DiM",
  "출발 디지몬",
  "진화 디지몬",
  "변경 요약",
  "이전 데이터",
  "변경 데이터",
  "편집자",
  "편집 코멘트"
];

/**
 * ============================================================================
 * [보안] 관리자 토큰
 * ----------------------------------------------------------------------------
 * 아래 액션은 관리자 토큰(adminToken)이 맞아야만 실행됩니다.
 * 토큰 등록: Apps Script 편집기 ➔ ⚙ 프로젝트 설정 ➔ 스크립트 속성
 *            ➔ 속성 "ADMIN_TOKEN", 값은 길고 추측하기 어려운 임의 문자열
 * 토큰이 등록돼 있지 않으면 관리자 액션은 전부 거부됩니다.
 * 에디터에서는 [📬 제보 확인] 창 상단의 "관리자 토큰" 칸에 같은 값을 저장하세요.
 * ============================================================================
 */
var ADMIN_ACTIONS = {
  "sync_live_conditions": true,
  "delete": true,
  "move_to_trash": true,
  "clear_all": true,
  "move_all_to_trash": true,
  "delete_by_uid": true,
  "restore_trash": true,
  "delete_trash_permanent": true,
  "empty_trash": true,
  "block_uid": true,
  "unblock_uid": true,
  "delete_wiki_history": true,
  "clear_all_wiki_history": true
};

// 일반 유저 요청(제보/위키 편집/되돌리기)의 최대 크기 (문자 수)
var MAX_PUBLIC_PAYLOAD = 20000;

function isAdminRequest(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  return !!expected && String(token || "") === expected;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 배포(sync_live_conditions)로 덮어쓰기 전에 실시간_진화조건 시트를 백업 탭으로 복사 (최근 1개 유지)
 */
var CONDITION_BACKUP_KEEP = 10; // 날짜별 백업 탭을 최근 몇 개까지 남길지

function backupConditionSheet(ss, condSheet) {
  if (condSheet.getLastRow() <= 1) return;
  var prefix = SHEET_NAME_CONDITIONS + "_백업_";
  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var backupName = prefix + Utilities.formatDate(new Date(), tz, "yyMMdd_HHmmss");
  var dup = ss.getSheetByName(backupName);
  if (dup) ss.deleteSheet(dup);
  condSheet.copyTo(ss).setName(backupName);

  // 오래된 백업 정리 (이름이 날짜순이므로 정렬해서 앞쪽부터 삭제). 예전 단일 백업 탭도 함께 정리
  var legacy = ss.getSheetByName(SHEET_NAME_CONDITIONS + "_백업");
  if (legacy) ss.deleteSheet(legacy);
  var backups = ss.getSheets().map(function(sh) { return sh.getName(); })
    .filter(function(n) { return n.indexOf(prefix) === 0; }).sort();
  while (backups.length > CONDITION_BACKUP_KEEP) {
    var oldName = backups.shift();
    var oldSheet = ss.getSheetByName(oldName);
    if (oldSheet) ss.deleteSheet(oldSheet);
  }
}

/**
 * 실시간 배포로 값이 바뀌는 진화선을 위키_변경역사에 기록한다 (관리자 배포도 되돌릴 수 있도록).
 * oldVals: 덮어쓰기 전 시트 값(헤더 포함), newRows: 새로 쓸 행들. 기록한 건수 반환.
 */
var AUDIT_FIELDS = [
  ["진화 시간", "time", "진화시간"], ["필요 바이탈", "vital", "바이탈"], ["필요 PP", "pp", "PP"],
  ["배틀 횟수", "battle", "배틀"], ["필요 승률(%)", "winRate", "승률"], ["조그레스 파트너", "jogress", "조그레스"],
  ["필요 아이템", "item", "아이템"], ["비고/메모", "note", "비고"], ["던전 조건", "dungeon", "던전"],
  ["체력(HP)", "baseHp", "체력"], ["전투력(AP)", "baseAp", "전투력"], ["속도(SPD)", "baseSpd", "속도"],
  ["상태 고정", "statusLock", "상태 고정"]
];

function auditNorm(field, v) {
  if (field === "winRate") return cleanWinRate(v);
  if (v === undefined || v === null) return "";
  var t = String(v).trim();
  return (t === "-" || t === "null" || t === "undefined") ? "" : t;
}

function recordSyncHistory(ss, oldVals, newRows, nowStr) {
  if (!oldVals || oldVals.length <= 1) return 0;
  var head = oldVals[0], col = {};
  for (var i = 0; i < head.length; i++) col[String(head[i]).trim()] = i;
  var newCol = {};
  for (var j = 0; j < CONDITION_HEADERS.length; j++) newCol[CONDITION_HEADERS[j]] = j;

  var keyOf = function(dim, from, to) { return dimKey(dim) + "|" + String(from || "").trim() + "|" + String(to || "").trim(); };
  var oldMap = {};
  for (var r = 1; r < oldVals.length; r++) {
    var row = oldVals[r];
    oldMap[keyOf(row[col["DiM"]], row[col["출발 디지몬"]], row[col["진화 디지몬"]])] = row;
  }

  var histSheet = getHistorySheet(ss);
  var nextNum = histSheet.getLastRow();
  var histRows = [];
  newRows.forEach(function(nr) {
    var dim = nr[newCol["DiM"]], from = nr[newCol["출발 디지몬"]], to = nr[newCol["진화 디지몬"]];
    var or = oldMap[keyOf(dim, from, to)];
    if (!or) return; // 새로 생긴 진화선은 기록하지 않음
    var prev = { dim: dim, from: from, to: to }, next = { dim: dim, from: from, to: to }, diffs = [];
    AUDIT_FIELDS.forEach(function(f) {
      var oldV = col[f[0]] !== undefined ? auditNorm(f[1], or[col[f[0]]]) : "";
      var newV = auditNorm(f[1], nr[newCol[f[0]]]);
      prev[f[1]] = oldV; next[f[1]] = newV;
      if (col[f[0]] !== undefined && oldV !== newV) diffs.push(f[2] + ": " + (oldV || "-") + " → " + (newV || "-"));
    });
    if (diffs.length === 0) return;
    histRows.push(["R" + (nextNum++), nowStr, dim, from, to, diffs.join(", "), JSON.stringify(prev), JSON.stringify(next), "관리자 배포", "실시간 배포로 변경"]);
  });
  if (histRows.length > 0) {
    histSheet.getRange(histSheet.getLastRow() + 1, 1, histRows.length, HISTORY_HEADERS.length).setValues(histRows);
  }
  return histRows.length;
}

/**
 * POST 핸들러 (제보 등록, 실시간 조건 동기화, 제보 삭제 등)
 * 권한 확인 + 동시 실행 잠금(LockService) 후 handlePost 로 넘깁니다.
 */
function doPost(e) {
  var rawData = (e && e.postData) ? e.postData.contents : "";
  var data = {};
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch (jsonErr) {
      data = (e && e.parameter) || {};
    }
  } else {
    data = (e && e.parameter) || {};
  }

  if (ADMIN_ACTIONS[data.action]) {
    if (!isAdminRequest(data.adminToken)) {
      return jsonOut({ status: "unauthorized", message: "관리자 토큰이 없거나 일치하지 않습니다." });
    }
  } else if (rawData.length > MAX_PUBLIC_PAYLOAD) {
    return jsonOut({ status: "error", message: "요청 데이터가 너무 큽니다." });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return jsonOut({ status: "error", message: "서버가 다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요." });
  }
  try {
    return handlePost(data);
  } finally {
    lock.releaseLock();
  }
}

function handlePost(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. [실시간 진화 조건 전체 동기화 액션]
    if (data.action === "sync_live_conditions" && Array.isArray(data.conditions)) {
      if (data.conditions.length === 0) {
        return jsonOut({ status: "error", message: "빈 조건 목록으로는 덮어쓸 수 없습니다." });
      }
      var condSheet = ss.getSheetByName(SHEET_NAME_CONDITIONS);
      if (!condSheet) {
        condSheet = ss.insertSheet(SHEET_NAME_CONDITIONS);
      }
      var oldVals = condSheet.getLastRow() > 1
        ? condSheet.getRange(1, 1, condSheet.getLastRow(), Math.max(condSheet.getLastColumn(), 1)).getValues()
        : null;
      backupConditionSheet(ss, condSheet);
      condSheet.clear();
      condSheet.appendRow(CONDITION_HEADERS);

      var timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
      var nowStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");

      var rows = data.conditions.map(function(c) {
        return [
          c.dim || "",
          c.from || "",
          c.to || "",
          c.attr || "",
          c.status || "공개",
          c.time || "",
          c.vital !== undefined && c.vital !== null ? c.vital : "",
          c.pp !== undefined && c.pp !== null ? c.pp : "",
          c.battle !== undefined && c.battle !== null ? c.battle : "",
          cleanWinRate(c.winRate),
          c.jogress || "",
          c.item || "",
          c.note || "",
          nowStr,
          c.baseHp !== undefined && c.baseHp !== null ? c.baseHp : "",
          c.baseAp !== undefined && c.baseAp !== null ? c.baseAp : "",
          c.baseSpd !== undefined && c.baseSpd !== null ? c.baseSpd : "",
          c.editor || "관리자 배포",
          c.dungeon || "",
          c.statusLock || ""
        ];
      });

      if (rows.length > 0) {
        condSheet.getRange(2, 1, rows.length, CONDITION_HEADERS.length).setValues(rows);
      }
      initConditionSheetHeaders(condSheet);
      var changedCount = recordSyncHistory(ss, oldVals, rows, nowStr);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: rows.length + "개의 실시간 진화 조건이 성공적으로 저장되었습니다. (변경 " + changedCount + "건 위키 역사에 기록)",
        count: rows.length,
        changedCount: changedCount,
        updatedAt: nowStr
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. [유저 제보 관리 시트 처리]
    var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
    if (!reportSheet) {
      reportSheet = ss.insertSheet(SHEET_NAME_REPORTS);
      initReportSheetHeaders(reportSheet);
    } else if (reportSheet.getLastRow() === 0) {
      initReportSheetHeaders(reportSheet);
    }

    // 개별 제보 삭제 액션 (휴지통으로 이동)
    if (data.action === "delete" || data.action === "move_to_trash") {
      var rowToDel = parseInt(data.row || data.id, 10);
      var moved = moveReportRowToTrash(ss, rowToDel);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: moved ? "제보가 휴지통으로 이동되었습니다." : "삭제할 행을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 전체 제보 비우기 액션 (모두 휴지통으로 이동)
    if (data.action === "clear_all" || data.action === "move_all_to_trash") {
      var movedCount = moveAllReportsToTrash(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: movedCount + "건의 제보가 휴지통으로 이동되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 특정 UID의 모든 제보 일괄 휴지통 이동 액션
    if (data.action === "delete_by_uid" && data.uid) {
      var uidMoved = moveReportsByUidToTrash(ss, data.uid);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + data.uid + "] 의 제보 " + uidMoved + "건이 휴지통으로 이동되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 휴지통에서 복원 액션
    if (data.action === "restore_trash") {
      var tRow = parseInt(data.row || data.id, 10);
      var restored = restoreTrashRow(ss, tRow);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: restored ? "제보가 성공적으로 복구되었습니다." : "복구할 항목을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 휴지통에서 개별 영구 삭제 액션
    if (data.action === "delete_trash_permanent") {
      var tpRow = parseInt(data.row || data.id, 10);
      var pDeleted = deleteTrashPermanent(ss, tpRow);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: pDeleted ? "휴지통에서 영구 삭제되었습니다." : "삭제할 항목을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 휴지통 전체 영구 비우기 액션
    if (data.action === "empty_trash") {
      var emptied = emptyTrash(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "휴지통이 완전히 비워졌습니다. (" + emptied + "건 영구 삭제)"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // UID 차단 등록 액션
    if (data.action === "block_uid" && data.uid) {
      blockUid(ss, data.uid, data.reason || "관리자 차단");
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + data.uid + "] 차단이 등록되었습니다.",
        blockedUids: getBlockedUids(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // UID 차단 해제 액션
    if (data.action === "unblock_uid" && data.uid) {
      unblockUid(ss, data.uid);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + data.uid + "] 차단이 해제되었습니다.",
        blockedUids: getBlockedUids(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 위키 편집 액션 (유저가 직접 조건/스탯 수정 시 즉시 반영 & 역사 기록)
    if (data.action === "wiki_edit") {
      var clientUid = String(data.uid || "").trim();
      var rawUid = String(data.rawUid || "").trim();
      var maskedIp = String(data.maskedIp || "").trim();
      if (clientUid || rawUid || maskedIp) {
        var blockedList = getBlockedUids(ss);
        var isBlocked = false;
        for (var bi = 0; bi < blockedList.length; bi++) {
          var b = String(blockedList[bi] || "").trim();
          if (!b) continue;
          if ((clientUid && (clientUid.indexOf(b) !== -1 || b.indexOf(clientUid) !== -1)) ||
              (rawUid && (rawUid.indexOf(b) !== -1 || b.indexOf(rawUid) !== -1)) ||
              (maskedIp && (maskedIp.indexOf(b) !== -1 || b.indexOf(maskedIp) !== -1))) {
            isBlocked = true;
            break;
          }
        }
        if (isBlocked) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "blocked",
            message: "편집 권한이 제한된 사용자(차단된 UID/IP)입니다."
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      var editResult = handleWikiEdit(ss, data);
      return ContentService.createTextOutput(JSON.stringify(editResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // 위키 되돌리기 / 롤백 액션
    if (data.action === "wiki_revert") {
      var clientUid = String(data.uid || "").trim();
      var rawUid = String(data.rawUid || "").trim();
      var maskedIp = String(data.maskedIp || "").trim();
      if (clientUid || rawUid || maskedIp) {
        var blockedList = getBlockedUids(ss);
        var isBlocked = false;
        for (var bi = 0; bi < blockedList.length; bi++) {
          var b = String(blockedList[bi] || "").trim();
          if (!b) continue;
          if ((clientUid && (clientUid.indexOf(b) !== -1 || b.indexOf(clientUid) !== -1)) ||
              (rawUid && (rawUid.indexOf(b) !== -1 || b.indexOf(rawUid) !== -1)) ||
              (maskedIp && (maskedIp.indexOf(b) !== -1 || b.indexOf(maskedIp) !== -1))) {
            isBlocked = true;
            break;
          }
        }
        if (isBlocked) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "blocked",
            message: "되돌리기 권한이 제한된 사용자(차단된 UID/IP)입니다."
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      var revertResult = handleWikiRevert(ss, data);
      return ContentService.createTextOutput(JSON.stringify(revertResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // 위키 변경 역사 개별 삭제 액션 (에디터 전용)
    if (data.action === "delete_wiki_history") {
      var revIdToDel = String(data.revisionId || "").trim();
      var delRes = handleDeleteWikiHistory(ss, revIdToDel);
      return ContentService.createTextOutput(JSON.stringify(delRes)).setMimeType(ContentService.MimeType.JSON);
    }

    // 위키 변경 역사 전체 비우기 액션 (에디터 전용)
    if (data.action === "clear_all_wiki_history") {
      var clearRes = handleClearAllWikiHistory(ss);
      return ContentService.createTextOutput(JSON.stringify(clearRes)).setMimeType(ContentService.MimeType.JSON);
    }

    // 신규 제보 추가 (유저 뷰어에서 제보 전송 시)
    var clientUid = String(data.uid || "").trim();
    var rawUid = String(data.rawUid || "").trim();
    var maskedIp = String(data.maskedIp || "").trim();
    if (clientUid || rawUid || maskedIp) {
      var blockedList = getBlockedUids(ss);
      var isBlocked = false;
      for (var bi = 0; bi < blockedList.length; bi++) {
        var b = String(blockedList[bi] || "").trim();
        if (!b) continue;
        if ((clientUid && (clientUid.indexOf(b) !== -1 || b.indexOf(clientUid) !== -1)) ||
            (rawUid && (rawUid.indexOf(b) !== -1 || b.indexOf(rawUid) !== -1)) ||
            (maskedIp && (maskedIp.indexOf(b) !== -1 || b.indexOf(maskedIp) !== -1))) {
          isBlocked = true;
          break;
        }
      }
      if (isBlocked) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "blocked",
          message: "제보가 제한된 사용자(차단된 UID/IP)입니다."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var now = new Date();
    var tz = Session.getScriptTimeZone() || "Asia/Seoul";
    var formattedDate = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss");

    var row = [
      formattedDate,
      data.dim || "",
      data.fromName || data.fromDigi || "",
      data.toName || data.toDigi || "",
      data.time || "",
      data.vital !== undefined && data.vital !== null ? data.vital : "",
      data.pp !== undefined && data.pp !== null ? data.pp : "",
      data.battle !== undefined && data.battle !== null ? data.battle : "",
      data.winRate !== undefined && data.winRate !== null ? data.winRate : "",
      data.jogress || "",
      data.item || "",
      data.note || "",
      clientUid,
      data.baseHp !== undefined && data.baseHp !== null ? data.baseHp : "",
      data.baseAp !== undefined && data.baseAp !== null ? data.baseAp : "",
      data.baseSpd !== undefined && data.baseSpd !== null ? data.baseSpd : ""
    ];

    // 13번째 열(제보자 UID) 헤더 자동 보정
    if (reportSheet.getLastColumn() < 13 || !reportSheet.getRange(1, 13).getValue()) {
      reportSheet.getRange(1, 13).setValue("제보자 UID");
      reportSheet.getRange(1, 13).setBackground("#4F46E5");
      reportSheet.getRange(1, 13).setFontColor("#FFFFFF");
      reportSheet.getRange(1, 13).setFontWeight("bold");
      reportSheet.getRange(1, 13).setHorizontalAlignment("center");
      reportSheet.setColumnWidth(13, 150);
    }

    // 14~16번째 열(기본 스탯) 헤더 자동 보정
    if (reportSheet.getLastColumn() < 16) {
      var statHeaders = ["체력(HP)", "전투력(AP)", "속도(SPD)"];
      var statColors = ["#059669", "#DC2626", "#0284C7"];
      for (var shi = 0; shi < 3; shi++) {
        var colNum = 14 + shi;
        if (!reportSheet.getRange(1, colNum).getValue()) {
          reportSheet.getRange(1, colNum).setValue(statHeaders[shi]);
          reportSheet.getRange(1, colNum).setBackground(statColors[shi]);
          reportSheet.getRange(1, colNum).setFontColor("#FFFFFF");
          reportSheet.getRange(1, colNum).setFontWeight("bold");
          reportSheet.getRange(1, colNum).setHorizontalAlignment("center");
          reportSheet.setColumnWidth(colNum, 90);
        }
      }
    }

    reportSheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "제보가 성공적으로 접수되었습니다. 감사합니다!",
      data: row
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET 핸들러 (실시간 조건 조회, 제보 목록 조회, 삭제 등)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    // 1. [실시간 진화 조건 조회 (뷰어 및 에디터 로드 시 호출)]
    if (action === "get_live_conditions") {
      var condSheet = ss.getSheetByName(SHEET_NAME_CONDITIONS);
      if (!condSheet || condSheet.getLastRow() <= 1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          count: 0,
          conditions: []
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var lastR = condSheet.getLastRow();
      var lastC = condSheet.getLastColumn();
      var allValues = condSheet.getRange(1, 1, lastR, lastC).getValues();
      var headerRow = allValues[0];

      // 헤더 열 위치 동적 맵핑 (속성 컬럼 추가 전후 호환 지원)
      var colMap = {};
      for (var hi = 0; hi < headerRow.length; hi++) {
        colMap[String(headerRow[hi]).trim()] = hi;
      }

      var dimIdx = colMap["DiM"] !== undefined ? colMap["DiM"] : 0;
      var fromIdx = colMap["출발 디지몬"] !== undefined ? colMap["출발 디지몬"] : 1;
      var toIdx = colMap["진화 디지몬"] !== undefined ? colMap["진화 디지몬"] : 2;
      var attrIdx = colMap["속성"];
      var statusIdx = colMap["조건상태"] !== undefined ? colMap["조건상태"] : colMap["상태"];
      var timeIdx = colMap["진화 시간"] !== undefined ? colMap["진화 시간"] : (attrIdx !== undefined ? (statusIdx !== undefined ? 5 : 4) : 3);
      var vitalIdx = colMap["필요 바이탈"];
      var ppIdx = colMap["필요 PP"];
      var battleIdx = colMap["배틀 횟수"];
      var winRateIdx = colMap["필요 승률(%)"];
      var jogressIdx = colMap["조그레스 파트너"];
      var itemIdx = colMap["필요 아이템"];
      var noteIdx = colMap["비고/메모"];
      var updatedIdx = colMap["최종 갱신일시"];
      var hpIdx = colMap["체력(HP)"] !== undefined ? colMap["체력(HP)"] : colMap["HP"];
      var apIdx = colMap["전투력(AP)"] !== undefined ? colMap["전투력(AP)"] : colMap["AP"];
      var spdIdx = colMap["속도(SPD)"] !== undefined ? colMap["속도(SPD)"] : colMap["SPD"];
      var editorIdx = colMap["마지막 편집자"] !== undefined ? colMap["마지막 편집자"] : colMap["편집자"];
      var dungeonIdx = colMap["던전 조건"];
      var lockIdx = colMap["상태 고정"];

      var condList = [];
      for (var ci = 1; ci < allValues.length; ci++) {
        var cr = allValues[ci];
        var fromVal = fromIdx !== undefined ? String(cr[fromIdx] || "").trim() : "";
        var toVal = toIdx !== undefined ? String(cr[toIdx] || "").trim() : "";
        if (!fromVal && !toVal) continue;

        condList.push({
          dim: dimIdx !== undefined ? cr[dimIdx] : "",
          from: fromVal,
          to: toVal,
          attr: attrIdx !== undefined ? cr[attrIdx] : "",
          status: statusIdx !== undefined ? cr[statusIdx] : "",
          time: timeIdx !== undefined ? cr[timeIdx] : "",
          vital: vitalIdx !== undefined ? cr[vitalIdx] : "",
          pp: ppIdx !== undefined ? cr[ppIdx] : "",
          battle: battleIdx !== undefined ? cr[battleIdx] : "",
          winRate: winRateIdx !== undefined ? cleanWinRate(cr[winRateIdx]) : "",
          jogress: jogressIdx !== undefined ? cr[jogressIdx] : "",
          item: itemIdx !== undefined ? cr[itemIdx] : "",
          note: noteIdx !== undefined ? cr[noteIdx] : "",
          updatedAt: updatedIdx !== undefined ? cr[updatedIdx] : "",
          baseHp: hpIdx !== undefined && cr[hpIdx] !== undefined ? String(cr[hpIdx]).trim() : "",
          baseAp: apIdx !== undefined && cr[apIdx] !== undefined ? String(cr[apIdx]).trim() : "",
          baseSpd: spdIdx !== undefined && cr[spdIdx] !== undefined ? String(cr[spdIdx]).trim() : "",
          lastEditor: editorIdx !== undefined && cr[editorIdx] !== undefined ? String(cr[editorIdx]).trim() : "",
          dungeon: dungeonIdx !== undefined && cr[dungeonIdx] !== undefined ? String(cr[dungeonIdx]).trim() : undefined,
          statusLock: lockIdx !== undefined && cr[lockIdx] !== undefined ? String(cr[lockIdx]).trim() : undefined
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: condList.length,
        conditions: condList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. [위키 변경 역사 조회 (최근 변경 순)]
    if (action === "get_wiki_history") {
      var histSheet = ss.getSheetByName(SHEET_NAME_HISTORY);
      if (!histSheet || histSheet.getLastRow() <= 1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          count: 0,
          history: []
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var filterTo = String(e.parameter.to || "").trim().toLowerCase();
      var filterDim = String(e.parameter.dim || "").trim().toLowerCase();
      var limit = parseInt(e.parameter.limit || "100", 10);

      var hLastRow = histSheet.getLastRow();
      if (hLastRow <= 1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          count: 0,
          history: []
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 속도 대폭 최적화: 전체 시트가 아닌 최근 행만 슬라이스 조회하여 GAS 응답 속도 극대화
      var maxScan = (filterTo || filterDim) ? Math.min(hLastRow - 1, 300) : Math.min(hLastRow - 1, limit);
      var startRow = hLastRow - maxScan + 1;
      var allHistVals = histSheet.getRange(startRow, 1, maxScan, HISTORY_HEADERS.length).getValues();

      var historyList = [];
      // 최신순 (역순 탐색)
      for (var hi = allHistVals.length - 1; hi >= 0; hi--) {
        var hr = allHistVals[hi];
        var rRevId = String(hr[0] || "");
        var rTs = (hr[1] instanceof Date) 
          ? Utilities.formatDate(hr[1], Session.getScriptTimeZone() || "Asia/Seoul", "yyyy-MM-dd HH:mm:ss")
          : String(hr[1] || "");
        var rDim = String(hr[2] || "");
        var rFrom = String(hr[3] || "");
        var rTo = String(hr[4] || "");
        var rDiff = String(hr[5] || "");
        var rPrev = String(hr[6] || "");
        var rNew = String(hr[7] || "");
        var rUid = String(hr[8] || "");
        var rComment = String(hr[9] || "");

        if (!rTo && !rFrom && !rRevId) continue;

        if (filterTo && rTo.toLowerCase().indexOf(filterTo) === -1) continue;
        if (filterDim && rDim.toLowerCase().indexOf(filterDim) === -1) continue;

        historyList.push({
          revisionId: rRevId,
          timestamp: rTs,
          dim: rDim,
          fromName: rFrom,
          toName: rTo,
          diffSummary: rDiff,
          prevData: rPrev,
          newData: rNew,
          uid: rUid,
          comment: rComment
        });

        if (historyList.length >= limit) break;
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: historyList.length,
        history: historyList,
        blockedUids: getBlockedUids(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 쓰기 액션은 GET 으로 받지 않음 (주소창 호출 차단). 모두 doPost 로만 처리.
    if (ADMIN_ACTIONS[action] || action === "wiki_edit" || action === "wiki_revert") {
      return jsonOut({ status: "error", message: "이 작업은 POST 요청으로만 가능합니다." });
    }

    // 2. [유저 제보 목록 조회] — 제보자 UID/IP 가 들어 있으므로 관리자 전용
    if (!isAdminRequest(e.parameter.adminToken)) {
      return jsonOut({
        status: "unauthorized",
        message: "제보 목록은 관리자 토큰이 있어야 볼 수 있습니다.",
        reports: [],
        blockedUids: []
      });
    }

    var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
    var blockedList = getBlockedUids(ss);

    // 1) 활성 제보 목록 조회
    var reports = [];
    if (reportSheet && reportSheet.getLastRow() > 1) {
      var lastRow = reportSheet.getLastRow();
      var lastCol = reportSheet.getLastColumn();
      var allReportVals = reportSheet.getRange(1, 1, lastRow, lastCol).getValues();
      var reportHeaderRow = allReportVals[0];

      var rColMap = {};
      for (var rhi = 0; rhi < reportHeaderRow.length; rhi++) {
        rColMap[String(reportHeaderRow[rhi]).trim()] = rhi;
      }

      var tsIdx = rColMap["접수일시"] !== undefined ? rColMap["접수일시"] : 0;
      var rDimIdx = rColMap["DiM"] !== undefined ? rColMap["DiM"] : 1;
      var rFromIdx = rColMap["출발 디지몬"] !== undefined ? rColMap["출발 디지몬"] : 2;
      var rToIdx = rColMap["진화 디지몬"] !== undefined ? rColMap["진화 디지몬"] : 3;
      var rTimeIdx = rColMap["진화 시간"] !== undefined ? rColMap["진화 시간"] : 4;
      var rVitalIdx = rColMap["필요 바이탈"] !== undefined ? rColMap["필요 바이탈"] : 5;
      var rPpIdx = rColMap["필요 PP"] !== undefined ? rColMap["필요 PP"] : 6;
      var rBattleIdx = rColMap["배틀 횟수"] !== undefined ? rColMap["배틀 횟수"] : 7;
      var rWinRateIdx = rColMap["필요 승률(%)"] !== undefined ? rColMap["필요 승률(%)"] : 8;
      var rJogressIdx = rColMap["조그레스 파트너"] !== undefined ? rColMap["조그레스 파트너"] : 9;
      var rItemIdx = rColMap["아이템/캡슐"] !== undefined ? rColMap["아이템/캡슐"] : 10;
      var rNoteIdx = rColMap["비고/메모"] !== undefined ? rColMap["비고/메모"] : 11;
      var rUidIdx = rColMap["제보자 UID"] !== undefined ? rColMap["제보자 UID"] : rColMap["UID"];
      var rHpIdx = rColMap["체력(HP)"] !== undefined ? rColMap["체력(HP)"] : (rColMap["HP"] !== undefined ? rColMap["HP"] : (lastCol >= 14 ? 13 : undefined));
      var rApIdx = rColMap["전투력(AP)"] !== undefined ? rColMap["전투력(AP)"] : (rColMap["AP"] !== undefined ? rColMap["AP"] : (lastCol >= 15 ? 14 : undefined));
      var rSpdIdx = rColMap["속도(SPD)"] !== undefined ? rColMap["속도(SPD)"] : (rColMap["SPD"] !== undefined ? rColMap["SPD"] : (lastCol >= 16 ? 15 : undefined));
      if (rUidIdx === undefined) {
        for (var colKey in rColMap) {
          if (colKey.indexOf("UID") !== -1) {
            rUidIdx = rColMap[colKey];
            break;
          }
        }
      }
      if (rUidIdx === undefined) {
        rUidIdx = 12;
        try {
          if (!reportSheet.getRange(1, 13).getValue()) {
            reportSheet.getRange(1, 13).setValue("제보자 UID");
            reportSheet.getRange(1, 13).setBackground("#4F46E5");
            reportSheet.getRange(1, 13).setFontColor("#FFFFFF");
            reportSheet.getRange(1, 13).setFontWeight("bold");
            reportSheet.getRange(1, 13).setHorizontalAlignment("center");
            reportSheet.setColumnWidth(13, 150);
          }
        } catch (hErr) {}
      }

      for (var ri = 1; ri < allReportVals.length; ri++) {
        var r = allReportVals[ri];
        var fVal = rFromIdx !== undefined ? r[rFromIdx] : r[2];
        var tVal = rToIdx !== undefined ? r[rToIdx] : r[3];
        if (!fVal && !tVal) continue;

        var extractedUid = "";
        if (rUidIdx !== undefined && r[rUidIdx] !== undefined && r[rUidIdx] !== null && String(r[rUidIdx]).trim()) {
          extractedUid = String(r[rUidIdx]).trim();
        } else if (r.length > 12 && r[12] !== undefined && r[12] !== null && String(r[12]).trim()) {
          extractedUid = String(r[12]).trim();
        }

        reports.push({
          id: (ri + 1),
          timestamp: tsIdx !== undefined ? r[tsIdx] : "",
          dim: rDimIdx !== undefined ? r[rDimIdx] : "",
          fromName: fVal || "",
          toName: tVal || "",
          time: rTimeIdx !== undefined ? r[rTimeIdx] : "",
          vital: rVitalIdx !== undefined ? r[rVitalIdx] : "",
          pp: rPpIdx !== undefined ? r[rPpIdx] : "",
          battle: rBattleIdx !== undefined ? r[rBattleIdx] : "",
          winRate: rWinRateIdx !== undefined ? r[rWinRateIdx] : "",
          baseHp: (rHpIdx !== undefined && r[rHpIdx] !== undefined) ? String(r[rHpIdx]).trim() : "",
          baseAp: (rApIdx !== undefined && r[rApIdx] !== undefined) ? String(r[rApIdx]).trim() : "",
          baseSpd: (rSpdIdx !== undefined && r[rSpdIdx] !== undefined) ? String(r[rSpdIdx]).trim() : "",
          jogress: rJogressIdx !== undefined ? r[rJogressIdx] : "",
          item: rItemIdx !== undefined ? r[rItemIdx] : "",
          note: rNoteIdx !== undefined ? r[rNoteIdx] : "",
          uid: extractedUid
        });
      }
    }

    // 2) 휴지통 목록 조회 (제보_휴지통 시트)
    var trash = [];
    var trashSheet = ss.getSheetByName(SHEET_NAME_TRASH);
    if (trashSheet && trashSheet.getLastRow() > 1) {
      var tLastRow = trashSheet.getLastRow();
      var tLastCol = trashSheet.getLastColumn();
      var allTrashVals = trashSheet.getRange(1, 1, tLastRow, tLastCol).getValues();
      var tHeaderRow = allTrashVals[0];
      var tColMap = {};
      for (var thi = 0; thi < tHeaderRow.length; thi++) {
        tColMap[String(tHeaderRow[thi]).trim()] = thi;
      }
      var tDelTsIdx = tColMap["삭제일시"] !== undefined ? tColMap["삭제일시"] : 0;
      var tTsIdx = tColMap["접수일시"] !== undefined ? tColMap["접수일시"] : 1;
      var tDimIdx = tColMap["DiM"] !== undefined ? tColMap["DiM"] : 2;
      var tFromIdx = tColMap["출발 디지몬"] !== undefined ? tColMap["출발 디지몬"] : 3;
      var tToIdx = tColMap["진화 디지몬"] !== undefined ? tColMap["진화 디지몬"] : 4;
      var tTimeIdx = tColMap["진화 시간"] !== undefined ? tColMap["진화 시간"] : 5;
      var tVitalIdx = tColMap["필요 바이탈"] !== undefined ? tColMap["필요 바이탈"] : 6;
      var tPpIdx = tColMap["필요 PP"] !== undefined ? tColMap["필요 PP"] : 7;
      var tBattleIdx = tColMap["배틀 횟수"] !== undefined ? tColMap["배틀 횟수"] : 8;
      var tWinRateIdx = tColMap["필요 승률(%)"] !== undefined ? tColMap["필요 승률(%)"] : 9;
      var tJogressIdx = tColMap["조그레스 파트너"] !== undefined ? tColMap["조그레스 파트너"] : 10;
      var tItemIdx = tColMap["아이템/캡슐"] !== undefined ? tColMap["아이템/캡슐"] : 11;
      var tNoteIdx = tColMap["비고/메모"] !== undefined ? tColMap["비고/메모"] : 12;
      var tUidIdx = tColMap["제보자 UID"] !== undefined ? tColMap["제보자 UID"] : 13;
      var tHpIdx = tColMap["체력(HP)"] !== undefined ? tColMap["체력(HP)"] : (tColMap["HP"] !== undefined ? tColMap["HP"] : (tLastCol >= 15 ? 14 : undefined));
      var tApIdx = tColMap["전투력(AP)"] !== undefined ? tColMap["전투력(AP)"] : (tColMap["AP"] !== undefined ? tColMap["AP"] : (tLastCol >= 16 ? 15 : undefined));
      var tSpdIdx = tColMap["속도(SPD)"] !== undefined ? tColMap["속도(SPD)"] : (tColMap["SPD"] !== undefined ? tColMap["SPD"] : (tLastCol >= 17 ? 16 : undefined));

      for (var ti = 1; ti < allTrashVals.length; ti++) {
        var tr = allTrashVals[ti];
        var tfVal = tFromIdx !== undefined ? tr[tFromIdx] : tr[3];
        var ttVal = tToIdx !== undefined ? tr[tToIdx] : tr[4];
        if (!tfVal && !ttVal) continue;

        var tuidVal = "";
        if (tUidIdx !== undefined && tr[tUidIdx]) tuidVal = String(tr[tUidIdx]).trim();
        else if (tr.length > 13 && tr[13]) tuidVal = String(tr[13]).trim();

        trash.push({
          id: (ti + 1),
          deletedAt: tDelTsIdx !== undefined ? tr[tDelTsIdx] : "",
          timestamp: tTsIdx !== undefined ? tr[tTsIdx] : "",
          dim: tDimIdx !== undefined ? tr[tDimIdx] : "",
          fromName: tfVal || "",
          toName: ttVal || "",
          time: tTimeIdx !== undefined ? tr[tTimeIdx] : "",
          vital: tVitalIdx !== undefined ? tr[tVitalIdx] : "",
          pp: tPpIdx !== undefined ? tr[tPpIdx] : "",
          battle: tBattleIdx !== undefined ? tr[tBattleIdx] : "",
          winRate: tWinRateIdx !== undefined ? tr[tWinRateIdx] : "",
          baseHp: (tHpIdx !== undefined && tr[tHpIdx] !== undefined) ? String(tr[tHpIdx]).trim() : "",
          baseAp: (tApIdx !== undefined && tr[tApIdx] !== undefined) ? String(tr[tApIdx]).trim() : "",
          baseSpd: (tSpdIdx !== undefined && tr[tSpdIdx] !== undefined) ? String(tr[tSpdIdx]).trim() : "",
          jogress: tJogressIdx !== undefined ? tr[tJogressIdx] : "",
          item: tItemIdx !== undefined ? tr[tItemIdx] : "",
          note: tNoteIdx !== undefined ? tr[tNoteIdx] : "",
          uid: tuidVal
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: reports.length,
      reports: reports,
      trashCount: trash.length,
      trash: trash,
      blockedUids: blockedList
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString(),
      reports: [],
      blockedUids: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 차단 시트 객체 반환 및 없으면 생성/초기화
 */
function getBlockedSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME_BLOCKED);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_BLOCKED);
    sheet.appendRow(BLOCKED_HEADERS);
    var hRange = sheet.getRange(1, 1, 1, BLOCKED_HEADERS.length);
    hRange.setBackground("#DC2626");
    hRange.setFontColor("#FFFFFF");
    hRange.setFontWeight("bold");
    hRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160); // 차단 UID
    sheet.setColumnWidth(2, 160); // 차단일시
    sheet.setColumnWidth(3, 240); // 사유
  }
  return sheet;
}

/**
 * 현재 차단된 UID 목록 문자열 배열 반환
 */
function getBlockedUids(ss) {
  var sheet = getBlockedSheet(ss);
  if (sheet.getLastRow() <= 1) return [];
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var list = [];
  for (var i = 0; i < vals.length; i++) {
    var u = String(vals[i][0] || "").trim();
    if (u && list.indexOf(u) === -1) {
      list.push(u);
    }
  }
  return list;
}

/**
 * UID 차단 등록
 */
function blockUid(ss, uid, reason) {
  if (!uid) return;
  var sheet = getBlockedSheet(ss);
  var current = getBlockedUids(ss);
  if (current.indexOf(uid) !== -1) return;
  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var nowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([uid, nowStr, reason || "관리자 차단"]);
}

/**
 * UID 차단 해제
 */
function unblockUid(ss, uid) {
  if (!uid) return;
  var target = String(uid).trim();
  var sheet = getBlockedSheet(ss);
  if (sheet.getLastRow() <= 1) return;
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    var val = String(vals[i][0] || "").trim();
    if (val === target || (val && target && (val.indexOf(target) !== -1 || target.indexOf(val) !== -1))) {
      sheet.deleteRow(i + 2);
    }
  }
}

/**
 * 제보_휴지통 시트 반환 및 없으면 생성/초기화
 */
function getTrashSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME_TRASH);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_TRASH);
    sheet.appendRow(TRASH_HEADERS);
    var hRange = sheet.getRange(1, 1, 1, TRASH_HEADERS.length);
    hRange.setBackground("#475569");
    hRange.setFontColor("#FFFFFF");
    hRange.setFontWeight("bold");
    hRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160); // 삭제일시
    sheet.setColumnWidth(2, 160); // 접수일시
    sheet.setColumnWidth(3, 140); // DiM
    sheet.setColumnWidth(4, 130); // 출발
    sheet.setColumnWidth(5, 130); // 진화
    for (var c = 6; c <= 12; c++) {
      sheet.setColumnWidth(c, 110);
    }
    sheet.setColumnWidth(13, 200); // 비고
    sheet.setColumnWidth(14, 150); // UID
  }
  return sheet;
}

/**
 * 유저_제보 시트의 특정 행을 제보_휴지통으로 이동
 */
function moveReportRowToTrash(ss, rowIdx) {
  var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!reportSheet || rowIdx <= 1 || rowIdx > reportSheet.getLastRow()) return false;
  var trashSheet = getTrashSheet(ss);

  var lastCol = reportSheet.getLastColumn();
  var rowVals = reportSheet.getRange(rowIdx, 1, 1, lastCol).getValues()[0];

  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var deletedAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");

  var trashRow = [deletedAt].concat(rowVals);
  trashSheet.appendRow(trashRow);

  reportSheet.deleteRow(rowIdx);
  return true;
}

/**
 * 유저_제보 시트의 모든 제보 행을 제보_휴지통으로 이동
 */
function moveAllReportsToTrash(ss) {
  var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!reportSheet || reportSheet.getLastRow() <= 1) return 0;
  var trashSheet = getTrashSheet(ss);

  var lastRow = reportSheet.getLastRow();
  var lastCol = reportSheet.getLastColumn();
  var allVals = reportSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var deletedAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");

  var trashRows = allVals.map(function(r) {
    return [deletedAt].concat(r);
  });

  if (trashRows.length > 0) {
    var tLast = trashSheet.getLastRow();
    trashSheet.getRange(tLast + 1, 1, trashRows.length, trashRows[0].length).setValues(trashRows);
    reportSheet.deleteRows(2, lastRow - 1);
  }
  return trashRows.length;
}

/**
 * 특정 UID가 작성한 제보들을 제보_휴지통으로 이동
 */
function moveReportsByUidToTrash(ss, uid) {
  if (!uid) return 0;
  var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!reportSheet || reportSheet.getLastRow() <= 1) return 0;
  var trashSheet = getTrashSheet(ss);

  var lastR = reportSheet.getLastRow();
  var lastC = reportSheet.getLastColumn();
  var allV = reportSheet.getRange(1, 1, lastR, lastC).getValues();
  var header = allV[0];
  var uCol = -1;
  for (var h = 0; h < header.length; h++) {
    if (String(header[h]).indexOf("UID") !== -1) {
      uCol = h;
      break;
    }
  }
  if (uCol === -1) uCol = 12;

  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var deletedAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");

  var count = 0;
  for (var r = allV.length - 1; r >= 1; r--) {
    if (String(allV[r][uCol] || "").trim() === uid) {
      var trashRow = [deletedAt].concat(allV[r]);
      trashSheet.appendRow(trashRow);
      reportSheet.deleteRow(r + 1);
      count++;
    }
  }
  return count;
}

/**
 * 제보_휴지통에서 유저_제보로 행 복원
 */
function restoreTrashRow(ss, trashRowIdx) {
  var trashSheet = getTrashSheet(ss);
  if (!trashSheet || trashRowIdx <= 1 || trashRowIdx > trashSheet.getLastRow()) return false;
  var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!reportSheet) {
    reportSheet = ss.insertSheet(SHEET_NAME_REPORTS);
    initReportSheetHeaders(reportSheet);
  }

  var lastCol = trashSheet.getLastColumn();
  var trashVals = trashSheet.getRange(trashRowIdx, 1, 1, lastCol).getValues()[0];

  // trashVals[0]은 '삭제일시'이므로 제외하고 원본 제보 복원
  var origReportRow = trashVals.slice(1);
  reportSheet.appendRow(origReportRow);

  trashSheet.deleteRow(trashRowIdx);
  return true;
}

/**
 * 제보_휴지통에서 특정 행 영구 삭제
 */
function deleteTrashPermanent(ss, trashRowIdx) {
  var trashSheet = getTrashSheet(ss);
  if (!trashSheet || trashRowIdx <= 1 || trashRowIdx > trashSheet.getLastRow()) return false;
  trashSheet.deleteRow(trashRowIdx);
  return true;
}

/**
 * 제보_휴지통 전체 영구 비우기
 */
function emptyTrash(ss) {
  var trashSheet = getTrashSheet(ss);
  if (!trashSheet || trashSheet.getLastRow() <= 1) return 0;
  var count = trashSheet.getLastRow() - 1;
  trashSheet.deleteRows(2, count);
  return count;
}

/**
 * 제보 시트 서식 초기화 헬퍼 함수
 */
function initReportSheetHeaders(sheet) {
  sheet.appendRow(REPORT_HEADERS);
  var headerRange = sheet.getRange(1, 1, 1, REPORT_HEADERS.length);
  headerRange.setBackground("#2B2D31");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  for (var col = 1; col <= REPORT_HEADERS.length; col++) {
    sheet.setColumnWidth(col, 130);
  }
  sheet.setColumnWidth(1, 150); // 접수일시
  sheet.setColumnWidth(12, 220); // 비고
  sheet.setColumnWidth(13, 150); // 제보자 UID
}

/**
 * 실시간 진화조건 시트 서식 초기화 헬퍼 함수
 */
function initConditionSheetHeaders(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, CONDITION_HEADERS.length);
  headerRange.setBackground("#1E3A8A");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  for (var col = 1; col <= CONDITION_HEADERS.length; col++) {
    sheet.setColumnWidth(col, 120);
  }
  sheet.setColumnWidth(1, 140); // DiM
  sheet.setColumnWidth(2, 130); // 출발 디지몬
  sheet.setColumnWidth(3, 130); // 진화 디지몬
  sheet.setColumnWidth(4, 90);  // 속성
  sheet.setColumnWidth(5, 100); // 조건상태
  sheet.setColumnWidth(13, 200); // 비고
  sheet.setColumnWidth(14, 150); // 갱신일시
  sheet.setColumnWidth(15, 90);  // HP
  sheet.setColumnWidth(16, 90);  // AP
  sheet.setColumnWidth(17, 90);  // SPD
  sheet.setColumnWidth(18, 160); // 마지막 편집자
}

/**
 * 위키_변경역사 시트 반환 및 없으면 생성/초기화
 */
function getHistorySheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_HISTORY);
    sheet.appendRow(HISTORY_HEADERS);
    var hRange = sheet.getRange(1, 1, 1, HISTORY_HEADERS.length);
    hRange.setBackground("#4C1D95"); // 짙은 보라색 (위키 테마)
    hRange.setFontColor("#FFFFFF");
    hRange.setFontWeight("bold");
    hRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);  // 리비전 ID
    sheet.setColumnWidth(2, 150); // 일시
    sheet.setColumnWidth(3, 130); // DiM
    sheet.setColumnWidth(4, 120); // 출발 디지몬
    sheet.setColumnWidth(5, 120); // 진화 디지몬
    sheet.setColumnWidth(6, 260); // 변경 요약
    sheet.setColumnWidth(7, 180); // 이전 데이터
    sheet.setColumnWidth(8, 180); // 변경 데이터
    sheet.setColumnWidth(9, 160); // 편집자 UID
    sheet.setColumnWidth(10, 200); // 코멘트
  }
  return sheet;
}

/**
 * 위키 편집 처리 (실시간_진화조건 즉시 갱신 + 위키_변경역사 리비전 생성)
 */
/**
 * 승률 값 정리: "50%" → "50". 시트에 "50%" 를 그대로 쓰면 숫자 0.5(백분율)로 바뀌어 화면에 0.5% 로 보인다.
 * 이미 0.5 처럼 소수로 바뀐 값은 50 으로 되돌린다.
 */
function cleanWinRate(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return (v > 0 && v <= 1) ? String(Math.round(v * 100)) : String(v);
  return String(v).replace(/%/g, "").trim();
}

/**
 * DiM 이름 비교용 키 (대소문자/공백/상태 아이콘 🚧❌⚠️ 무시, 클라이언트 isDigimonVisibleInDim 과 같은 기준)
 */
function dimKey(dim) {
  return String(dim || "").toLowerCase().replace(/[🚧❌⚠️]/g, "").replace(/\s+/g, "");
}

/**
 * 실시간_진화조건 시트에서 (DiM, 출발, 진화) 가 맞는 행 번호(1부터, 헤더=1) 를 찾는다. 없으면 -1.
 * 같은 출발→진화 이름이 여러 DiM 에 있으므로 DiM 도 반드시 비교한다 (예전에는 이름만 비교해 다른 DiM 행을 덮어썼음).
 */
function findConditionRowIndex(allVals, colMap, targetDim, targetFrom, targetTo) {
  var toIdx = colMap["진화 디지몬"] !== undefined ? colMap["진화 디지몬"] : 2;
  var fromIdx = colMap["출발 디지몬"] !== undefined ? colMap["출발 디지몬"] : 1;
  var dimIdx = colMap["DiM"] !== undefined ? colMap["DiM"] : 0;
  var tTo = String(targetTo || "").trim().toLowerCase();
  var tFrom = String(targetFrom || "").trim().toLowerCase();
  var tDim = dimKey(targetDim);
  for (var ri = 1; ri < allVals.length; ri++) {
    var row = allVals[ri];
    if (String(row[toIdx] || "").trim().toLowerCase() !== tTo) continue;
    var rFrom = String(row[fromIdx] || "").trim().toLowerCase();
    if (tFrom && rFrom && rFrom !== tFrom) continue;
    if (tDim) {
      var rowDims = String(row[dimIdx] || "").split(",").map(dimKey);
      if (rowDims.indexOf(tDim) === -1) continue;
    }
    return ri + 1;
  }
  return -1;
}

/**
 * 실시간_진화조건 헤더에 새 열(예: 던전 조건)이 없으면 채워 넣는다.
 */
function ensureConditionHeaders(condSheet) {
  var lastCol = condSheet.getLastColumn();
  if (lastCol >= CONDITION_HEADERS.length) {
    var cur = condSheet.getRange(1, 1, 1, CONDITION_HEADERS.length).getValues()[0];
    if (String(cur[CONDITION_HEADERS.length - 1]).trim() === CONDITION_HEADERS[CONDITION_HEADERS.length - 1]) return;
  }
  condSheet.getRange(1, 1, 1, CONDITION_HEADERS.length).setValues([CONDITION_HEADERS]);
  initConditionSheetHeaders(condSheet);
}

function handleWikiEdit(ss, data) {
  var condSheet = ss.getSheetByName(SHEET_NAME_CONDITIONS);
  if (!condSheet) {
    condSheet = ss.insertSheet(SHEET_NAME_CONDITIONS);
    initConditionSheetHeaders(condSheet);
  }

  ensureConditionHeaders(condSheet);

  var timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
  var nowStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");

  var targetTo = String(data.toName || data.to || "").trim();
  var targetFrom = String(data.fromName || data.from || "").trim();
  var targetDim = String(data.dim || "").trim();
  var editorUid = String(data.uid || "익명").trim();
  var comment = String(data.comment || "").trim();

  // 기존 행 검색 및 이전 데이터 파악
  var matchedRowIdx = -1;
  var prevSnapshot = data.prevData || {};
  if (typeof prevSnapshot === "string") {
    try { prevSnapshot = JSON.parse(prevSnapshot); } catch (e) { prevSnapshot = {}; }
  }

  var lastRow = condSheet.getLastRow();
  var lastCol = condSheet.getLastColumn();
  if (lastRow > 1) {
    var allVals = condSheet.getRange(1, 1, lastRow, Math.max(lastCol, CONDITION_HEADERS.length)).getValues();
    var headerRow = allVals[0];
    var colMap = {};
    for (var hi = 0; hi < headerRow.length; hi++) colMap[String(headerRow[hi]).trim()] = hi;

    var toIdx = colMap["진화 디지몬"] !== undefined ? colMap["진화 디지몬"] : 2;
    var fromIdx = colMap["출발 디지몬"] !== undefined ? colMap["출발 디지몬"] : 1;
    var dimIdx = colMap["DiM"] !== undefined ? colMap["DiM"] : 0;

    matchedRowIdx = findConditionRowIndex(allVals, colMap, targetDim, targetFrom, targetTo);
    if (matchedRowIdx > 1) {
      var row = allVals[matchedRowIdx - 1];
      var rTo = String(row[toIdx] || "").trim();
      var rFrom = String(row[fromIdx] || "").trim();
      var rDim = String(row[dimIdx] || "").trim();
      {
        {
          if (!data.prevData || Object.keys(data.prevData).length === 0) {
            prevSnapshot = {
              dim: rDim,
              from: rFrom,
              to: rTo,
              attr: colMap["속성"] !== undefined ? row[colMap["속성"]] : "",
              status: colMap["조건상태"] !== undefined ? row[colMap["조건상태"]] : "",
              time: colMap["진화 시간"] !== undefined ? row[colMap["진화 시간"]] : "",
              vital: colMap["필요 바이탈"] !== undefined ? row[colMap["필요 바이탈"]] : "",
              pp: colMap["필요 PP"] !== undefined ? row[colMap["필요 PP"]] : "",
              battle: colMap["배틀 횟수"] !== undefined ? row[colMap["배틀 횟수"]] : "",
              winRate: colMap["필요 승률(%)"] !== undefined ? row[colMap["필요 승률(%)"]] : "",
              jogress: colMap["조그레스 파트너"] !== undefined ? row[colMap["조그레스 파트너"]] : "",
              item: colMap["필요 아이템"] !== undefined ? row[colMap["필요 아이템"]] : "",
              note: colMap["비고/메모"] !== undefined ? row[colMap["비고/메모"]] : "",
              baseHp: colMap["체력(HP)"] !== undefined ? row[colMap["체력(HP)"]] : "",
              baseAp: colMap["전투력(AP)"] !== undefined ? row[colMap["전투력(AP)"]] : "",
              baseSpd: colMap["속도(SPD)"] !== undefined ? row[colMap["속도(SPD)"]] : "",
              dungeon: colMap["던전 조건"] !== undefined ? row[colMap["던전 조건"]] : "",
              statusLock: colMap["상태 고정"] !== undefined ? row[colMap["상태 고정"]] : ""
            };
          }
        }
      }
    }
  }

  function hasVal(val) {
    return val !== undefined && val !== null && String(val).trim() !== "";
  }

  function normalizeDiffVal(v) {
    if (v === undefined || v === null) return "";
    var s = String(v).trim();
    if (s === "-" || s === "null" || s === "undefined") return "";
    return s;
  }

  // 새 데이터 구성 (입력되지 않은 빈 필드는 이전 스냅샷 값을 온전히 보존하여 허위 변경 방지)
  var newSnapshot = {
    dim: targetDim || prevSnapshot.dim || "",
    from: targetFrom || prevSnapshot.from || "",
    to: targetTo,
    attr: hasVal(data.attr) ? data.attr : (prevSnapshot.attr || ""),
    status: hasVal(data.status) ? data.status : (prevSnapshot.status || "공개"),
    time: hasVal(data.time) ? data.time : (prevSnapshot.time || ""),
    vital: hasVal(data.vital) ? data.vital : (prevSnapshot.vital !== undefined && prevSnapshot.vital !== null ? prevSnapshot.vital : ""),
    pp: hasVal(data.pp) ? data.pp : (prevSnapshot.pp !== undefined && prevSnapshot.pp !== null ? prevSnapshot.pp : ""),
    battle: hasVal(data.battle) ? data.battle : (prevSnapshot.battle !== undefined && prevSnapshot.battle !== null ? prevSnapshot.battle : ""),
    winRate: cleanWinRate(hasVal(data.winRate) ? data.winRate : (prevSnapshot.winRate !== undefined && prevSnapshot.winRate !== null ? prevSnapshot.winRate : "")),
    jogress: hasVal(data.jogress) ? data.jogress : (prevSnapshot.jogress || ""),
    item: hasVal(data.item) ? data.item : (prevSnapshot.item || ""),
    note: hasVal(data.note) ? data.note : (prevSnapshot.note || ""),
    baseHp: hasVal(data.baseHp) ? data.baseHp : (prevSnapshot.baseHp !== undefined && prevSnapshot.baseHp !== null ? prevSnapshot.baseHp : ""),
    baseAp: hasVal(data.baseAp) ? data.baseAp : (prevSnapshot.baseAp !== undefined && prevSnapshot.baseAp !== null ? prevSnapshot.baseAp : ""),
    baseSpd: hasVal(data.baseSpd) ? data.baseSpd : (prevSnapshot.baseSpd !== undefined && prevSnapshot.baseSpd !== null ? prevSnapshot.baseSpd : ""),
    // 던전은 "-" 로 "없음"을 보낼 수 있다 (빈칸이면 이전 값 유지)
    dungeon: hasVal(data.dungeon) ? data.dungeon : (prevSnapshot.dungeon || ""),
    // 조건 공개 상태 고정: auto / known / partial / unknown (빈칸이면 이전 값 유지)
    statusLock: hasVal(data.statusLock) ? data.statusLock : (prevSnapshot.statusLock || "")
  };

  // human-readable diff 요약 생성
  var diffParts = [];
  var fieldLabels = {
    time: "진화시간",
    vital: "바이탈",
    pp: "PP",
    battle: "배틀",
    winRate: "승률",
    baseHp: "체력",
    baseAp: "전투력",
    baseSpd: "속도",
    dungeon: "던전",
    statusLock: "상태 고정",
    jogress: "조그레스",
    item: "아이템",
    note: "비고"
  };
  for (var k in fieldLabels) {
    var pVal = normalizeDiffVal(prevSnapshot[k]);
    var nVal = normalizeDiffVal(newSnapshot[k]);
    if (pVal !== nVal) {
      diffParts.push(fieldLabels[k] + ": " + (pVal || "-") + " → " + (nVal || "-"));
    }
  }
  var clientDiff = String(data.diffSummary || "").trim();
  var diffSummary = clientDiff || (diffParts.length > 0 ? diffParts.join(", ") : "조건/스탯 갱신");

  // 실시간 진화조건 시트에 저장
  var rowValues = [
    newSnapshot.dim,
    newSnapshot.from,
    newSnapshot.to,
    newSnapshot.attr,
    newSnapshot.status,
    newSnapshot.time,
    newSnapshot.vital,
    newSnapshot.pp,
    newSnapshot.battle,
    newSnapshot.winRate,
    newSnapshot.jogress,
    newSnapshot.item,
    newSnapshot.note,
    nowStr,
    newSnapshot.baseHp,
    newSnapshot.baseAp,
    newSnapshot.baseSpd,
    editorUid,
    newSnapshot.dungeon,
    newSnapshot.statusLock
  ];

  if (matchedRowIdx > 1) {
    condSheet.getRange(matchedRowIdx, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    condSheet.appendRow(rowValues);
  }

  // 위키 역사 시트에 리비전 기록
  var histSheet = getHistorySheet(ss);
  var revId = "R" + (histSheet.getLastRow());
  var histRow = [
    revId,
    nowStr,
    newSnapshot.dim,
    newSnapshot.from,
    newSnapshot.to,
    diffSummary,
    JSON.stringify(prevSnapshot),
    JSON.stringify(newSnapshot),
    editorUid,
    comment
  ];
  histSheet.appendRow(histRow);

  return {
    status: "success",
    message: "위키 편집이 즉시 도감에 반영되고 역사에 기록되었습니다.",
    revisionId: revId,
    diffSummary: diffSummary,
    updatedAt: nowStr
  };
}

/**
 * 위키 롤백 / 되돌리기 처리
 */
function handleWikiRevert(ss, data) {
  var condSheet = ss.getSheetByName(SHEET_NAME_CONDITIONS);
  if (!condSheet) {
    return { status: "error", message: "진화 조건 시트를 찾을 수 없습니다." };
  }
  ensureConditionHeaders(condSheet);

  var targetTo = String(data.toName || data.to || "").trim();
  var targetFrom = String(data.fromName || data.from || "").trim();
  var targetDim = String(data.dim || "").trim();
  var targetData = data.targetData || {};
  if (typeof targetData === "string") {
    try { targetData = JSON.parse(targetData); } catch (e) { targetData = {}; }
  }

  var timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
  var nowStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
  var editorUid = String(data.uid || "익명").trim();
  var revIdToRevert = String(data.revisionId || "").trim();
  var userComment = String(data.comment || "").trim();

  // 기존 행 검색
  var lastRow = condSheet.getLastRow();
  var matchedRowIdx = -1;
  var currentSnapshot = {};

  if (lastRow > 1) {
    var allVals = condSheet.getRange(1, 1, lastRow, Math.max(condSheet.getLastColumn(), CONDITION_HEADERS.length)).getValues();
    var headerRow = allVals[0];
    var colMap = {};
    for (var hi = 0; hi < headerRow.length; hi++) colMap[String(headerRow[hi]).trim()] = hi;

    var toIdx = colMap["진화 디지몬"] !== undefined ? colMap["진화 디지몬"] : 2;
    var fromIdx = colMap["출발 디지몬"] !== undefined ? colMap["출발 디지몬"] : 1;

    matchedRowIdx = findConditionRowIndex(allVals, colMap, targetData.dim || targetDim, targetFrom, targetTo);
    if (matchedRowIdx > 1) {
      var row = allVals[matchedRowIdx - 1];
      var rTo = String(row[toIdx] || "").trim();
      var rFrom = String(row[fromIdx] || "").trim();
      {
        {
          currentSnapshot = {
            dim: row[colMap["DiM"] !== undefined ? colMap["DiM"] : 0] || "",
            from: rFrom,
            to: rTo,
            attr: colMap["속성"] !== undefined ? row[colMap["속성"]] : "",
            status: colMap["조건상태"] !== undefined ? row[colMap["조건상태"]] : "",
            time: colMap["진화 시간"] !== undefined ? row[colMap["진화 시간"]] : "",
            vital: colMap["필요 바이탈"] !== undefined ? row[colMap["필요 바이탈"]] : "",
            pp: colMap["필요 PP"] !== undefined ? row[colMap["필요 PP"]] : "",
            battle: colMap["배틀 횟수"] !== undefined ? row[colMap["배틀 횟수"]] : "",
            winRate: colMap["필요 승률(%)"] !== undefined ? row[colMap["필요 승률(%)"]] : "",
            jogress: colMap["조그레스 파트너"] !== undefined ? row[colMap["조그레스 파트너"]] : "",
            item: colMap["필요 아이템"] !== undefined ? row[colMap["필요 아이템"]] : "",
            note: colMap["비고/메모"] !== undefined ? row[colMap["비고/메모"]] : "",
            baseHp: colMap["체력(HP)"] !== undefined ? row[colMap["체력(HP)"]] : "",
            baseAp: colMap["전투력(AP)"] !== undefined ? row[colMap["전투력(AP)"]] : "",
            baseSpd: colMap["속도(SPD)"] !== undefined ? row[colMap["속도(SPD)"]] : "",
            dungeon: colMap["던전 조건"] !== undefined ? row[colMap["던전 조건"]] : "",
            statusLock: colMap["상태 고정"] !== undefined ? row[colMap["상태 고정"]] : ""
          };
        }
      }
    }
  }

  var restoredRow = [
    targetData.dim || targetDim || currentSnapshot.dim || "",
    targetData.from || targetFrom || currentSnapshot.from || "",
    targetTo,
    targetData.attr !== undefined ? targetData.attr : (currentSnapshot.attr || ""),
    targetData.status !== undefined ? targetData.status : (currentSnapshot.status || "공개"),
    targetData.time !== undefined ? targetData.time : "",
    targetData.vital !== undefined && targetData.vital !== null ? targetData.vital : "",
    targetData.pp !== undefined && targetData.pp !== null ? targetData.pp : "",
    targetData.battle !== undefined && targetData.battle !== null ? targetData.battle : "",
    cleanWinRate(targetData.winRate),
    targetData.jogress || "",
    targetData.item || "",
    targetData.note || "",
    nowStr,
    targetData.baseHp !== undefined && targetData.baseHp !== null ? targetData.baseHp : "",
    targetData.baseAp !== undefined && targetData.baseAp !== null ? targetData.baseAp : "",
    targetData.baseSpd !== undefined && targetData.baseSpd !== null ? targetData.baseSpd : "",
    editorUid + " [되돌림]",
    targetData.dungeon !== undefined && targetData.dungeon !== null ? targetData.dungeon : (currentSnapshot.dungeon || ""),
    targetData.statusLock !== undefined && targetData.statusLock !== null ? targetData.statusLock : (currentSnapshot.statusLock || "")
  ];

  if (matchedRowIdx > 1) {
    condSheet.getRange(matchedRowIdx, 1, 1, restoredRow.length).setValues([restoredRow]);
  } else {
    condSheet.appendRow(restoredRow);
  }

  // 역사 시트에 되돌리기 기록
  var histSheet = getHistorySheet(ss);
  var newRevId = "R" + (histSheet.getLastRow());
  var diffSummary = "[되돌림] " + (revIdToRevert ? revIdToRevert + " " : "") + "이전 버전으로 복원";
  var commentText = userComment || (revIdToRevert ? revIdToRevert + " 상태로 롤백" : "이전 버전 복원");

  var histRow = [
    newRevId,
    nowStr,
    restoredRow[0],
    restoredRow[1],
    targetTo,
    diffSummary,
    JSON.stringify(currentSnapshot),
    JSON.stringify(targetData),
    editorUid,
    commentText
  ];
  histSheet.appendRow(histRow);

  return {
    status: "success",
    message: "성공적으로 이전 상태로 되돌려졌습니다.",
    revisionId: newRevId,
    restoredData: targetData
  };
}

/**
 * 위키 변경 역사 개별 리비전 삭제 (에디터 전용)
 */
function handleDeleteWikiHistory(ss, revId) {
  if (!revId) {
    return { status: "error", message: "삭제할 리비전 ID가 지정되지 않았습니다." };
  }
  var histSheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!histSheet || histSheet.getLastRow() <= 1) {
    return { status: "error", message: "삭제할 변경 내역이 없습니다." };
  }

  var lastR = histSheet.getLastRow();
  var revVals = histSheet.getRange(2, 1, lastR - 1, 1).getValues();
  var targetRow = -1;

  for (var i = revVals.length - 1; i >= 0; i--) {
    var rId = String(revVals[i][0] || "").trim();
    if (rId === revId || rId.toLowerCase() === revId.toLowerCase()) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow > 1) {
    histSheet.deleteRow(targetRow);
    return {
      status: "success",
      message: "리비전 [" + revId + "] 내역이 성공적으로 삭제되었습니다.",
      deletedRevisionId: revId
    };
  } else {
    return {
      status: "error",
      message: "리비전 [" + revId + "]을 찾을 수 없습니다."
    };
  }
}

/**
 * 위키 변경 역사 전체 비우기 (에디터 전용)
 */
function handleClearAllWikiHistory(ss) {
  var histSheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!histSheet || histSheet.getLastRow() <= 1) {
    return { status: "success", message: "비울 변경 내역이 없습니다.", deletedCount: 0 };
  }

  var count = histSheet.getLastRow() - 1;
  histSheet.deleteRows(2, count);

  return {
    status: "success",
    message: "위키 변경 역사 " + count + "건이 모두 삭제되었습니다.",
    deletedCount: count
  };
}
