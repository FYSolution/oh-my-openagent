<#
.SYNOPSIS
    Keyword search over Second Brain wiki pages with ranked results.
.DESCRIPTION
    Searches all markdown files in wiki/ for keywords. Supports multi-word
    queries with AND logic. Returns ranked results as a markdown table
    including file path, matching line, and frontmatter tags.
.PARAMETER Query
    Space-separated keywords. All keywords must appear in a file for it to match.
.PARAMETER Top
    Maximum number of results to return. Default: 20.
.PARAMETER Folder
    Restrict search to a specific wiki subfolder (e.g., "entities", "concepts").
.EXAMPLE
    .\search-wiki.ps1 "notification email template"
.EXAMPLE
    .\search-wiki.ps1 "auth" -Top 5 -Folder entities
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

# Determine search path
$searchPath = $wikiRoot
if ($Folder) {
    $searchPath = Join-Path $wikiRoot $Folder
    if (-not (Test-Path $searchPath)) {
        Write-Error "Folder not found: $searchPath"
        exit 1
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

# Search all markdown files
$results = @()

Get-ChildItem $searchPath -Recurse -Filter "*.md" | ForEach-Object {
    $filePath = $_.FullName
    $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return }

    # AND logic: all keywords must appear (case-insensitive)
    $allMatch = $true
    $hitCount = 0
    foreach ($kw in $keywords) {
        $matches = [regex]::Matches($content, [regex]::Escape($kw), [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($matches.Count -eq 0) {
            $allMatch = $false
            break
        }
        $hitCount += $matches.Count
    }

    if (-not $allMatch) { return }

    # Get tags and best matching line
    $tags = Get-FrontmatterTags $filePath
    $matchInfo = Get-BestMatchLine $filePath $keywords

    # Compute rank score: total keyword hits + bonus for line density
    $score = $hitCount + ($matchInfo.Score * 5)

    # Relative path from wiki root
    $relPath = $filePath.Substring($wikiRoot.Length + 1) -replace '\\', '/'

    $results += [PSCustomObject]@{
        Path    = $relPath
        Score   = $score
        LineNum = $matchInfo.LineNum
        Line    = $matchInfo.Line
        Tags    = $tags
    }
}

# Sort by score descending, take top N
$results = $results | Sort-Object Score -Descending | Select-Object -First $Top

# Output as markdown table
if ($results.Count -eq 0) {
    Write-Host "No results found for: $Query"
    exit 0
}

Write-Host ""
Write-Host "## Search Results for: ``$Query``"
Write-Host ""
Write-Host "| # | Path | Line | Match | Tags |"
Write-Host "|---|------|------|-------|------|"

$rank = 0
foreach ($r in $results) {
    $rank++
    Write-Host "| $rank | $($r.Path) | L$($r.LineNum) | $($r.Line) | $($r.Tags) |"
}

Write-Host ""
Write-Host "*$($results.Count) result(s) found. Query keywords: $($keywords -join ', ')*"
