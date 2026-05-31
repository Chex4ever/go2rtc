param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '..\cmd\go2rtc-updater\versioninfo.json'
$parts = $Version.Split('.')
while ($parts.Count -lt 3) { $parts += '0' }
$major = [int]$parts[0]
$minor = [int]$parts[1]
$patch = [int]$parts[2]
$build = 0
$fileVersion = "$major.$minor.$patch.$build"

$json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$json.FixedFileInfo.FileVersion.Major = $major
$json.FixedFileInfo.FileVersion.Minor = $minor
$json.FixedFileInfo.FileVersion.Patch = $patch
$json.FixedFileInfo.FileVersion.Build = $build
$json.FixedFileInfo.ProductVersion.Major = $major
$json.FixedFileInfo.ProductVersion.Minor = $minor
$json.FixedFileInfo.ProductVersion.Patch = $patch
$json.FixedFileInfo.ProductVersion.Build = $build
$json.StringFileInfo.FileVersion = $fileVersion
$json.StringFileInfo.ProductVersion = $fileVersion
$text = $json | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
