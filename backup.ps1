# Script Sao Luu 1-Click Len GitHub cho Auto Video Tam Duc
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   AUTO VIDEO TAM DUC - BACKUP LEN GITHUB" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$commitMsg = $args -join " "
if (-not $commitMsg) {
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMsg = "Cap nhat ma nguon Auto Video Tam Duc - $now"
}

Write-Host "`n[1/3] Dang them file thay doi..." -ForegroundColor Green
git add .

Write-Host "[2/3] Dang commit voi thong diep: '$commitMsg'..." -ForegroundColor Green
git commit -m "$commitMsg"

Write-Host "[3/3] Dang push len GitHub..." -ForegroundColor Green
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] BACKUP THANH CONG LEN GITHUB (https://github.com/ngonco/auto_video_tamduc)!" -ForegroundColor Green
} else {
    Write-Host "`n[INFO] Khong co thay doi moi hoac da dong bo hoan toan." -ForegroundColor Yellow
}
