@echo off
chcp 65001 >nul
echo ========================================================
echo   🚀 AUTO VIDEO TÂM ĐỨC - BACKUP LÊN GITHUB
echo ========================================================
echo.

echo [1/3] Đang kiểm tra và thêm các file thay đổi...
git add .

set COMMIT_MSG=Backup Auto Video Tam Duc - %date% %time%
if not "%~1"=="" set COMMIT_MSG=%*

echo [2/3] Đang tạo bản ghi commit: "%COMMIT_MSG%"...
git commit -m "%COMMIT_MSG%"

echo [3/3] Đang đẩy lên GitHub repository...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   ✅ BACKUP THÀNH CÔNG LÊN GITHUB!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   ❌ CÓ LỖI XẢY RA KHI PUSH LÊN GITHUB
    echo ========================================================
)

echo.
pause
