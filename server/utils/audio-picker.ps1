param(
    [string]$Title = "Chon File Voice Am Thanh (MP3, WAV, M4A)",
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
$dlg.Filter = "Audio Files (*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.flac)|*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.flac|All Files (*.*)|*.*"

if ($InitialDir -and (Test-Path $InitialDir)) {
    if (Test-Path $InitialDir -PathType Container) {
        $dlg.InitialDirectory = $InitialDir
    } else {
        $dlg.InitialDirectory = [System.IO.Path]::GetDirectoryName($InitialDir)
    }
}

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.WindowState = [System.Windows.Forms.FormWindowState]::Normal

$result = $dlg.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.WriteLine($dlg.FileName)
}

$form.Dispose()
$dlg.Dispose()
