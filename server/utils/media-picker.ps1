param(
    [string]$Title = "Chon File Video Hoac Anh (MP4, MOV, MKV, JPG, PNG...)",
    [string]$InitialDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms

$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = $Title
$dlg.ValidateNames = $true
$dlg.CheckFileExists = $true
$dlg.CheckPathExists = $true
$dlg.Filter = "Media Files (*.mp4;*.mov;*.mkv;*.avi;*.webm;*.jpg;*.jpeg;*.png;*.webp;*.bmp)|*.mp4;*.mov;*.mkv;*.avi;*.webm;*.jpg;*.jpeg;*.png;*.webp;*.bmp|Video Files (*.mp4;*.mov;*.mkv;*.avi;*.webm)|*.mp4;*.mov;*.mkv;*.avi;*.webm|Image Files (*.jpg;*.jpeg;*.png;*.webp;*.bmp)|*.jpg;*.jpeg;*.png;*.webp;*.bmp|All Files (*.*)|*.*"

if ($InitialDir -and (Test-Path $InitialDir)) {
    $dlg.InitialDirectory = $InitialDir
}

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

if ($dlg.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($dlg.FileName)
}

$form.Dispose()
$dlg.Dispose()
