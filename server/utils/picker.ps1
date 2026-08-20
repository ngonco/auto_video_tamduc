param(
    [string]$Title = "Chon Thu Muc",
    [string]$InitialDir = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms

$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = $Title
$dlg.ValidateNames = $false
$dlg.CheckFileExists = $false
$dlg.CheckPathExists = $true
$dlg.FileName = "SelectFolder"
$dlg.Filter = "Folders|*."

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
    $selected = $dlg.FileName
    if (Test-Path $selected -PathType Container) {
        [Console]::Out.WriteLine($selected)
    } else {
        $folder = [System.IO.Path]::GetDirectoryName($selected)
        [Console]::Out.WriteLine($folder)
    }
}

$form.Dispose()
$dlg.Dispose()
