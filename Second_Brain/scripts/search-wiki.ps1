<#
.SYNOPSIS
    Keyword search over Second Brain wiki pages with ranked results.
.DESCRIPTION
    Searches committed fragments in wiki/fragments/ for keywords. The generated
    wiki/.compiled/, wiki/log/, and wiki/journal/ trees are NOT searched, so
    results are deterministic across machines and never duplicate a fragment
    with its compiled copy. Multi-word queries use AND logic; when AND matches
    nothing it falls back to OR (any keyword, scaled by the fraction matched).
    Keywords hitting a fragment's target/tags are weighted higher. Returns
    ranked results as a markdown table including file path, matching line, and
    frontmatter tags.
.PARAMETER Query
    Space-separated keywords. All keywords must appear in a file for it to match.
.PARAMETER Top
    Maximum number of results to return. Default: 20.
.PARAMETER Folder
    Restrict search to a fragments subfolder / author (e.g., "felix").
.EXAMPLE
    .\search-wiki.ps1 "notification email template"
.EXAMPLE
    .\search-wiki.ps1 "auth" -Top 5 -Folder felix
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Query,

    [Parameter()]
    [int]$Top = 20,

    [Parameter()]
    [string]$Folder
)

$wikiRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "wiki")).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
$fragmentsRoot = Join-Path $wikiRoot "fragments"

# Determine search path. Fragments are the committed source of truth; the
# generated .compiled/, log/, and journal/ trees are intentionally excluded.
$searchPath = $fragmentsRoot
if ($Folder) {
    $searchPath = Join-Path $fragmentsRoot $Folder
    if (-not (Test-Path $searchPath)) {
        Write-Error "Folder not found: $searchPath"
        exit 1
    }
}

# ─────────────────────────────────────────────
# Freshness Envelope helpers (kept in sync with compile-wiki.ps1)
# ─────────────────────────────────────────────

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

