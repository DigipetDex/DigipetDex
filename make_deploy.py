# -*- coding: utf-8 -*-
"""디지펫 바이탈 링크 - 배포 패키징

소스 구조
  editor.html            HTML 셸 (유일한 HTML 소스)
  css/ js/               스타일/스크립트 소스
  project_data.js        메인 데이터 (이미지는 images/embedded/ 로 분리)
  images/embedded/       project_data.js 에서 빼낸 스프라이트

실행 순서
  [1] base64 이미지 외부화 (tools/externalize_images.py)
  [2] 사전 점검 (필수 파일/스크립트 존재, 데이터 무결성) — 실패 시 여기서 중단
  [3] 버전 카운트업 (version.json, js/00-config.js 의 APP_VERSION, editor.html 의 ?v= 쿼리)
  [4] editor.html -> index.html / viewer.html / dist / 배포용
  [5] 데이터·스크립트·스타일·이미지 복사
  [6] 인수인계 문서 자동 갱신 (tools/gen_docs.py, 실패해도 배포는 계속)
"""
import os
import re
import sys
import json
import shutil
import subprocess
from datetime import datetime

# Windows 콘솔 utf-8 출력 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_FILES = ["digimon_db.js", "project_data.js", "xlsx.full.min.js", "google_apps_script.js", "version.json"]
ICON_FILES = ["바이탈.webp", "PP.webp", "배틀.webp", "승률.webp", "진화시간.webp"]
ASSET_DIRS = ["css", "js", "images"]          # 항상 통째로 복사
LEGACY_SPRITE_DIRS = ["sprites"]               # 존재하면 복사 (구형 경로 폴백)
KNOWN_STAGES = ["디지타마", "유년기 I", "유년기 II", "성장기", "성숙기", "완전체",
                "궁극체", "궁극체2", "초궁극체", "초궁극체II", "아머체"]


class DeployError(Exception):
    pass


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def bump_version(base_dir):
    """배포 시마다 patch 버전을 1씩 올리고 타임스탬프를 갱신한다."""
    version_file = os.path.join(base_dir, "version.json")
    major, minor, patch = 1, 3, 1
    if os.path.exists(version_file):
        try:
            vdata = json.loads(read(version_file))
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

    write(version_file, json.dumps({
        "major": major, "minor": minor, "patch": patch,
        "version": version_tag, "version_label": version_label, "updated": now_str,
    }, ensure_ascii=False, indent=2))

    # APP_VERSION: js/ 폴더(현재는 js/00-config.js)와 editor.html 어디에 있든 갱신
    app_version_re = re.compile(r'const\s+APP_VERSION\s*=\s*"[^"]*";')
    candidates = [os.path.join(base_dir, "editor.html")]
    js_dir = os.path.join(base_dir, "js")
    if os.path.isdir(js_dir):
        for name in sorted(os.listdir(js_dir)):
            if name.endswith(".js"):
                candidates.append(os.path.join(js_dir, name))
    patched = 0
    for path in candidates:
        if not os.path.exists(path):
            continue
        content = read(path)
        new_content, n = app_version_re.subn(f'const APP_VERSION = "{version_label}";', content)
        if n:
            write(path, new_content)
            patched += n
    if patched == 0:
        raise DeployError("APP_VERSION 선언을 찾지 못했습니다 (js/00-config.js 확인)")

    # editor.html: 버전 배지 + 로컬 css/js/데이터 파일의 캐시 방지 쿼리(?v=)
    editor_path = os.path.join(base_dir, "editor.html")
    content = read(editor_path)
    content = re.sub(r'(<span\s+id="app-version-tag"[^>]*>)[^<]*(</span>)',
                     rf'\g<1>{version_tag}\g<2>', content)
    local_ref = re.compile(
        r'(?P<attr>src|href)="(?P<path>(?:js/|css/)[^"?]+|project_data\.js|digimon_db\.js)(?:\?[^"]*)?"')
    content = local_ref.sub(lambda m: f'{m.group("attr")}="{m.group("path")}?v={version_tag}"', content)
    write(editor_path, content)

    return version_tag, version_label


