<#
.SYNOPSIS
    Compute the canonical Freshness-Envelope anchor hash for a code range.

.DESCRIPTION
    Given a spec of the form "relative/path#Lx-Ly", reads the inclusive
    1-indexed line range, trims trailing whitespace on each line, joins with
    LF, and returns the first 8 lowercase hex chars of SHA256 over the UTF8
    bytes. This is the same algorithm compile-wiki.ps1 and search-wiki.ps1 use
    to detect code drift, exposed here so authors can stamp @hash8 onto a
    `code_anchors` frontmatter entry.

.PARAMETER Spec
    One or more "path#Lx-Ly" specs (relative to the repo root).

.EXAMPLE
    ./anchor-hash.ps1 "packages/omo-opencode/src/index.ts#L1-L20"
    Prints: packages/omo-opencode/src/index.ts#L1-L20@1a2b3c4d
#>
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Spec
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path

function Get-AnchorHash {
    param([string]$RepoRoot, [string]$Spec)
    if ($Spec -notmatch '^(.+)#L(\d+)-L(\d+)$') { return "SPEC" }
    $relPath = $Matches[1]; $start = [int]$Matches[2]; $end = [int]$Matches[3]
    $full = Join-Path $RepoRoot $relPath
    if (-not (Test-Path $full)) { return "MISSING" }
    $lines = @(Get-Content $full -Encoding UTF8)
    if ($start -lt 1 -or $end -gt $lines.Count -or $start -gt $end) { return "RANGE" }
    $slice = $lines[($start - 1)..($end - 1)] | ForEach-Object { $_.TrimEnd() }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(($slice -join "`n")))
    } finally {
        $sha.Dispose()
    }
    return (([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLower()).Substring(0, 8)
}

foreach ($s in $Spec) {
    $s = $s.Trim()
    $hash = Get-AnchorHash -RepoRoot $repoRoot -Spec $s
    switch ($hash) {
        "SPEC"    { Write-Error "Bad spec (expected path#Lx-Ly): $s" }
        "MISSING" { Write-Error "File not found for spec: $s" }
        "RANGE"   { Write-Error "Line range out of bounds for spec: $s" }
        default   { Write-Output "$s@$hash" }
    }
}
