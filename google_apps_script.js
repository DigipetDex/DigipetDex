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
  "비고/메모"
];

var CONDITION_HEADERS = [
  "DiM",
  "출발 디지몬",
  "진화 디지몬",
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

    // 신규 제보 추가 (유저 뷰어에서 제보 전송 시)
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
      data.note || ""
    ];

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
      var lastC = CONDITION_HEADERS.length;
      var cValues = condSheet.getRange(2, 1, lastR - 1, lastC).getValues();

      var condList = [];
      for (var ci = 0; ci < cValues.length; ci++) {
        var cr = cValues[ci];
        if (!cr[1] && !cr[2]) continue;
        condList.push({
          dim: cr[0],
          from: cr[1],
          to: cr[2],
          time: cr[3],
          vital: cr[4],
          pp: cr[5],
          battle: cr[6],
          winRate: cr[7],
          jogress: cr[8],
          item: cr[9],
          note: cr[10],
          updatedAt: cr[11]
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

    if (!reportSheet || reportSheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        reports: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = reportSheet.getLastRow();
    var lastCol = REPORT_HEADERS.length;
    var values = reportSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var reports = [];
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (!r[1] && !r[2] && !r[3]) continue;

      reports.push({
        id: (i + 2),
        timestamp: r[0],
        dim: r[1],
        fromName: r[2],
        toName: r[3],
        time: r[4],
        vital: r[5],
        pp: r[6],
        battle: r[7],
        winRate: r[8],
        jogress: r[9],
        item: r[10],
        note: r[11]
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: reports.length,
      reports: reports
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString(),
      reports: []
    })).setMimeType(ContentService.MimeType.JSON);
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
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(12, 220);
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
  sheet.setColumnWidth(11, 220); // 비고
  sheet.setColumnWidth(12, 160); // 갱신일시
}
