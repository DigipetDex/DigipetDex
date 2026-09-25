import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

def create_template():
    wb = openpyxl.Workbook()
    
    # ---------------------------------------------------------
    # 1. 설정/코드값 시트 (드롭다운 참조용)
    # ---------------------------------------------------------
    ws_config = wb.active
    ws_config.title = "코드_설정"
    
    config_data = {
        "세대": ["디지타마", "유년기I", "유년기II", "성장기", "성숙기", "완전체", "궁극체", "초궁극체", "초궁극체II", "아머체", "기타"],
        "속성": ["백신 (Va)", "데이터 (Da)", "바이러스 (Vi)", "프리 (Free)", "불명"],
        "진화유형": ["일반 진화", "조그레스", "캡슐/아이템 진화", "특수 진화"],
        "검증상태": ["확인완료", "확인중/진행중", "추정/제보", "미확인"]
    }
    
    col_idx = 1
    for key, values in config_data.items():
        cell = ws_config.cell(row=1, column=col_idx, value=key)
        cell.font = Font(bold=True)
        for r_idx, val in enumerate(values, start=2):
            ws_config.cell(row=r_idx, column=col_idx, value=val)
        col_idx += 1
        
    # 코드 시트 숨김 처리 또는 보조 시트로 유지 (일단 보이게 두되 깔끔하게 정리)
    ws_config.views.sheetView[0].showGridLines = True

    # ---------------------------------------------------------
    # 2. 진화 조건표 (핵심 시트)
    # ---------------------------------------------------------
    ws_evo = wb.create_sheet(title="진화_조건표", index=0)
    ws_evo.views.sheetView[0].showGridLines = True
    
    headers = [
        "현재 디지몬",      # A
        "현재 세대",        # B
        "속성",             # C
        "진화 대상",        # D
        "목표 세대",        # E
        "진화 유형",        # F
        "진화 시간",        # G (예: 16시간, 24시간)
        "필요 바이탈",      # H
        "필요 PP",          # I
        "필요 승률 (%)",    # J
        "던전 ★★★",       # K
        "조그레스 파트너",  # L
        "필요 아이템/캡슐", # M
        "검증 상태",        # N
        "비고 / 메모"       # O
    ]
    
    sample_data = [
        [
            "깜몬", "유년기I", "프리 (Free)", "코로몬", "유년기II",
            "일반 진화", "10분", 0, 0, 0,
            "-", "-", "-", "확인완료", "시간 경과 시 자동 진화"
        ],
        [
            "코로몬", "유년기II", "프리 (Free)", "아구몬", "성장기",
            "일반 진화", "1시간", 500, 0, 0,
            "-", "-", "-", "확인완료", "바이탈 조건 달성"
        ],
        [
            "아구몬", "성장기", "백신 (Va)", "그레이몬", "성숙기",
            "일반 진화", "16시간", 1200, 8, 50,
            "-", "-", "-", "확인완료", "기본 성숙기 루트"
        ],
        [
            "아구몬", "성장기", "백신 (Va)", "티라노몬", "성숙기",
            "일반 진화", "16시간", 800, 4, 40,
            "-", "-", "-", "확인중/진행중", "바이탈 부족 루트"
        ],
        [
            "브이몬", "성장기", "프리 (Free)", "화염드라몬", "아머체",
            "캡슐/아이템 진화", "즉시/1시간", 1000, 10, 60,
            "던전 3 클리어", "-", "용기의 캡슐", "확인완료", "캡슐 아이템 사용 및 던전 조건"
        ],
        [
            "엔젤우몬", "완전체", "백신 (Va)", "마스테몬", "궁극체",
            "조그레스", "24시간", 5000, 25, 70,
            "에어리어 5 ★★★", "레이디데블몬", "-", "확인완료", "조그레스 파트너 보유 필요"
        ]
    ]
    
    # 스타일 정의
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(name="맑은 고딕", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="맑은 고딕", size=10)
    
    thin_border_side = Side(style="thin", color="D9D9D9")
    border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    header_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=Side(style="medium", color="0D233A"))
    
    zebra_fill = PatternFill(start_color="F7F9FC", end_color="F7F9FC", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    
    # 헤더 작성
    ws_evo.row_dimensions[1].height = 28
    for col_num, header in enumerate(headers, 1):
        cell = ws_evo.cell(row=1, column=col_num, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center
        cell.border = header_border
        
    # 샘플 데이터 작성
    for row_idx, row_values in enumerate(sample_data, 2):
        ws_evo.row_dimensions[row_idx].height = 22
        fill = zebra_fill if row_idx % 2 == 0 else white_fill
        for col_num, val in enumerate(row_values, 1):
            cell = ws_evo.cell(row=row_idx, column=col_num, value=val)
            cell.font = data_font
            cell.fill = fill
            cell.border = border
            
            # 정렬
            if col_num in [1, 4, 12, 13, 15]:  # 디지몬명, 아이템, 비고
                cell.alignment = align_left
            elif col_num in [8, 9, 10]:       # 바이탈, PP, 승률
                cell.alignment = align_right
            else:
                cell.alignment = align_center
                
    # ---------------------------------------------------------
    # 드롭다운 유효성 검사 연결 (2행 ~ 1000행)
    # ---------------------------------------------------------
    # 세대 드롭다운 (Col B, Col E)
    dv_stage = DataValidation(type="list", formula1="=코드_설정!$A$2:$A$10", allow_blank=True)
    ws_evo.add_data_validation(dv_stage)
    dv_stage.add(f"B2:B1000")
    dv_stage.add(f"E2:E1000")
    
    # 속성 드롭다운 (Col C)
    dv_attr = DataValidation(type="list", formula1="=코드_설정!$B$2:$B$6", allow_blank=True)
    ws_evo.add_data_validation(dv_attr)
    dv_attr.add(f"C2:C1000")
    
    # 진화 유형 드롭다운 (Col F)
    dv_type = DataValidation(type="list", formula1="=코드_설정!$C$2:$C$5", allow_blank=True)
    ws_evo.add_data_validation(dv_type)
    dv_type.add(f"F2:F1000")
    
    # 검증 상태 드롭다운 (Col N)
    dv_status = DataValidation(type="list", formula1="=코드_설정!$D$2:$D$5", allow_blank=True)
    ws_evo.add_data_validation(dv_status)
    dv_status.add(f"N2:N1000")
    
    # 열 너비 자동 조절 + 여유폭
    col_widths = {
        "A": 16, # 현재 디지몬
        "B": 12, # 현재 세대
        "C": 14, # 속성
        "D": 16, # 진화 대상
        "E": 12, # 목표 세대
        "F": 16, # 진화 유형
        "G": 12, # 진화 시간
        "H": 13, # 필요 바이탈
        "I": 11, # 필요 PP
        "J": 13, # 필요 승률
        "K": 18, # 던전 ★★★
        "L": 16, # 조그레스 파트너
        "M": 18, # 필요 아이템/캡슐
        "N": 15, # 검증 상태
        "O": 26  # 비고 / 메모
    }
    for col_letter, width in col_widths.items():
        ws_evo.column_dimensions[col_letter].width = width
        
    # 필터 걸기
    ws_evo.auto_filter.ref = f"A1:O{len(sample_data) + 1}"
    
    # ---------------------------------------------------------
    # 3. 도감 목록 시트 (디지몬 자체 기본 스탯/정보 정리용)
    # ---------------------------------------------------------
    ws_dex = wb.create_sheet(title="디지몬_도감")
    ws_dex.views.sheetView[0].showGridLines = True
    
    dex_headers = ["디지몬명", "세대", "속성", "소속 그룹/종족", "기본 스탯(HP/AP 등)", "입수 경로/알", "메모"]
    dex_widths = [16, 12, 14, 16, 20, 20, 30]
    
    ws_dex.row_dimensions[1].height = 28
    for col_idx, (h_title, w) in enumerate(zip(dex_headers, dex_widths), 1):
        cell = ws_dex.cell(row=1, column=col_idx, value=h_title)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center
        cell.border = header_border
        ws_dex.column_dimensions[get_column_letter(col_idx)].width = w
        
    ws_dex.auto_filter.ref = "A1:G1"
    
    output_path = r"f:\Game\DIGIPET\디지펫_바이탈링크_진화트리_템플릿.xlsx"
    wb.save(output_path)
    print(f"Template successfully saved to {output_path}")

if __name__ == "__main__":
    create_template()
