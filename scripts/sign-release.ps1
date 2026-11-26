# Signs a Pantera APK with your own key, making the key the first time.
# The password is asked for by Java and is never stored or shown.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Keystore = "$env:USERPROFILE\pantera-signing\pantera-release.p12"
)

function Stop-Signing([string]$Why) {
  Write-Host $Why -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $In)) { Stop-Signing "There is no file at $In" }

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
$tools = Get-ChildItem "$sdk\build-tools" -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [version]($_.Name -replace '[^0-9.].*$', '') } | Select-Object -Last 1
if (-not $tools) { Stop-Signing "Android build tools weren't found in $sdk" }
$apksigner = Join-Path $tools.FullName 'apksigner.bat'

$keytool = (Get-Command keytool.exe -ErrorAction SilentlyContinue).Source
if (-not $keytool -and $env:JAVA_HOME) { $keytool = "$env:JAVA_HOME\bin\keytool.exe" }
if (-not $keytool) { Stop-Signing "Java's keytool wasn't found." }

if (-not (Test-Path $Keystore)) {
  New-Item -ItemType Directory -Force (Split-Path $Keystore) | Out-Null
  Write-Host ""
  Write-Host "Making your signing key. Choose a password (at least 6 characters) and write it down." -ForegroundColor Cyan
  Write-Host "Without the key and its password you can never update the app. Nothing shows as you type."
  & $keytool -genkeypair -storetype PKCS12 -keystore $Keystore -alias pantera -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Pantera"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Keystore)) { Stop-Signing "The key wasn't made. Run this again." }
}

Write-Host ""
Write-Host "Signing. Type your key's password." -ForegroundColor Cyan
& $apksigner sign --ks $Keystore --ks-key-alias pantera --v4-signing-enabled false --out $Out $In
if ($LASTEXITCODE -ne 0) { Stop-Signing "Signing failed (usually a mistyped password). Run this again." }

& $apksigner verify --print-certs $Out | Select-String 'certificate (DN|SHA-256)'
if ($LASTEXITCODE -ne 0) { Stop-Signing "The signed file didn't verify." }
Write-Host ""
Write-Host "Done: $Out" -ForegroundColor Green
Write-Host "Back up your key somewhere safe: $Keystore"
