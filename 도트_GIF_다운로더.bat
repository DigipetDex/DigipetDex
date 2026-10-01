@echo off
chcp 65001 > nul
title humulos 도트 스프라이트 자동 다운로더
cd /d "%~dp0"

python download_humulos_gifs.py

if errorlevel 1 (
    echo.
    echo [오류] Python 실행 중 문제가 발생했습니다.
    echo Python 설치 및 Pillow 라이브러리(pip install Pillow) 설치 여부를 확인해 주세요.
    echo.
    pause
)
