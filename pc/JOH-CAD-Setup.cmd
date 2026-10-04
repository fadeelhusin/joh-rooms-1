@echo off
rem ============================================================
rem  JOH Site - PC setup for "Open in AutoCAD"
rem  * keeps the 4 reference drawings in C:\JOH-CAD\drawings (offline)
rem  * registers the johcad:// link so the app opens them in AutoCAD
rem    (or ZWCAD) on the right level layout
rem  No admin rights needed. Run again any time to repair/update.
rem ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0'); iex ($s.Substring($s.LastIndexOf('#PS-BEGIN#')))"
echo.
pause
exit /b
#PS-BEGIN#
$ErrorActionPreference = 'Stop'
$root = 'C:\JOH-CAD'; $dw = Join-Path $root 'drawings'
New-Item -ItemType Directory -Force $dw | Out-Null
$base = 'https://fadeelhusin.github.io/joh-rooms-1/'

# ---------- handler: opens a drawing in AutoCAD / ZWCAD on the right level ----------
$handler = @'
param([string]$uri)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
$root = 'C:\JOH-CAD'; $dw = Join-Path $root 'drawings'
$base = 'https://fadeelhusin.github.io/joh-rooms-1/refs/'
$files = @{ overall = 'JOH_Overall_Colored.dwg'; walls = 'JOH_Wall_Plans.dwg'; ceilings = 'JOH_Ceilings.dwg'; floors = 'JOH_Floors.dwg' }
$m = [regex]::Match([uri]::UnescapeDataString($uri), 'johcad://open/([a-z]+)/?([A-Za-z0-9]*)')
if (-not $m.Success -or -not $files.ContainsKey($m.Groups[1].Value)) { [Windows.Forms.MessageBox]::Show("Unknown drawing link:`n$uri", 'JOH CAD') | Out-Null; exit }
$name = $files[$m.Groups[1].Value]; $level = $m.Groups[2].Value.ToUpper()
$path = Join-Path $dw $name; $tagf = "$path.etag"

# refresh the local copy when online and the file on GitHub changed
try {
  $h = Invoke-WebRequest -Uri ($base + $name) -Method Head -UseBasicParsing -TimeoutSec 6
  $tag = $h.Headers['ETag']
  $old = if (Test-Path $tagf) { Get-Content $tagf -Raw } else { '' }
  if (-not (Test-Path $path) -or ($tag -and $tag.Trim() -ne $old.Trim())) {
    $tmp = "$path.download"
    Start-BitsTransfer -Source ($base + $name) -Destination $tmp -DisplayName "JOH drawing $name" -ErrorAction Stop
    $busy = $false; try { $fs = [IO.File]::Open($path, 'Open', 'ReadWrite', 'None'); $fs.Close() } catch { $busy = (Test-Path $path) }
    if (-not $busy) { Move-Item -Force $tmp $path; Set-Content $tagf $tag -NoNewline } else { Remove-Item $tmp -Force }
  }
} catch { }
if (-not (Test-Path $path)) { [Windows.Forms.MessageBox]::Show("$name is not on this PC yet.`nConnect to the internet once and try again.", 'JOH CAD') | Out-Null; exit }

# level -> layout / named view
function LevelRx($l) {
  if (-not $l) { return $null }
  if ($l -match '^B(\d)$') { $n = $matches[1]; return "(?i)(\bB0?$n\b|BASEMENT[\s_-]*0?$n\b|\bLB0?$n\b)" }
  $n = [int]$l; $p = '{0:D2}' -f $n
  $g = if ($n -eq 0) { '|\bGF\b|GROUND' } else { '' }
  return "(?i)((LEVEL|LVL|LEV|\bL|FLOOR|\bF)[\s_.-]*0?$n\b|[\s_-]$p\b|^$p\b$g)"
}
$rx = LevelRx $level