def externalize_images(base_dir):
    sys.path.insert(0, os.path.join(base_dir, "tools"))
    import externalize_images as ext
    data = ext.load(os.path.join(base_dir, "project_data.js"))
    conv, written, chars = ext.externalize(data, os.path.join(base_dir, "images", "embedded"))
    if conv:
        ext.save(os.path.join(base_dir, "project_data.js"), data)
        return f"base64 이미지 {conv}개를 images/embedded/ 로 분리 (신규 파일 {written}개, {chars/1024/1024:.1f}MB 감소)"
    return "분리할 base64 이미지 없음 (이미 외부화됨)"


def load_data(base_dir):
    sys.path.insert(0, os.path.join(base_dir, "tools"))
    import externalize_images as ext
    return ext.load(os.path.join(base_dir, "project_data.js"))


def preflight(base_dir):
    """치명적 문제는 DeployError, 경고는 리스트로 반환."""
    warnings = []
    editor = read(os.path.join(base_dir, "editor.html"))

    # 1) HTML 이 로드하는 로컬 <script>/<link> 파일이 모두 있는지 (<img> 샘플 경로는 제외)
    refs = re.findall(r'<script\b[^>]*?\ssrc="([^"#?]+)', editor) + \
           re.findall(r'<link\b[^>]*?\shref="([^"#?]+)', editor)
    missing = []
    for ref in refs:
        if re.match(r'^(https?:|data:|//|mailto:)', ref):
            continue
        if not os.path.exists(os.path.join(base_dir, ref.replace("/", os.sep))):
            missing.append(ref)
    if missing:
        raise DeployError("editor.html 이 참조하는 파일이 없습니다: " + ", ".join(sorted(set(missing))))

    # 2) 데이터 무결성
    data = load_data(base_dir)
    digimons, evos = data.get("digimons", {}), data.get("evolutions", [])
    dangling = [e for e in evos if e.get("from") not in digimons or e.get("to") not in digimons]
    if dangling:
        raise DeployError(f"존재하지 않는 디지몬을 가리키는 진화선 {len(dangling)}개 "
                          f"(예: {dangling[0].get('from')} -> {dangling[0].get('to')})")
    unknown_stage = sorted({d.get("stage") for d in digimons.values() if d.get("stage") not in KNOWN_STAGES})
    if unknown_stage:
        warnings.append(f"알 수 없는 세대 값: {unknown_stage}")
    still_b64 = sum(1 for d in digimons.values() if str(d.get("img", "")).startswith("data:"))
    if still_b64:
        warnings.append(f"외부화되지 않은 base64 이미지 {still_b64}개")
    dummy = [e for e in evos if str(e.get("vital")) == "1200" and str(e.get("pp")) == "8"]
    if dummy:
        names = ", ".join(f'{digimons[e["from"]]["name"]}→{digimons[e["to"]]["name"]}' for e in dummy[:5])
        warnings.append(f"구형 더미값(바이탈 1200/PP 8) 진화선 {len(dummy)}개: {names}")

    # 3) 로컬 이미지 경로가 실제로 있는지 (경고만)
    no_file = sorted({d["img"] for d in digimons.values()
                      if d.get("img") and not str(d["img"]).startswith(("data:", "http"))
                      and not os.path.exists(os.path.join(base_dir, d["img"].replace("/", os.sep)))})
    if no_file:
        warnings.append(f"이미지 파일이 없는 경로 {len(no_file)}개 (예: {no_file[0]})")
    return data, warnings


def copy_tree(src, dst_roots):
    for dst in dst_roots:
        shutil.copytree(src, os.path.join(dst, os.path.basename(src)), dirs_exist_ok=True)


