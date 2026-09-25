import urllib.request
import re
import os
import io
import sys
from PIL import Image

def get_page_html(url):
    headers = {"User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8", errors="ignore")

def download_sprites_from_url(input_url, output_dir=r"f:\Game\DIGIPET\sprites"):
    os.makedirs(output_dir, exist_ok=True)
    
    # URL과 앵커(#) 분리
    target_anchor = None
    if "#" in input_url:
        page_url, target_anchor = input_url.split("#", 1)
    else:
        page_url = input_url
        
    print(f"\n[1/3] 웹페이지 다운로드 중: {page_url}")
    try:
        html = get_page_html(page_url)
    except Exception as e:
        print(f"[오류] 웹페이지를 불러오지 못했습니다: {e}")
        return

    # 특정 앵커(#anchor)가 있으면 해당 섹션만 추출
    if target_anchor:
        print(f"[2/3] 특정 차트 탐색 중: #{target_anchor}")
        # 상단 네비게이션 점퍼의 href를 피하기 위해 id="..." 또는 name="..." 우선 탐색
        start_idx = html.find(f'id="{target_anchor}"')
        if start_idx == -1:
            start_idx = html.find(f'name="{target_anchor}"')
        if start_idx == -1:
            # 앵커 네비게이션 점퍼 뒤에 나오는 본문 앵커 검색
            p1 = html.find(target_anchor)
            if p1 != -1:
                p2 = html.find(target_anchor, p1 + len(target_anchor) + 10)
                start_idx = p2 if p2 != -1 else p1

        if start_idx != -1:
            # 다음 앵커(차트) 시작 전까지 자르기
            next_anchor = html.find('class="anchor', start_idx + 50)
            if next_anchor != -1:
                html = html[start_idx:next_anchor]
            else:
                html = html[start_idx:]
        else:
            print(f"[주의] #{target_anchor} 앵커를 찾지 못해 페이지 전체에서 검색합니다.")
    else:
        print("[2/3] 페이지 전체 디지몬 탐색 중...")

    # 디지몬 이미지 추출 정규식
    # humulos 패턴: vbdm뿐만 아니라 vbbe, vpet 등 다양한 서브 디렉토리(/dot/카테고리/) 모두 지원
    pattern = r'data-src=["\'](?:(?:https?:)?//humulos\.com)?/digimon/images/dot/([^/]+)/(?:frame2/)?([^"\'/]+)\.gif["\'][^>]+title=["\']([^"\']+)["\']'
    matches = re.findall(pattern, html)
    
    seen = set()
    digimons = []

    # 디지타마(알) 추출 (vbdm, vbbe 공통)
    egg_pattern = r'src=["\'](?:(?:https?:)?//humulos\.com)?/digimon/images/dot/([^/]+)/(digitama_[^"\'/]+)\.gif["\'][^>]+title=["\']([^"\']+)["\']'
    egg_matches = re.findall(egg_pattern, html)
    for cat, code, name in egg_matches:
        if code not in seen:
            seen.add(code)
            egg_name = name.replace("Digitama", "").strip()
            digimons.append((cat, code, f"디지타마_{egg_name}" if egg_name else "디지타마"))

    for cat, code, name in matches:
        if code in seen or "blank" in code:
            continue
        seen.add(code)
        digimons.append((cat, code, name))

    if not digimons:
        print("[결과] 다운로드할 디지몬 이미지를 찾지 못했습니다. URL을 확인해 주세요.")
        return

    print(f"\n[3/3] 총 {len(digimons)}마리의 디지몬을 발견했습니다! 애니메이션 GIF 변환 시작...\n")
    headers = {"User-Agent": "Mozilla/5.0"}
    
    success_count = 0
    for idx, (cat, code, name) in enumerate(digimons, 1):
        f1_url = f"https://humulos.com/digimon/images/dot/{cat}/{code}.gif"
        f2_url = f"https://humulos.com/digimon/images/dot/{cat}/frame2/{code}.gif"
        
        safe_name = "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).strip()
        save_path = os.path.join(output_dir, f"{safe_name}.gif")
        
        try:
            req1 = urllib.request.Request(f1_url, headers=headers)
            img1_bytes = urllib.request.urlopen(req1).read()
            img1 = Image.open(io.BytesIO(img1_bytes)).convert("RGBA")
            
            frames = [img1]
            try:
                req2 = urllib.request.Request(f2_url, headers=headers)
                img2_bytes = urllib.request.urlopen(req2).read()
                img2 = Image.open(io.BytesIO(img2_bytes)).convert("RGBA")
                frames.append(img2)
            except Exception:
                pass # 2프레임이 없는 경우 1프레임만 유지
                
            # GIF 저장 (500ms 간격 무한반복)
            frames[0].save(
                save_path,
                save_all=True,
                append_images=frames[1:] if len(frames) > 1 else [],
                duration=500,
                loop=0,
                disposal=2
            )
            print(f"[{idx}/{len(digimons)}] 저장 성공: {safe_name}.gif (프레임 {len(frames)}개)")
            success_count += 1
        except Exception as e:
            print(f"[{idx}/{len(digimons)}] 다운로드 실패 ({name}): {e}")

    print(f"\n★ 완료! 총 {success_count}개의 움직이는 GIF가 저장되었습니다.")
    print(f"저장 폴더: {output_dir}\n")

if __name__ == "__main__":
    print("=" * 60)
    print("  디지몬 humulos 도트 스프라이트 자동 다운로더 (Animated GIF 변환)")
    print("=" * 60)
    
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    else:
        print("\nhumulos 웹페이지 주소를 입력하거나 엔터를 치세요.")
        print("예시: https://humulos.com/digimon/vbbe/anime/#gamma_anchor (감마몬 BE)")
        print("예시: https://humulos.com/digimon/vbdm/ex/#gabu_ex_anchor (파피몬 EX)")
        print("예시: https://humulos.com/digimon/vbdm/vol/#vbe_anchor (볼캐닉 비트)")
        print("예시: https://humulos.com/digimon/vbbe/anime/ (페이지 전체 BE 디지몬)")
        print("-" * 60)
        target_url = input("주소(URL) 입력 [엔터 = 감마몬 BE 다운로드]: ").strip()
        
        if not target_url:
            # 기본값: 감마몬 BE
            target_url = "https://humulos.com/digimon/vbbe/anime/#gamma_anchor"
            
    download_sprites_from_url(target_url)
