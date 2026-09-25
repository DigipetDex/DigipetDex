import json
import csv
import os

def export_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_file = os.path.join(base_dir, "project_data.js")
    
    with open(project_file, "r", encoding="utf-8") as f:
        content = f.read().strip()
    
    json_str = content[content.index('{'):content.rindex('}')+1]
    data = json.loads(json_str)

    digimons = data.get("digimons", {})
    evolutions = data.get("evolutions", [])
    
    attr_map = {"vaccine": "백신", "data": "데이터", "virus": "바이러스", "free": "프리", "none": "-"}

    rows = []
    for ev in evolutions:
        from_digi = digimons.get(ev.get("from"), {})
        to_digi = digimons.get(ev.get("to"), {})
        dim_name = to_digi.get("dim") or from_digi.get("dim") or "기타"
        
        # 진화 조건 (루트별 조건이 우선, 없으면 디지몬 기본 조건)
        req = ev.get("req") or to_digi.get("req") or {}
        
        time_val = req.get("time") or to_digi.get("time") or "-"
        if to_digi.get("unknownTime"):
            time_val = "불명"
            
        win_ratio = req.get("winRatio")
        win_str = f"{win_ratio}%" if (win_ratio is not None and win_ratio != "") else "-"

        rows.append({
            "DiM": dim_name,
            "진화 전": from_digi.get("name", "미상"),
            "진화 후": to_digi.get("name", "미상"),
            "세대": to_digi.get("stage", "-"),
            "속성": attr_map.get(to_digi.get("attr", ""), to_digi.get("attr", "-")),
            "바이탈": req.get("vital", "-"),
            "PP/트로피": req.get("pp", "-"),
            "배틀수": req.get("battles", "-"),
            "승률": win_str,
            "진화시간": time_val
        })

    # DiM별, 세대별 정렬
    stage_order = {"디지타마": 0, "유년기1": 1, "유년기2": 2, "성장기": 3, "성숙기": 4, "완전체": 5, "궁극체": 6, "초궁극체": 7}
    rows.sort(key=lambda r: (r["DiM"], stage_order.get(r["세대"], 9), r["진화 후"]))

    csv_path = os.path.join(base_dir, "디지몬_진화조건_목록.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        fieldnames = ["DiM", "진화 전", "진화 후", "세대", "속성", "바이탈", "PP/트로피", "배틀수", "승률", "진화시간"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"총 {len(rows)}개의 진화 조건이 '{csv_path}' 파일로 성공적으로 추출되었습니다!")

if __name__ == "__main__":
    export_data()