def sprite_dirs(base_dir, data):
    """데이터가 참조하는 이미지의 첫 폴더들 + 구형 폴더 (하드코딩 목록 대체)"""
    dirs = set(LEGACY_SPRITE_DIRS)
    for d in data.get("digimons", {}).values():
        img = str(d.get("img", ""))
        if img and not img.startswith(("data:", "http")) and "/" in img:
            dirs.add(img.split("/", 1)[0])
    return sorted(x for x in dirs if x not in ASSET_DIRS and os.path.isdir(os.path.join(base_dir, x)))


def main():
    print("========================================================")
    print("  디지펫 바이탈 링크 - 배포 패키징 및 버전 카운트업")
    print("========================================================")
    print()

    base_dir = BASE_DIR
    dist_dir = os.path.join(base_dir, "dist")
    legacy_dist = os.path.join(base_dir, "배포용")
    roots = [dist_dir, legacy_dist]
    editor_path = os.path.join(base_dir, "editor.html")

    if not os.path.exists(editor_path):
        raise DeployError("editor.html 이 없습니다")

    # 1. 이미지 외부화
    print(f"[1/6] {externalize_images(base_dir)}")

    # 2. 사전 점검 (실패하면 버전/배포 폴더를 건드리기 전에 중단)
    data, warnings = preflight(base_dir)
    print("[2/6] 사전 점검 통과" + (f" (경고 {len(warnings)}건)" if warnings else ""))
    for w in warnings:
        print(f"      ⚠ {w}")

    # 3. 버전 카운트업
    version_tag, version_label = bump_version(base_dir)
    print(f"[3/6] 배포 버전 자동 카운트업 완료: {version_label}")

    for d in roots:
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    # 3. editor.html -> index.html / viewer.html / dist / 배포용
    for target in [os.path.join(base_dir, "index.html")] + [os.path.join(r, "index.html") for r in roots]:
        shutil.copy2(editor_path, target)
    viewer_path = os.path.join(base_dir, "viewer.html")
    try:
        if not (os.path.exists(viewer_path) and os.path.samefile(editor_path, viewer_path)):
            shutil.copy2(editor_path, viewer_path)      # 하드링크 상태면 이미 동일하므로 건너뜀
    except Exception as e:
        print(f"      ⚠ viewer.html 갱신 실패: {e}")
    print("[4/6] index.html / viewer.html / dist 최신 UI 생성 완료")

    # 4. 데이터·스크립트·스타일·이미지 복사
    for f in DATA_FILES:
        src = os.path.join(base_dir, f)
        if os.path.exists(src):
            for r in roots:
                shutil.copy2(src, os.path.join(r, f))
    for icon in ICON_FILES:
        src = os.path.join(base_dir, icon)
        if os.path.exists(src):
            for r in roots:
                shutil.copy2(src, os.path.join(r, icon))
    for d in ASSET_DIRS + sprite_dirs(base_dir, data):
        src = os.path.join(base_dir, d)
        if os.path.isdir(src):
            copy_tree(src, roots)
    print("[5/6] 데이터, css/js, 아이콘, 이미지 폴더 복사 완료")

    # 5. 문서 자동 갱신 (실패해도 배포는 계속)
    try:
        subprocess.run([sys.executable, os.path.join(base_dir, "tools", "gen_docs.py")],
                       check=True, cwd=base_dir)
        print("[6/6] handover 문서(버전/함수 위치) 자동 갱신 완료")
    except Exception as e:
        print(f"[6/6] ⚠ 문서 자동 갱신 건너뜀: {e}")

    print()
    print("========================================================")
    print(f" [성공] '{version_tag}' 배포 준비 완료!")
    print("========================================================")
    print()


if __name__ == "__main__":
    try:
        main()
    except DeployError as err:
        print(f"\n[실패] {err}\n버전과 배포 폴더는 변경되지 않았습니다.", file=sys.stderr)
        sys.exit(1)
