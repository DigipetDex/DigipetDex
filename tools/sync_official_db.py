"""공식 도감(digimon.net/reference_ko)에서 새 디지몬을 digimon_db.js 에 추가한다.
기존 항목은 건드리지 않고(dir 기준), 없는 것만 뒤에 붙인다.
사용: python tools/sync_official_db.py [--apply]   (기본은 미리보기)
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_JS = ROOT / "digimon_db.js"
BASE = "https://digimon.net/reference_ko/request.php"
HEADERS = {"X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0"}
ATTRS = {"백신": "vaccine", "데이터": "data", "바이러스": "virus", "프리": "free",
         "배리어블": "free", "불명": "none", "NO DATA": "none"}
STAGES = {"유아기Ⅰ": "유년기 I", "유년기Ⅰ": "유년기 I", "유년기Ⅱ": "유년기 II", "유아기Ⅱ": "유년기 II"}


def fetch_all(attribute=""):
    rows, nxt = [], ""
    while True:
        q = urllib.parse.urlencode({"digimon_name": "", "digimon_level": "", "attribute": attribute,
                                    "type": "", "next": nxt, "view_more": "1" if nxt != "" else ""})
        req = urllib.request.Request(f"{BASE}?{q}", headers=HEADERS)
        data = json.load(urllib.request.urlopen(req, timeout=30))
        if not data:
            break
        rows += data["rows"]
        if data.get("next", -1) == -1:
            break
        nxt = data["next"]
        time.sleep(0.2)
    return rows


def main():
    apply = "--apply" in sys.argv
    src = DB_JS.read_text(encoding="utf-8")
    m = re.match(r"^(const OFFICIAL_DIGIMON_DB = )(\{.*\})(;?\s*)$", src, re.S)
    if not m:
        sys.exit("digimon_db.js 형식을 읽을 수 없음")
    db = json.loads(m.group(2))
    known_dirs = {v["dir"] for v in db.values()}

    rows = fetch_all()
    print(f"도감 {len(rows)}종 / 에디터 {len(db)}종")
    new = [r for r in rows if r["directory_name"] not in known_dirs]
    if not new:
        print("추가할 항목 없음")
        return

    attr_of = {}
    for ko, code in ATTRS.items():
        for r in fetch_all(ko):
            attr_of.setdefault(r["directory_name"], code)

    added = {}
    for r in new:
        d = r["directory_name"]
        name = r["name"]
        if name in db or name in added:
            print(f'  = 동명 건너뜀: {name} ({d})')
            continue
        stage = STAGES.get(r["level"], r["level"])
        added[name] = {"attr": attr_of.get(d, "none"), "stage": stage, "dir": d}
        print(f'  + {name}: {added[name]}')

    if apply:
        db.update(added)
        DB_JS.write_text(m.group(1) + json.dumps(db, ensure_ascii=False) + (m.group(3) or ";"), encoding="utf-8")
        print("digimon_db.js 갱신 완료")
    else:
        print("미리보기만 함. 반영하려면 --apply")


if __name__ == "__main__":
    main()
