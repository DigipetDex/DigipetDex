# -*- coding: utf-8 -*-
"""project_data.js 안의 base64 이미지(data:image/...)를 images/embedded/<해시>.<확장자> 파일로 빼내고
digimon.img 를 상대 경로로 바꾼다. 여러 번 실행해도 안전하다(이미 경로인 항목은 건드리지 않음).

사용: python tools/externalize_images.py [프로젝트 루트] [--check]
  --check : 파일을 바꾸지 않고, 외부화할 이미지가 몇 개인지만 출력한다.
"""
import sys, os, re, json, base64, hashlib

sys.stdout.reconfigure(encoding='utf-8')

HEADER = "// 디지펫 바이탈 링크 프로젝트 데이터\nwindow.DIGIPET_DEFAULT_DATA = "
EXT = {'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg'}
DATA_RE = re.compile(r'^data:([^;,]+)((?:;[^;,]+)*?),(.*)$', re.S)


def load(path):
    text = open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    if not text.startswith(HEADER):
        raise SystemExit(f'예상한 헤더가 아닙니다: {path}')
    body = text[len(HEADER):].rstrip()
    if not body.endswith(';'):
        raise SystemExit('project_data.js 끝에 ; 가 없습니다')
    return json.loads(body[:-1])


def save(path, data):
    text = HEADER + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def externalize(data, out_dir, rel_prefix='images/embedded', dry=False):
    """data['digimons'][*]['img'] 의 data URI 를 파일로 저장. (변환 수, 새로 쓴 파일 수, 절약 문자 수) 반환"""
    converted = written = saved_chars = 0
    if not dry:
        os.makedirs(out_dir, exist_ok=True)
    for digi in data.get('digimons', {}).values():
        img = digi.get('img') or ''
        if not img.startswith('data:'):
            continue
        m = DATA_RE.match(img)
        if not m:
            continue
        mime, params, payload = m.group(1).lower(), m.group(2), m.group(3)
        if ';base64' in params:
            raw = base64.b64decode(payload)
        else:
            from urllib.parse import unquote_to_bytes
            raw = unquote_to_bytes(payload)
        ext = EXT.get(mime)
        if not ext:
            continue  # 알 수 없는 형식은 그대로 둔다
        name = hashlib.sha1(raw).hexdigest()[:16] + '.' + ext
        target = os.path.join(out_dir, name)
        if not dry and not os.path.exists(target):
            with open(target, 'wb') as f:
                f.write(raw)
            written += 1
        saved_chars += len(img)
        converted += 1
        if not dry:
            digi['img'] = f'{rel_prefix}/{name}'
    return converted, written, saved_chars


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--check' in sys.argv
    root = os.path.abspath(args[0]) if args else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, 'project_data.js')
    data = load(path)
    conv, written, chars = externalize(data, os.path.join(root, 'images', 'embedded'), dry=dry)
    if dry:
        print(f'[검사] 외부화 대상 이미지: {conv}개 ({chars/1024/1024:.1f}MB)')
        return
    if conv:
        save(path, data)
    print(f'[이미지] base64 {conv}개 → 파일 {written}개 신규 저장 (project_data.js {chars/1024/1024:.1f}MB 감소)' if conv
          else '[이미지] 외부화할 base64 이미지 없음')


if __name__ == '__main__':
    main()
