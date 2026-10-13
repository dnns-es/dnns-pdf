# Fecha: 2026-10-12
# Ruta: /scripts/secretos-apple.ps1
# Pone en el repo los secretos de Apple que necesita la app de iPhone para subir a TestFlight
# Certificado de distribución y clave de App Store Connect del equipo (los mismos de las otras apps de DNNS)
# y el perfil «DNNS PDF App Store» de es.dnns.pdf.
# Notas: lo ejecuta Antonio en su equipo: las credenciales van de su carpeta de claves a los secretos de
#        GitHub sin pasar por ningún otro sitio. No imprime ningún valor, solo los nombres.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\secretos-apple.ps1 -Claves "X:\carpeta\.keys" [-Perfil "ruta.mobileprovision"]

param(
    [Parameter(Mandatory = $true)][string]$Claves,
    [string]$Perfil = '',
    [string]$Repo = 'dnns-es/dnns-pdf'
)

$ErrorActionPreference = 'Stop'

function Abortar($mensaje) {
    Write-Host "ERROR: $mensaje" -ForegroundColor Red
    exit 1
}

function PonerSecreto($nombre, $valor) {
    if ([string]::IsNullOrWhiteSpace($valor)) { Abortar "El secreto $nombre saldría vacío." }
    # --body evita los saltos de línea que añade la tubería de PowerShell
    gh secret set $nombre --repo $Repo --body $valor | Out-Null
    if (-not $?) { Abortar "No se ha podido poner $nombre" }
    Write-Host "  puesto: $nombre" -ForegroundColor Green
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Abortar 'No está instalado gh (GitHub CLI).' }
gh auth status 2>&1 | Out-Null
if (-not $?) { Abortar 'gh no está autenticado. Ejecuta: gh auth login' }
if (-not (Test-Path $Claves)) { Abortar "No existe la carpeta de claves: $Claves" }

# --- Certificado y clave de App Store Connect del equipo

$p12 = Join-Path $Claves 'distribution.p12'
$claveP12 = Join-Path $Claves 'p12-password.txt'
foreach ($f in @($p12, $claveP12)) {
    if (-not (Test-Path $f)) { Abortar "Falta el fichero: $f" }
}
$p8 = Get-ChildItem $Claves -Filter 'AuthKey_*.p8' -File | Select-Object -First 1
if (-not $p8) { Abortar "No se encuentra ninguna AuthKey_*.p8 en $Claves" }
$keyId = $p8.BaseName -replace '^AuthKey_', ''

$issuer = $null
$asc = Join-Path $Claves 'asc-api.txt'
if (Test-Path $asc) {
    $m = [regex]::Match((Get-Content $asc -Raw), '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if ($m.Success) { $issuer = $m.Value }
}
if (-not $issuer) { $issuer = (Read-Host 'Issuer ID de App Store Connect (UUID)').Trim() }

# --- Perfil de App Store de es.dnns.pdf (por defecto, el más reciente de Descargas)

if (-not $Perfil) {
    $candidatos = foreach ($c in @('Z:\1Descargas', "$env:USERPROFILE\Downloads", $Claves) | Where-Object { Test-Path $_ }) {
        Get-ChildItem $c -Filter '*.mobileprovision' -File -ErrorAction SilentlyContinue
    }
    $Perfil = $candidatos |
        Where-Object { [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::GetEncoding('ISO-8859-1')) -match '\.es\.dnns\.pdf<' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    if (-not $Perfil) { Abortar 'No encuentro el perfil de es.dnns.pdf. Pasa la ruta con -Perfil.' }
}
if (-not (Test-Path $Perfil)) { Abortar "No existe el fichero: $Perfil" }
$textoPerfil = [IO.File]::ReadAllText($Perfil, [Text.Encoding]::GetEncoding('ISO-8859-1'))
if ($textoPerfil -notmatch '\.es\.dnns\.pdf<') { Abortar 'Ese perfil no es de es.dnns.pdf.' }
if ($textoPerfil -match '<key>ProvisionedDevices</key>') { Abortar 'Ese perfil es de desarrollo; hace falta el de App Store.' }
$nombrePerfil = [regex]::Match($textoPerfil, '<key>Name</key>\s*<string>([^<]+)</string>').Groups[1].Value
if ($nombrePerfil -ne 'DNNS PDF App Store') {
    Abortar "El perfil se llama '$nombrePerfil' y el proyecto espera 'DNNS PDF App Store'. Renómbralo en developer.apple.com."
}
$team = [regex]::Match($textoPerfil, '<key>TeamIdentifier</key>\s*<array>\s*<string>([A-Z0-9]{10})</string>').Groups[1].Value

Write-Host "Repositorio : $Repo"
Write-Host "Perfil      : $Perfil"
Write-Host "Key ID      : $keyId"
Write-Host "Team ID     : $team"
Write-Host ''

PonerSecreto 'APPLE_CERT_P12' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($p12)))
PonerSecreto 'APPLE_CERT_PASSWORD' ((Get-Content $claveP12 -Raw).Trim())
PonerSecreto 'APPLE_ASC_KEY_P8' ((Get-Content $p8.FullName -Raw).Trim())
PonerSecreto 'APPLE_ASC_KEY_ID' $keyId
PonerSecreto 'APPLE_ASC_ISSUER_ID' $issuer
PonerSecreto 'APPLE_TEAM_ID' $team
PonerSecreto 'APPLE_PROFILE' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Perfil)))

Write-Host ''
gh secret list --repo $Repo
