@echo off
chcp 65001 > nul
echo ========================================================
echo   디지펫 바이탈 링크 - 에디터 ➔ 뷰어(index.html) 동기화
echo ========================================================
echo.
echo editor.html 소스를 index.html 및 viewer.html로 동기화합니다...

copy /y "editor.html" "index.html" > nul
copy /y "editor.html" "viewer.html" > nul

echo.
echo [성공] 동기화가 완료되었습니다!
echo • index.html  : 웹 배포 및 뷰어용 최신 동기화 완료
echo • viewer.html : 로컬 뷰어 실행용 최신 동기화 완료
echo.
pause
