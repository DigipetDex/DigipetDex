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

def download_sprites_from_url(input_url, output_dir=None):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if not output_dir:
        output_dir = os.path.join(base_dir, "sprites")
    elif not os.path.isabs(output_dir):
        output_dir = os.path.join(base_dir, output_dir)
        
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
        return False

    # 특정 앵커(#anchor)가 있으면 해당 섹션만 추출
    if target_anchor:
        print(f"[2/3] 특정 차트 탐색 중: #{target_anchor}")
        start_idx = html.find(f'id="{target_anchor}"')
        if start_idx == -1:
            start_idx = html.find(f'name="{target_anchor}"')
        if start_idx == -1:
            p1 = html.find(target_anchor)
            if p1 != -1:
                p2 = html.find(target_anchor, p1 + len(target_anchor) + 10)
                start_idx = p2 if p2 != -1 else p1

        if start_idx != -1:
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
        print("[결과] 다운로드할 디지몬 이미지를 찾지 못했습니다. URL 및 차트 이름을 확인해 주세요.")
        return False

    print(f"\n[3/3] 총 {len(digimons)}마리의 디지몬을 발견했습니다! Animated GIF 다운로드 및 변환 시작...\n")
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

    print(f"\n★ 완료! 총 {success_count}개의 움직이는 GIF가 성공적으로 저장되었습니다.")
    print(f"📁 저장된 폴더: {output_dir}")
    return True

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    default_dir = os.path.join(base_dir, "sprites")
    
    print("=" * 66)
    print("   디지몬 humulos 도트 스프라이트 자동 다운로더 (Animated GIF)")
    print("=" * 66)
    
    # CLI 인자가 전달된 경우 (예: python download_humulos_gifs.py <URL> [FOLDER])
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
        out_folder = sys.argv[2] if len(sys.argv) > 2 else default_dir
        download_sprites_from_url(target_url, out_folder)
        print("\n" + "=" * 66)
        print("작업이 완료되었습니다.")
        input("프로그램을 종료하려면 [Enter] 키를 누르세요...")
        return

    current_folder = "sprites"
    
    # 다운로드 완료 후에도 창이 꺼지지 않고 반복해서 다운로드할 수 있는 대화형 루프
    while True:
        print("\n" + "-" * 66)
        print("【 humulos 웹페이지 주소(URL) 또는 번호를 입력하세요 】")
        print("  1) 감마몬 BE     : https://humulos.com/digimon/vbbe/anime/#gamma_anchor")
        print("  2) 아구몬 EX     : https://humulos.com/digimon/vbdm/ex/#agu_ex_anchor")
        print("  3) 파피몬 EX     : https://humulos.com/digimon/vbdm/ex/#gabu_ex_anchor")
        print("  4) 볼캐닉 비트   : https://humulos.com/digimon/vbdm/vol/#vbe_anchor")
        print("  5) 앙고라몬 BE   : https://humulos.com/digimon/vbbe/anime/#angora_anchor")
        print("  6) 젤리몬 BE     : https://humulos.com/digimon/vbbe/anime/#jelly_anchor")
        print("  [q] 프로그램 종료")
        print("-" * 66)
        
        target_input = input("주소(URL) 또는 번호 입력 [기본값: 1번 감마몬 BE]: ").strip()
        
        if target_input.lower() in ('q', 'quit', 'exit'):
            print("\n프로그램을 종료합니다.")
            break
            
        url_map = {
            "1": "https://humulos.com/digimon/vbbe/anime/#gamma_anchor",
            "2": "https://humulos.com/digimon/vbdm/ex/#agu_ex_anchor",
            "3": "https://humulos.com/digimon/vbdm/ex/#gabu_ex_anchor",
            "4": "https://humulos.com/digimon/vbdm/vol/#vbe_anchor",
            "5": "https://humulos.com/digimon/vbbe/anime/#angora_anchor",
            "6": "https://humulos.com/digimon/vbbe/anime/#jelly_anchor",
        }
        
        if not target_input:
            target_url = url_map["1"]
            print("-> 기본값: 감마몬 BE 선택됨")
        elif target_input in url_map:
            target_url = url_map[target_input]
        else:
            target_url = target_input
            
        # 저장 폴더 이름 지정
        print(f"\n[저장 폴더 지정]")
        dest_display = os.path.abspath(os.path.join(base_dir, current_folder)) if not os.path.isabs(current_folder) else current_folder
        print(f"현재 설정된 폴더: {current_folder} ({dest_display})")
        folder_in = input(f"저장할 폴더 이름 입력 [엔터 = '{current_folder}' 유지]: ").strip()
        if folder_in:
            current_folder = folder_in
            
        dest_dir = os.path.abspath(os.path.join(base_dir, current_folder)) if not os.path.isabs(current_folder) else current_folder
        print(f"-> 최종 저장 위치: {dest_dir}")
        
        download_sprites_from_url(target_url, dest_dir)
        
        print("\n" + "=" * 66)
        cont = input("계속해서 다른 주소나 DiM을 추가로 다운로드하시겠습니까? (Y/n): ").strip().lower()
        if cont in ('n', 'no', 'q', 'quit', 'exit'):
            print("\n다운로더를 종료합니다.")
            break

    print("-" * 66)
    input("프로그램을 완전히 종료하려면 [Enter] 키를 누르세요...")

if __name__ == "__main__":
    main()