function Get-Frontmatter($filePath) {
    $lines = Get-Content $filePath -Encoding UTF8 -ErrorAction SilentlyContinue
    $fm = @{}
    $inFm = $false; $done = $false
    $fmLines = @()
    foreach ($line in $lines) {
        $t = $line.Trim()
        if (-not $done -and $t -eq "---") {
            if (-not $inFm) { $inFm = $true; continue } else { break }
        }
        if ($inFm -and $t -ne "") { $fmLines += $t }
    }
    # Merge multiline flow arrays (formatter reflow) back onto their key.
    $logical = @()
    foreach ($fl in $fmLines) {
        if ($fl -match "^(\w[\w-]*):") { $logical += $fl }
        elseif ($logical.Count -gt 0) { $logical[-1] = ($logical[-1] + " " + $fl).Trim() }
    }
    foreach ($ll in $logical) {
        if ($ll -match "^(\w[\w-]*):\s*(.+)$") {
            $key = $Matches[1]; $value = $Matches[2].Trim()
            if ($value -match "^\[(.*)\]$") { $value = @(($Matches[1] -split ",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }) }
            elseif ($value -match "^['""](.+)['""]$") { $value = $Matches[1] }
            $fm[$key] = $value
        }
    }
    return $fm
}

function Get-FreshnessState {
    param($Frontmatter, [string]$RepoRoot)
    $type = $Frontmatter["type"]
    $created = $Frontmatter["created"]
    $lastVerified = $Frontmatter["last_verified"]
    $ttlDays = $Frontmatter["ttl_days"]
    $trust = if ($Frontmatter["trust"]) { $Frontmatter["trust"] } else { "curated" }
    $anchors = $Frontmatter["code_anchors"]

    $defaults = @{ lesson = 180; decision = 365; entity = 30; concept = 90; source = 14; analysis = 60; overview = 120; synthesis = 60 }
    $ttl = if ($ttlDays) { [double]$ttlDays } elseif ($type -and $defaults.ContainsKey($type)) { [double]$defaults[$type] } else { 60.0 }

    $refStr = if ($lastVerified) { $lastVerified } else { $created }
    $refDate = [DateTime]::MinValue
    $parsed = [DateTime]::TryParse($refStr, [ref]$refDate)
    $ageDays = if ($parsed) { (New-TimeSpan -Start $refDate -End (Get-Date)).TotalDays } else { $null }

    $drift = $null
    if ($anchors) {
        $anchorList = if ($anchors -is [array]) { $anchors } else { @($anchors) }
        foreach ($a in $anchorList) {
            $a = "$a".Trim()
            if ($a -notmatch '@') { continue }
            $parts = $a -split '@', 2
            $current = Get-AnchorHash -RepoRoot $RepoRoot -Spec $parts[0].Trim()
            if ($current -eq "MISSING" -or $current -eq "RANGE" -or $current -eq "SPEC") { $drift = $current; break }
            if ($current -ne $parts[1].Trim()) { $drift = "mismatch"; break }
        }
    }

    $state = "UNKNOWN"
    if ($drift) { $state = "DRIFTED" }
    elseif ($null -ne $ageDays) {
        if ($ageDays -le $ttl) { $state = "FRESH" }
        elseif ($ageDays -le ($ttl * 3)) { $state = "AGING" }
        else { $state = "STALE" }
    }
    return @{ State = $state; Trust = $trust }
}

function Get-FreshnessFactor([string]$State) {
    switch ($State) {
        "FRESH" { 1.0 } "AGING" { 0.85 } "UNKNOWN" { 0.8 } "STALE" { 0.6 } "DRIFTED" { 0.3 } default { 0.8 }
    }
}

function Get-TrustFactor([string]$Trust) {
    switch ($Trust) {
        "verified" { 1.2 } "curated" { 1.0 } "source" { 0.9 } "untrusted" { 0.3 } default { 1.0 }
    }
}

function Get-StateBadge([string]$State) {
    switch ($State) {
        "FRESH" { "✅" } "AGING" { "🟡" } "STALE" { "🟠" } "DRIFTED" { "🔴" } default { "⚪" }
    }
}

# Parse keywords (AND logic)
$keywords = $Query.Trim() -split '\s+' | Where-Object { $_ -ne '' }
if ($keywords.Count -eq 0) {
    Write-Error "No keywords provided."
    exit 1
}

function Get-FrontmatterTags($filePath) {
    $lines = Get-Content $filePath -TotalCount 15 -ErrorAction SilentlyContinue
    $inFrontmatter = $false
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "---") {
            if (-not $inFrontmatter) { $inFrontmatter = $true; continue }
            else { break }
        }
        if ($inFrontmatter -and $trimmed -match "^tags:\s*\[(.+)\]") {
            return $Matches[1]
        }
    }
    return ""
}

function Get-BestMatchLine($filePath, $keywords) {
    $lines = Get-Content $filePath -ErrorAction SilentlyContinue
    $bestScore = 0
    $bestLine = ""
    $bestLineNum = 0
    $lineNum = 0

    foreach ($line in $lines) {
        $lineNum++
        # Skip frontmatter delimiters and empty lines
        if ($line.Trim() -eq "---" -or $line.Trim() -eq "") { continue }

        $score = 0
        foreach ($kw in $keywords) {
            if ($line -match [regex]::Escape($kw)) {
                $score++
            }
        }
        if ($score -gt $bestScore) {
            $bestScore = $score
            $bestLine = $line.Trim()
            $bestLineNum = $lineNum
        }
    }

    return @{
        Line    = if ($bestLine.Length -gt 80) { $bestLine.Substring(0, 77) + "..." } else { $bestLine }
        LineNum = $bestLineNum
        Score   = $bestScore
    }
}

# Collect candidates (files matching >= 1 keyword). Scoring is deferred until we
# know whether any file matched ALL keywords (AND) or we must fall back to OR.
$candidates = @()

Get-ChildItem $searchPath -Recurse -Filter "*.md" | ForEach-Object {
    if ($_.Name -eq 'README.md') { return }
    $filePath = $_.FullName
    $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return }

    $fm = Get-Frontmatter $filePath
    $targetText = "$($fm['target'])"
    $tagsVal = $fm['tags']
    $tagsText = if ($tagsVal -is [array]) { $tagsVal -join ' ' } else { "$tagsVal" }

    # Per-keyword: count body hits, and note target/tag hits for weighting.
    $hitCount = 0
    $matchedCount = 0
    $tagTargetBonus = 0
    foreach ($kw in $keywords) {
        $esc = [regex]::Escape($kw)
        $bodyHits = [regex]::Matches($content, $esc, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase).Count
        $inTarget = [regex]::IsMatch($targetText, $esc, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $inTags = [regex]::IsMatch($tagsText, $esc, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($bodyHits -gt 0) { $hitCount += $bodyHits }
        if ($inTarget) { $tagTargetBonus += 6 }
        if ($inTags) { $tagTargetBonus += 3 }
        if ($bodyHits -gt 0 -or $inTarget -or $inTags) { $matchedCount++ }
    }
    if ($matchedCount -eq 0) { return }

    $tags = Get-FrontmatterTags $filePath
    $matchInfo = Get-BestMatchLine $filePath $keywords
    $freshness = Get-FreshnessState $fm $repoRoot
    $relPath = $filePath.Substring($wikiRoot.Length + 1) -replace '\\', '/'

    $candidates += [PSCustomObject]@{
        Path           = $relPath
        HitCount       = $hitCount
        MatchedCount   = $matchedCount
        TagTargetBonus = $tagTargetBonus
        LineScore      = $matchInfo.Score
        LineNum        = $matchInfo.LineNum
        Line           = $matchInfo.Line
        Tags           = $tags
        State          = $freshness.State
        Trust          = $freshness.Trust
    }
}

# AND first; OR fallback only when nothing matched every keyword.
$andCandidates = @($candidates | Where-Object { $_.MatchedCount -eq $keywords.Count })
$orMode = $andCandidates.Count -eq 0
$chosen = if ($orMode) { $candidates } else { $andCandidates }

$results = @()
foreach ($c in $chosen) {
    $base = $c.HitCount + ($c.LineScore * 5) + $c.TagTargetBonus
    $fraction = if ($orMode) { $c.MatchedCount / $keywords.Count } else { 1 }
    $score = [math]::Round($base * $fraction * (Get-FreshnessFactor $c.State) * (Get-TrustFactor $c.Trust), 2)
    $results += [PSCustomObject]@{
        Path    = $c.Path
        Score   = $score
        LineNum = $c.LineNum
        Line    = $c.Line
        Tags    = $c.Tags
        State   = $c.State
    }
}

# Sort by score descending, take top N
$results = @($results | Sort-Object Score -Descending | Select-Object -First $Top)

# Output as markdown table
if ($results.Count -eq 0) {
    Write-Host "No results found for: $Query"
    exit 0
}

Write-Host ""
Write-Host "## Search Results for: ``$Query``"
Write-Host ""
Write-Host "| # | Path | Line | Match | State | Tags |"
Write-Host "|---|------|------|-------|-------|------|"

$rank = 0
foreach ($r in $results) {
    $rank++
    Write-Host "| $rank | $($r.Path) | L$($r.LineNum) | $($r.Line) | $(Get-StateBadge $r.State) | $($r.Tags) |"
}

Write-Host ""
Write-Host "*$($results.Count) result(s) found. Query keywords: $($keywords -join ', ')*"
