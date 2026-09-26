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

    // 개별 제보 삭제 액션
    if (data.action === "delete") {
      var rowToDel = parseInt(data.row || data.id, 10);
      if (rowToDel > 1 && rowToDel <= reportSheet.getLastRow()) {
        reportSheet.deleteRow(rowToDel);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 전체 제보 비우기 액션
    if (data.action === "clear_all") {
      if (reportSheet.getLastRow() > 1) {
        reportSheet.deleteRows(2, reportSheet.getLastRow() - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "모든 제보가 삭제되었습니다."
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

    // 특정 UID의 모든 제보 일괄 삭제 액션
    if (data.action === "delete_by_uid" && data.uid) {
      deleteReportsByUid(ss, data.uid);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "UID [" + data.uid + "] 의 모든 제보가 삭제되었습니다."
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

    // GET 방식 개별 제보 삭제
    if (action === "delete") {
      var rowToDel = parseInt(e.parameter.row || e.parameter.id, 10);
      if (reportSheet && rowToDel > 1 && rowToDel <= reportSheet.getLastRow()) {
        reportSheet.deleteRow(rowToDel);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // GET 방식 전체 제보 비우기
    if (action === "clear_all") {
      if (reportSheet && reportSheet.getLastRow() > 1) {
        reportSheet.deleteRows(2, reportSheet.getLastRow() - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "모든 제보가 삭제되었습니다."
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

    if (!reportSheet || reportSheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        reports: [],
        blockedUids: blockedList
      })).setMimeType(ContentService.MimeType.JSON);
    }

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
    // 헤더에 명시되지 않았으나 13열 이상이 존재하거나 빈 경우 12(13번째 열)를 기본값으로 지정
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

    var reports = [];
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

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: reports.length,
      reports: reports,
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
 * 특정 UID가 등록한 모든 제보 일괄 삭제
 */
function deleteReportsByUid(ss, uid) {
  if (!uid) return;
  var sheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!sheet || sheet.getLastRow() <= 1) return;
  var lastR = sheet.getLastRow();
  var lastC = sheet.getLastColumn();
  var allV = sheet.getRange(1, 1, lastR, lastC).getValues();
  var header = allV[0];
  var uCol = -1;
  for (var h = 0; h < header.length; h++) {
    if (String(header[h]).indexOf("UID") !== -1) {
      uCol = h;
      break;
    }
  }
  if (uCol === -1) uCol = 12; // 13번째 열 (0-indexed 12)
  for (var r = allV.length - 1; r >= 1; r--) {
    if (String(allV[r][uCol] || "").trim() === uid) {
      sheet.deleteRow(r + 1);
    }
  }
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
