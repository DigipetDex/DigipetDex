@echo off
chcp 65001 > nul
title 디지몬 humulos 도트 스프라이트 다운로더
cd /d "%~dp0"

echo ======================================================================
echo   디지몬 humulos 도트 스프라이트 자동 다운로더 (Animated GIF)
echo ======================================================================
echo.
echo humulos 사이트에서 원하는 DiM 페이지나 링크를 복사해 붙여넣으세요.
echo (마우스 우클릭하면 붙여넣기 됩니다)
echo.
echo [추천 예시 주소들]
echo - 감마몬 BE:   https://humulos.com/digimon/vbbe/anime/#gamma_anchor
echo - 아구몬 EX:   https://humulos.com/digimon/vbdm/ex/#agu_ex_anchor
echo - 파피몬 EX:   https://humulos.com/digimon/vbdm/ex/#gabu_ex_anchor
echo - 볼캐닉 비트: https://humulos.com/digimon/vbdm/vol/#vbe_anchor
echo - 앙고라몬 BE: https://humulos.com/digimon/vbbe/anime/#angora_anchor
echo - 젤리몬 BE:   https://humulos.com/digimon/vbbe/anime/#jelly_anchor
echo.
echo 아무것도 입력하지 않고 [엔터]를 치면 감마몬 BE를 다운로드합니다.
echo ======================================================================
echo.

python download_humulos_gifs.py

echo.
echo 아무 키나 누르면 창을 닫습니다...
pause > nul
