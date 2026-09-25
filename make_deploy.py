import os
import shutil
import sys

# Windows 콘솔 utf-8 출력 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def main():
    print("========================================================")
    print("  디지펫 바이탈 링크 - 배포용 폴더 생성")
    print("========================================================")
    print()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, "dist")
    legacy_dist = os.path.join(base_dir, "배포용")

    for d in [dist_dir, legacy_dist]:
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    # 1. dist 및 배포용 폴더에 editor.html을 index.html로 복사 (항상 최신 UI 템플릿 유지)
    editor_path = os.path.join(base_dir, "editor.html")
    shutil.copy2(editor_path, os.path.join(dist_dir, "index.html"))
    shutil.copy2(editor_path, os.path.join(legacy_dist, "index.html"))
    print("[1/5] dist/index.html 생성 완료 (최신 뷰어 템플릿)")
    print("[1/5] 배포용/index.html 생성 완료 (최신 뷰어 템플릿)")

    # 2. digimon_db.js 및 project_data.js 복사 (데이터 완벽 분리!)
    for f in ["digimon_db.js", "project_data.js"]:
        src = os.path.join(base_dir, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dist_dir, f))
            shutil.copy2(src, os.path.join(legacy_dist, f))
    print("[2/5] digimon_db.js 및 project_data.js 데이터 파일 복사 완료")

    # 3. 커스텀 아이콘 (바이탈.webp, PP.webp, 배틀.webp, 승률.webp, 진화시간.webp) 복사
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
    print(" [성공] 'dist' 및 '배포용' 폴더 생성이 완료되었습니다!")
    print("========================================================")
    print()
    print("➔ Netlify Drop (https://app.netlify.com/drop) 사이트 화면에")
    print("   방금 생성된 [배포용] 폴더를 통째로 마우스로 끌어다 놓으시면 됩니다!")
    print()

if __name__ == "__main__":
    main()
