/**
 * ============================================================================
 * [디지펫 바이탈 링크] 유저 제보 수집 & 에디터 연동 Google Apps Script
 * ============================================================================
 * 
 * [설치 및 배포 방법 (3분 소요)]
 * 1. 구글 스프레드시트 열기 (기존 작업 시트 또는 새 스프레드시트)
 * 2. 상단 메뉴에서 [확장 프로그램] ➔ [Apps Script] 클릭
 * 3. 기존 코드를 모두 지우고 이 파일(google_apps_script.js)의 전체 내용을 복사하여 붙여넣기
 * 4. 우측 상단 [배포(Deploy)] 버튼 클릭 ➔ [새 배포(New deployment)] 선택
 * 5. 톱니바퀴 아이콘 클릭 ➔ [웹 앱(Web app)] 선택
 * 6. 설정 항목:
 *    - 설명: 디지펫 유저 제보 수집기
 *    - 다음 사용자 모드로 실행: 나 (your-email@gmail.com)
 *    - 액세스 권한이 있는 사용자: 모든 사용자 (Anyone)  ★ 반드시 '모든 사용자'로 지정해야 뷰어에서 제보가 접수됩니다!
 * 7. [배포] 버튼 클릭 후 권한 승인 (계정 선택 ➔ 고급 ➔ 안전하지 않은 페이지로 이동 클릭)
 * 8. 발급된 "웹 앱 URL (https://script.google.com/macros/s/.../exec)"을 복사하여
 *    디지몬 에디터의 [📬 제보 확인] 모달 창 내 "구글 시트 웹 앱 URL" 항목에 붙여넣고 저장하세요.
 * ============================================================================
 */

var SHEET_NAME = "유저_제보";

var HEADERS = [
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

/**
 * 유저 뷰어 화면에서 제보 전송 시 호출되는 POST 핸들러
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
    var sheet = ss.getSheetByName(SHEET_NAME);

    // 시트가 없으면 자동 생성 및 서식 초기화
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      initSheetHeaders(sheet);
    } else if (sheet.getLastRow() === 0) {
      initSheetHeaders(sheet);
    }

    // [추가] 개별 제보 삭제 액션
    if (data.action === "delete") {
      var rowToDel = parseInt(data.row || data.id, 10);
      if (rowToDel > 1 && rowToDel <= sheet.getLastRow()) {
        sheet.deleteRow(rowToDel);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // [추가] 전체 제보 비우기 액션
    if (data.action === "clear_all") {
      if (sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "모든 제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var now = new Date();
    var timeZone = Session.getScriptTimeZone() || "Asia/Seoul";
    var formattedDate = Utilities.formatDate(now, timeZone, "yyyy-MM-dd HH:mm:ss");

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

    sheet.appendRow(row);

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
 * 에디터에서 [📬 제보 확인] 클릭 시 호출되는 GET 핸들러
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    // [추가] GET 방식 개별 제보 삭제 지원
    if (action === "delete") {
      var rowToDel = parseInt(e.parameter.row || e.parameter.id, 10);
      if (sheet && rowToDel > 1 && rowToDel <= sheet.getLastRow()) {
        sheet.deleteRow(rowToDel);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // [추가] GET 방식 전체 제보 비우기 지원
    if (action === "clear_all") {
      if (sheet && sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "모든 제보가 삭제되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        reports: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var lastRow = sheet.getLastRow();
    var lastCol = HEADERS.length;
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var reports = [];
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      // 빈 행 건너뛰기
      if (!r[1] && !r[2] && !r[3]) continue;

      reports.push({
        id: (i + 2), // 시트 행 번호
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
 * 시트 헤더 및 기본 서식 초기화 헬퍼 함수
 */
function initSheetHeaders(sheet) {
  sheet.appendRow(HEADERS);
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground("#2B2D31");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  
  // 각 열 너비 자동 조정
  for (var col = 1; col <= HEADERS.length; col++) {
    sheet.setColumnWidth(col, 130);
  }
  sheet.setColumnWidth(1, 150); // 일시
  sheet.setColumnWidth(12, 220); // 메모
}
