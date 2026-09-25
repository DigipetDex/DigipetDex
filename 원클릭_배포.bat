@echo off
echo ========================================================
echo   Digipet Vital Link - One Click Deploy
echo ========================================================
echo.
echo [1/2] Packaging latest files...
python make_deploy.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Uploading to Netlify (digipetdex)...
echo.

call netlify.cmd deploy --prod --dir=dist

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  [SUCCESS] https://digipetdex.netlify.app deployed!
    echo ========================================================
) else (
    echo.
    echo [ERROR] Deploy failed.
)

echo.
pause