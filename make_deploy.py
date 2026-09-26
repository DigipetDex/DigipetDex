import os
import shutil
import sys
import json
import re
from datetime import datetime

# Windows 콘솔 utf-8 출력 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def bump_version(base_dir):
    """배포 시마다 patch 버전을 1씩 자동으로 증가시키고 타임스탬프를 갱신합니다."""
    version_file = os.path.join(base_dir, "version.json")
    major, minor, patch = 1, 3, 1
    if os.path.exists(version_file):
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                vdata = json.load(f)
                patch = vdata.get("patch", 1) + 1
                major = vdata.get("major", 1)
                minor = vdata.get("minor", 3)
        except Exception:
            patch = 2
    else:
        patch = 2

    now_str = datetime.now().strftime("%m.%d %H:%M")
    version_tag = f"v{major}.{minor}.{patch}"
    version_label = f"v{major}.{minor}.{patch} ({now_str})"

    vdata = {
        "major": major,
        "minor": minor,
        "patch": patch,
        "version": version_tag,
        "version_label": version_label,
        "updated": now_str
    }
    with open(version_file, "w", encoding="utf-8") as f:
        json.dump(vdata, f, ensure_ascii=False, indent=2)

    # editor.html 내용 읽어서 버전 문자열 치환
    editor_path = os.path.join(base_dir, "editor.html")
    if os.path.exists(editor_path):
        with open(editor_path, "r", encoding="utf-8") as f:
            content = f.read()

        content = re.sub(
            r'const\s+APP_VERSION\s*=\s*"[^"]*";',
            f'const APP_VERSION = "{version_label}";',
            content
        )
        content = re.sub(
            r'(<span\s+id="app-version-tag"[^>]*>)[^<]*(</span>)',
            rf'\g<1>{version_tag}\g<2>',
            content
        )
        # 브라우저 강력 캐싱 방지: project_data.js와 digimon_db.js에 배포 버전 쿼리스트링 자동 부착
        content = re.sub(
            r'src="project_data\.js(\?[^"]*)?"',
            f'src="project_data.js?v={version_tag}"',
            content
        )
        content = re.sub(
            r'src="digimon_db\.js(\?[^"]*)?"',
            f'src="digimon_db.js?v={version_tag}"',
            content
        )

        with open(editor_path, "w", encoding="utf-8") as f:
            f.write(content)

    return version_tag, version_label

def main():
    print("========================================================")
    print("  디지펫 바이탈 링크 - 배포 패키징 및 버전 카운트업")
    print("========================================================")
    print()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, "dist")
    legacy_dist = os.path.join(base_dir, "배포용")

    for d in [dist_dir, legacy_dist]:
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    # 0. 배포 버전 자동 카운트업
    version_tag, version_label = bump_version(base_dir)
    print(f"[0/5] 배포 버전 자동 카운트업 완료: {version_label}")

    # 1. 루트 index.html 및 dist, 배포용 폴더에 editor.html을 index.html로 복사
    editor_path = os.path.join(base_dir, "editor.html")
    shutil.copy2(editor_path, os.path.join(base_dir, "index.html"))
    shutil.copy2(editor_path, os.path.join(dist_dir, "index.html"))
    shutil.copy2(editor_path, os.path.join(legacy_dist, "index.html"))

    viewer_path = os.path.join(base_dir, "viewer.html")
    try:
        shutil.copy2(editor_path, viewer_path)
    except Exception:
        pass

    print("[1/5] index.html (루트 및 dist) 최신 UI 생성 완료")

    # 2. digimon_db.js, project_data.js, xlsx.full.min.js 및 google_apps_script.js 복사
    for f in ["digimon_db.js", "project_data.js", "xlsx.full.min.js", "google_apps_script.js", "version.json"]:
        src = os.path.join(base_dir, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_dir, f))
            shutil.copy2(src, os.path.join(legacy_dist, f))
    print("[2/5] digimon_db.js, project_data.js, xlsx.full.min.js, google_apps_script.js 복사 완료")

    # 3. 커스텀 아이콘 복사
    webp_icons = ["바이탈.webp", "PP.webp", "배틀.webp", "승률.webp", "진화시간.webp"]
    for icon in webp_icons:
        src = os.path.join(base_dir, icon)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_dir, icon))
            shutil.copy2(src, os.path.join(legacy_dist, icon))
    print("[3/5] 조건 커스텀 아이콘 복사 완료")

    # 4. 이미지 폴더들 복사
    folders = ["sprites", "감마몬", "길몬", "아구몬", "파피몬", "피요몬", "허мит인더정글"]
    for f in folders:
        src = os.path.join(base_dir, f)
        if os.path.exists(src):
            shutil.copytree(src, os.path.join(dist_dir, f), dirs_exist_ok=True)
            shutil.copytree(src, os.path.join(legacy_dist, f), dirs_exist_ok=True)
    print("[4/5] 스프라이트 및 디지몬 이미지 폴더 복사 완료")

    print()
    print("========================================================")
    print(f" [성공] '{version_tag}' 배포 준비 완료!")
    print("========================================================")
    print()

if __name__ == "__main__":
    main()
