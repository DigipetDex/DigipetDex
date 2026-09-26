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
 * ============================================================================
 */

var SHEET_NAME_REPORTS = "유저_제보";
var SHEET_NAME_CONDITIONS = "실시간_진화조건";
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
  "제보자 UID"
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
  "제보자 UID"
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
  "최종 갱신일시"
];

/**
 * POST 핸들러 (제보 등록, 실시간 조건 동기화, 제보 삭제 등)
 */
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : "";
    var data = {};
    if (rawData) {
      try {
        data = JSON.parse(rawData);
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    } else {
      data = e.parameter || {};
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. [실시간 진화 조건 전체 동기화 액션]
    if (data.action === "sync_live_conditions" && Array.isArray(data.conditions)) {
      var condSheet = ss.getSheetByName(SHEET_NAME_CONDITIONS);
      if (!condSheet) {
        condSheet = ss.insertSheet(SHEET_NAME_CONDITIONS);
      }
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
          c.winRate !== undefined && c.winRate !== null ? c.winRate : "",
          c.jogress || "",
          c.item || "",
          c.note || "",
          nowStr
        ];
      });

      if (rows.length > 0) {
        condSheet.getRange(2, 1, rows.length, CONDITION_HEADERS.length).setValues(rows);
      }
      initConditionSheetHeaders(condSheet);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: rows.length + "개의 실시간 진화 조건이 성공적으로 저장되었습니다.",
        count: rows.length,
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

    // 신규 제보 추가 (유저 뷰어에서 제보 전송 시)
    var clientUid = String(data.uid || "").trim();
    if (clientUid) {
      var blockedList = getBlockedUids(ss);
      if (blockedList.indexOf(clientUid) !== -1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "blocked",
          message: "제보가 제한된 사용자(차단된 UID)입니다."
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
      clientUid
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
          winRate: winRateIdx !== undefined ? cr[winRateIdx] : "",
          jogress: jogressIdx !== undefined ? cr[jogressIdx] : "",
          item: itemIdx !== undefined ? cr[itemIdx] : "",
          note: noteIdx !== undefined ? cr[noteIdx] : "",
          updatedAt: updatedIdx !== undefined ? cr[updatedIdx] : ""
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: condList.length,
        conditions: condList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. [유저 제보 관련 처리]
    var reportSheet = ss.getSheetByName(SHEET_NAME_REPORTS);

    // GET 방식 개별 제보 삭제 (휴지통 이동)
    if (action === "delete" || action === "move_to_trash") {
      var rowToDel = parseInt(e.parameter.row || e.parameter.id, 10);
      var moved = moveReportRowToTrash(ss, rowToDel);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: moved ? "제보가 휴지통으로 이동되었습니다." : "삭제할 행을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 전체 제보 비우기 (휴지통 이동)
    if (action === "clear_all" || action === "move_all_to_trash") {
      var movedCount = moveAllReportsToTrash(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: movedCount + "건의 제보가 휴지통으로 이동되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 특정 UID 제보 일괄 휴지통 이동
    if (action === "delete_by_uid" && e.parameter.uid) {
      var uidMoved = moveReportsByUidToTrash(ss, e.parameter.uid);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + e.parameter.uid + "] 제보 " + uidMoved + "건이 휴지통으로 이동되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 휴지통 복원
    if (action === "restore_trash") {
      var tRow = parseInt(e.parameter.row || e.parameter.id, 10);
      var restored = restoreTrashRow(ss, tRow);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: restored ? "제보가 성공적으로 복구되었습니다." : "복구할 항목을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 휴지통 개별 영구 삭제
    if (action === "delete_trash_permanent") {
      var tpRow = parseInt(e.parameter.row || e.parameter.id, 10);
      var pDeleted = deleteTrashPermanent(ss, tpRow);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: pDeleted ? "휴지통에서 영구 삭제되었습니다." : "삭제할 항목을 찾을 수 없습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 휴지통 전체 영구 비우기
    if (action === "empty_trash") {
      var emptied = emptyTrash(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "휴지통이 완전히 비워졌습니다. (" + emptied + "건 영구 삭제)"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 UID 차단/해제
    if (action === "block_uid") {
      var uidToBlock = String(e.parameter.uid || "").trim();
      if (uidToBlock) blockUid(ss, uidToBlock, e.parameter.reason || "관리자 차단");
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + uidToBlock + "] 차단 완료",
        blockedUids: getBlockedUids(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "unblock_uid") {
      var uidToUnblock = String(e.parameter.uid || "").trim();
      if (uidToUnblock) unblockUid(ss, uidToUnblock);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + uidToUnblock + "] 차단 해제 완료",
        blockedUids: getBlockedUids(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

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
  var sheet = getBlockedSheet(ss);
  if (sheet.getLastRow() <= 1) return;
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || "").trim() === uid) {
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
    sheet.setColumnWidth(col, 130);
  }
  sheet.setColumnWidth(1, 140); // DiM
  sheet.setColumnWidth(4, 100); // 속성
  sheet.setColumnWidth(5, 110); // 조건상태
  sheet.setColumnWidth(13, 220); // 비고
  sheet.setColumnWidth(14, 160); // 갱신일시
}
