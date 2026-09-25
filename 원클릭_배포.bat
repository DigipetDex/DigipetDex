@echo off
chcp 65001 > nul
echo ========================================================
echo   Digipet Vital Link - GitHub Pages One-Click Deploy
echo ========================================================
echo.
echo [1/3] Packaging latest files...
python make_deploy.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Adding and committing changes...
git add -A
git diff-index --quiet HEAD --
if %ERRORLEVEL% NEQ 0 (
    git commit -m "Auto deploy update (%date% %time%)"
) else (
    echo [INFO] No new changes to commit.
)

echo.
echo [3/3] Pushing to GitHub (https://github.com/DigipetDex/DigipetDex)...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  [SUCCESS] 배포 완료!
    echo  사이트 주소: https://digipetdex.github.io/DigipetDex/
    echo ========================================================
) else (
    echo.
    echo [ERROR] GitHub Push 실패. (권한 또는 네트워크 확인 필요)
)

echo.
pause