$app = $null
foreach ($prog in 'AutoCAD.Application', 'ZWCAD.Application') {
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject($prog); break } catch { }
}
if (-not $app) {
  foreach ($prog in 'AutoCAD.Application', 'ZWCAD.Application') {
    try { $app = New-Object -ComObject $prog; break } catch { }
  }
}
if (-not $app) { Start-Process $path; exit }       # no COM: open with the default program
for ($i = 0; $i -lt 60; $i++) { try { $app.Visible = $true; break } catch { Start-Sleep -Milliseconds 500 } }

$doc = $null
for ($i = 0; $i -lt 60 -and -not $doc; $i++) {
  try {
    foreach ($d in $app.Documents) { if ($d.FullName -ieq $path) { $doc = $d } }
    if (-not $doc) { $doc = $app.Documents.Open($path, $true) }   # read-only: never locks or edits the master
  } catch { Start-Sleep -Milliseconds 700 }
}
if (-not $doc) { Start-Process $path; exit }
try { $app.ActiveDocument = $doc } catch { }
try { $hwnd = $app.HWND; Add-Type 'using System;using System.Runtime.InteropServices;public class W{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'; [W]::ShowWindow([IntPtr]$hwnd, 9) | Out-Null; [W]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null } catch { }

if ($rx) {
  $done = $false
  for ($i = 0; $i -lt 20 -and -not $done; $i++) {
    try {
      $hit = $null
      foreach ($lo in $doc.Layouts) { if ($lo.Name -ne 'Model' -and $lo.Name -match $rx) { if (-not $hit -or $lo.Name.Length -lt $hit.Name.Length) { $hit = $lo } } }
      if ($hit) { $doc.ActiveLayout = $hit; $done = $true; break }
      $vh = $null
      foreach ($v in $doc.Views) { if ($v.Name -match $rx) { if (-not $vh -or $v.Name.Length -lt $vh.Name.Length) { $vh = $v } } }
      if ($vh) { $doc.ActiveLayout = $doc.Layouts.Item('Model'); $doc.SendCommand("_-VIEW _R `"$($vh.Name)`" "); $done = $true; break }
      $done = $true
    } catch { Start-Sleep -Milliseconds 700 }
  }
}
'@
Set-Content -Path (Join-Path $root 'open.ps1') -Value $handler -Encoding UTF8
Set-Content -Path (Join-Path $root 'open.vbs') -Encoding ASCII -Value @'
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\JOH-CAD\open.ps1"" """ & WScript.Arguments(0) & """", 0, False
'@

# ---------- register johcad:// for this Windows user ----------
$k = 'HKCU:\Software\Classes\johcad'
New-Item -Force $k | Out-Null
Set-ItemProperty $k '(default)' 'URL:JOH CAD drawing'
Set-ItemProperty $k 'URL Protocol' ''
New-Item -Force "$k\shell\open\command" | Out-Null
Set-ItemProperty "$k\shell\open\command" '(default)' 'wscript.exe "C:\JOH-CAD\open.vbs" "%1"'
Write-Host 'Link johcad:// registered.' -ForegroundColor Green

# ---------- first download of the drawings (kept offline) ----------
foreach ($f in 'JOH_Overall_Colored.dwg', 'JOH_Wall_Plans.dwg', 'JOH_Ceilings.dwg', 'JOH_Floors.dwg') {
  $p = Join-Path $dw $f
  try {
    $h = Invoke-WebRequest -Uri ($base + 'refs/' + $f) -Method Head -UseBasicParsing -TimeoutSec 15
    $tag = $h.Headers['ETag']; $old = if (Test-Path "$p.etag") { Get-Content "$p.etag" -Raw } else { '' }
    if ((Test-Path $p) -and $tag -and $tag.Trim() -eq $old.Trim()) { Write-Host "$f up to date"; continue }
    Write-Host "Downloading $f ..."
    Start-BitsTransfer -Source ($base + 'refs/' + $f) -Destination "$p.download"
    Move-Item -Force "$p.download" $p; Set-Content "$p.etag" $tag -NoNewline
    Write-Host "$f saved" -ForegroundColor Green
  } catch { Write-Host "$f : $($_.Exception.Message)" -ForegroundColor Yellow }
}
Write-Host "`nDone. Drawings are in $dw and open from the JOH Site app with 'Open in AutoCAD'." -ForegroundColor Cyan
