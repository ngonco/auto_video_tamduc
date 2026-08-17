# Script Sao Lưu 1-Click Lên GitHub cho Auto Video Tâm Đức
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   🚀 AUTO VIDEO TÂM ĐỨC - BACKUP LÊN GITHUB" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$commitMsg = $args -join " "
if (-not $commitMsg) {
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMsg = "Cập nhật mã nguồn Auto Video Tâm Đức - $now"
}

Write-Host "`n[1/3] Đang thêm file thay đổi..." -ForegroundColor Green
git add .

Write-Host "[2/3] Đang commit với thông điệp: '$commitMsg'..." -ForegroundColor Green
git commit -m "$commitMsg"

Write-Host "[3/3] Đang push lên GitHub..." -ForegroundColor Green
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ BACKUP THÀNH CÔNG LÊN GITHUB (https://github.com/ngonco/auto_video_tamduc)!" -ForegroundColor Green
} else {
    Write-Host "`n❌ CÓ LỖI XẢY RA KHI PUSH LÊN GITHUB" -ForegroundColor Red
}
