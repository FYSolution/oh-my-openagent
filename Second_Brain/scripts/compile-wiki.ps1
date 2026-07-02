<#
.SYNOPSIS
    Compiles wiki fragments into assembled pages and a manifest.
.DESCRIPTION
    Reads all fragments from wiki/fragments/*/, groups by target,
    applies merge strategies (replace/append/correct), and produces:
    - wiki/.compiled/_manifest.json (structured catalog)
    - wiki/.compiled/index.md (navigable page list)
    - wiki/.compiled/{type}/{target}.md (assembled pages)
.EXAMPLE
    .\compile-wiki.ps1
    .\compile-wiki.ps1 -Verbose
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$secondBrainRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$fragmentsRoot = Join-Path $secondBrainRoot "wiki" "fragments"
$compiledRoot = Join-Path $secondBrainRoot "wiki" ".compiled"
$rawRoot = Join-Path $secondBrainRoot "raw"
$repoRoot = (Resolve-Path (Join-Path $secondBrainRoot "..")).Path

# ─────────────────────────────────────────────
# Freshness Envelope — code-anchor + timestamp staleness detection
# ─────────────────────────────────────────────

# Canonical anchor hash: first 8 lowercase hex of SHA256 over the 1-indexed inclusive
# line range, each line TrimEnd'd, joined with LF, file read as UTF8. Language-agnostic
# so a future TypeScript verifier produces identical hashes.
function Get-AnchorHash {
    param([string]$RepoRoot, [string]$Spec)
    if ($Spec -notmatch '^(.+)#L(\d+)-L(\d+)$') { return "SPEC" }
    $relPath = $Matches[1]; $start = [int]$Matches[2]; $end = [int]$Matches[3]
    $full = Join-Path $RepoRoot $relPath
    if (-not (Test-Path $full)) { return "MISSING" }
    $lines = @(Get-Content $full -Encoding UTF8)
    if ($start -lt 1 -or $end -gt $lines.Count -or $start -gt $end) { return "RANGE" }
    $slice = $lines[($start - 1)..($end - 1)] | ForEach-Object { $_.TrimEnd() }
    $text = ($slice -join "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))
    } finally {
        $sha.Dispose()
    }
    return (([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLower()).Substring(0, 8)
}

# Freshness state machine: FRESH -> AGING -> STALE (time decay) with DRIFTED override
# when a code anchor no longer matches its stored hash. Time-only fragments still get a
# state from age vs a per-type TTL; anchored fragments additionally get drift detection.
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
            $spec = $parts[0].Trim(); $stored = $parts[1].Trim()
            $current = Get-AnchorHash -RepoRoot $RepoRoot -Spec $spec
            if ($current -eq "MISSING") { $drift = "missing: $spec"; break }
            if ($current -eq "RANGE") { $drift = "range: $spec"; break }
            if ($current -eq "SPEC") { $drift = "badspec: $spec"; break }
            if ($current -ne $stored) { $drift = "mismatch: $spec"; break }
        }
    }

    $state = "UNKNOWN"
    if ($drift) {
        $state = "DRIFTED"
    } elseif ($null -ne $ageDays) {
        if ($ageDays -le $ttl) { $state = "FRESH" }
        elseif ($ageDays -le ($ttl * 3)) { $state = "AGING" }
        else { $state = "STALE" }
    }

    return @{
        State   = $state
        Drift   = $drift
        RefDate = $refStr
        Trust   = $trust
        AgeDays = if ($null -ne $ageDays) { [math]::Round($ageDays, 1) } else { $null }
        Ttl     = $ttl
    }
}

function Get-StateBadge {
    param([string]$State)
    switch ($State) {
        "FRESH" { "✅ fresh" }
        "AGING" { "🟡 aging" }
        "STALE" { "🟠 stale" }
        "DRIFTED" { "🔴 drifted" }
        default { "⚪ unknown" }
    }
}

function Get-StateRank {
    param([string]$State)
    switch ($State) {
        "DRIFTED" { 4 }
        "STALE" { 3 }
        "UNKNOWN" { 2 }
        "AGING" { 1 }
        "FRESH" { 0 }
        default { 2 }
    }
}

# Clean and recreate compiled directory
if (Test-Path $compiledRoot) {
    Remove-Item $compiledRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $compiledRoot -Force | Out-Null

# ─────────────────────────────────────────────
# Parse all fragments
# ─────────────────────────────────────────────

function Parse-FragmentFrontmatter($filePath) {
    $lines = Get-Content $filePath -Encoding UTF8
    $frontmatter = @{}
    $inFrontmatter = $false
    $frontmatterDone = $false
    $bodyStart = 0
    $fmLines = @()

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i].Trim()
        if (-not $frontmatterDone -and $line -eq "---") {
            if (-not $inFrontmatter) {
                $inFrontmatter = $true
                continue
            } else {
                $frontmatterDone = $true
                $bodyStart = $i + 1
                continue
            }
        }
        if ($inFrontmatter -and -not $frontmatterDone -and $line -ne "") {
            $fmLines += $line
        }
    }

    # Merge continuation lines so multiline flow arrays (as emitted by markdown
    # formatters that reflow `key: [a, b]` across lines) collapse back onto their
    # key. A line starts a new key only if it looks like `word:`; everything else
    # is a continuation of the current value.
    $logical = @()
    foreach ($fl in $fmLines) {
        if ($fl -match "^(\w[\w-]*):") {
            $logical += $fl
        } elseif ($logical.Count -gt 0) {
            $logical[-1] = ($logical[-1] + " " + $fl).Trim()
        }
    }

    foreach ($ll in $logical) {
        if ($ll -match "^(\w[\w-]*):\s*(.+)$") {
            $key = $Matches[1]
            $value = $Matches[2].Trim()
            # Flow array (single- or multi-line, now merged): [item1, item2]
            if ($value -match "^\[(.*)\]$") {
                $value = @(($Matches[1] -split ",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
            }
            # Bare quoted scalar
            elseif ($value -match "^['""](.+)['""]$") {
                $value = $Matches[1]
            }
            $frontmatter[$key] = $value
        }
    }

    $body = if ($bodyStart -lt $lines.Count) {
        ($lines[$bodyStart..($lines.Count - 1)] -join "`n").Trim()
    } else { "" }

    return @{
        Frontmatter = $frontmatter
        Body = $body
        FilePath = $filePath
    }
}

# Collect all fragment files
$allFragments = @()
if (Test-Path $fragmentsRoot) {
    $fragmentFiles = Get-ChildItem $fragmentsRoot -Recurse -Filter "*.md" |
        Where-Object { $_.Name -ne "README.md" }

    foreach ($file in $fragmentFiles) {
        $parsed = Parse-FragmentFrontmatter $file.FullName
        $relPath = $file.FullName.Replace($fragmentsRoot + [IO.Path]::DirectorySeparatorChar, "").Replace("\", "/")
        $parsed["RelPath"] = $relPath
        $parsed["FileName"] = $file.Name
        $parsed["User"] = ($relPath -split "/")[0]
        $parsed["Freshness"] = Get-FreshnessState $parsed.Frontmatter $repoRoot
        $allFragments += $parsed
    }
}

Write-Verbose "Found $($allFragments.Count) fragments"

# ─────────────────────────────────────────────
# Group fragments by target
# ─────────────────────────────────────────────

$targetGroups = @{}
$lessonFragments = [System.Collections.ArrayList]::new()
$decisionFragments = [System.Collections.ArrayList]::new()

foreach ($frag in $allFragments) {
    $fm = $frag.Frontmatter
    $type = $fm["type"]
    $target = $fm["target"]
    $action = if ($fm["action"]) { $fm["action"] } else {
        # Default actions by type
        switch ($type) {
            "lesson" { "append" }
            "decision" { "append" }
            "analysis" { "append" }
            default { "replace" }
        }
    }

    # Lessons and decisions go to special collections
    if ($type -eq "lesson") {
        [void]$lessonFragments.Add($frag)
        continue
    }
    if ($type -eq "decision") {
        [void]$decisionFragments.Add($frag)
        continue
    }

    # Everything else groups by target
    if ($target) {
        $key = "$type|$target"
        if (-not $targetGroups.ContainsKey($key)) {
            $targetGroups[$key] = @{
                Type = $type
                Target = $target
                Fragments = [System.Collections.ArrayList]::new()
            }
        }
        $entry = @{
            Fragment = $frag
            Action = $action
            Section = $fm["section"]
            Created = $fm["created"]
            Author = $fm["author"]
            Sources = $fm["sources"]
            Tags = $fm["tags"]
            Supersedes = $fm["supersedes"]
        }
        [void]$targetGroups[$key].Fragments.Add($entry)
    }
}

# ─────────────────────────────────────────────
# Build manifest
# ─────────────────────────────────────────────

$manifest = @{
    generated = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    totalFragments = $allFragments.Count
    targets = @{}
    lessons = @()
    decisions = @()
}

foreach ($key in $targetGroups.Keys) {
    $group = $targetGroups[$key]
    $target = $group.Target
    $fragments = $group.Fragments | Sort-Object { $_.Created } -Descending

    $authors = ($fragments | ForEach-Object { $_.Author } | Select-Object -Unique)
    $lastUpdated = ($fragments | Select-Object -First 1).Created

    # Detect conflicts: multiple replace fragments for same section on same day by different authors
    $hasConflicts = $false
    $sectionGroups = $fragments | Where-Object { $_.Action -eq "replace" } | Group-Object { $_.Section }
    foreach ($sg in $sectionGroups) {
        $sameDayAuthors = $sg.Group |
            Group-Object { ($_.Created -split "T")[0] } |
            Where-Object { ($_.Group | ForEach-Object { $_.Author } | Select-Object -Unique).Count -gt 1 }
        if ($sameDayAuthors) { $hasConflicts = $true; break }
    }

    $hasSynthesis = ($fragments | Where-Object { $_.Fragment.Frontmatter["type"] -eq "synthesis" }).Count -gt 0

    # Aggregate freshness: worst state across the target's fragments
    $worstState = "FRESH"; $worstRank = 0
    foreach ($fr in $fragments) {
        $st = $fr.Fragment.Freshness.State
        $rk = Get-StateRank $st
        if ($rk -gt $worstRank) { $worstRank = $rk; $worstState = $st }
    }
    $driftedCount = @($fragments | Where-Object { $_.Fragment.Freshness.State -eq "DRIFTED" }).Count
    $staleCount = @($fragments | Where-Object { $_.Fragment.Freshness.State -eq "STALE" }).Count

    $fragmentList = @($fragments | ForEach-Object {
        @{
            file = $_.Fragment.RelPath
            section = $_.Section
            action = $_.Action
            created = $_.Created
            author = $_.Author
        }
    })

    $manifest.targets[$target] = @{
        type = $group.Type
        fragmentCount = $fragmentList.Count
        lastUpdated = $lastUpdated
        authors = @($authors)
        hasConflicts = $hasConflicts
        hasSynthesis = $hasSynthesis
        freshness = @{ worst = $worstState; drifted = $driftedCount; stale = $staleCount }
        fragments = $fragmentList
    }
}

# Add lessons to manifest
$manifest.lessons = @($lessonFragments | ForEach-Object {
    @{
        file = $_.RelPath
        section = $_.Frontmatter["section"]
        created = $_.Frontmatter["created"]
        author = $_.Frontmatter["author"]
    }
})

# Add decisions to manifest
$manifest.decisions = @($decisionFragments | ForEach-Object {
    @{
        file = $_.RelPath
        section = $_.Frontmatter["section"]
        created = $_.Frontmatter["created"]
        author = $_.Frontmatter["author"]
    }
})

# Fragments needing re-verification (stale by age or drifted from code)
$needsVerification = @($allFragments |
    Where-Object { $_.Freshness.State -eq "STALE" -or $_.Freshness.State -eq "DRIFTED" } |
    Sort-Object { Get-StateRank $_.Freshness.State } -Descending |
    ForEach-Object {
        @{
            file    = $_.RelPath
            target  = $_.Frontmatter["target"]
            type    = $_.Frontmatter["type"]
            state   = $_.Freshness.State
            detail  = if ($_.Freshness.Drift) { "anchor drift ($($_.Freshness.Drift))" } else { "age > TTL ($([math]::Round($_.Freshness.AgeDays))d / $($_.Freshness.Ttl)d)" }
            refDate = $_.Freshness.RefDate
        }
    })
$manifest.needsVerification = $needsVerification

# Write manifest
$manifestPath = Join-Path $compiledRoot "_manifest.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8
Write-Verbose "Manifest written: $manifestPath"

# ─────────────────────────────────────────────
# Assemble compiled pages
# ─────────────────────────────────────────────

function Assemble-TargetPage($group) {
    $target = $group.Target
    $type = $group.Type
    $fragments = @($group.Fragments | Sort-Object { $_.Created } -Descending)
    $authors = ($fragments | ForEach-Object { $_.Author } | Select-Object -Unique) -join ", "
    $lastUpdated = ($fragments | Select-Object -First 1).Created
    $fragCount = $fragments.Count

    $worstState = "FRESH"; $worstRank = 0
    foreach ($fr in $fragments) {
        $rk = Get-StateRank $fr.Fragment.Freshness.State
        if ($rk -gt $worstRank) { $worstRank = $rk; $worstState = $fr.Fragment.Freshness.State }
    }

    $output = @()
    $output += "# $($target -replace '-', ' ' -replace '(^| )(\w)', { $_.Value.ToUpper() })"
    $output += ""
    $output += "> Compiled from $fragCount fragments by $authors | Last updated: $lastUpdated | Freshness: $(Get-StateBadge $worstState)"
    $output += ""

    # Group by section
    $sections = $fragments | Group-Object { if ($_.Section) { $_.Section } else { "_root" } }

    foreach ($section in ($sections | Sort-Object Name)) {
        $sectionName = $section.Name
        if ($sectionName -ne "_root") {
            $output += "## $($sectionName -replace '-', ' ' -replace '(^| )(\w)', { $_.Value.ToUpper() })"
            $output += ""
        }

        $sectionFrags = $section.Group | Sort-Object { $_.Created } -Descending

        # Find the effective fragment(s) based on action
        $replaceFrags = @($sectionFrags | Where-Object { $_.Action -eq "replace" })
        $appendFrags = @($sectionFrags | Where-Object { $_.Action -eq "append" })
        $correctFrags = @($sectionFrags | Where-Object { $_.Action -eq "correct" })

        # Show corrections first (prominent)
        foreach ($cf in $correctFrags) {
            $output += "> ⚠️ **Correction** ($($cf.Author), $($cf.Created)):"
            $output += "> $($cf.Fragment.Body -replace "`n", "`n> ")"
            $output += ""
        }

        # Show latest replace fragment as current truth
        if ($replaceFrags.Count -gt 0) {
            $latest = $replaceFrags | Select-Object -First 1
            $output += "<!-- latest: $($latest.Author) $($latest.Created) -->"
            $output += ""
            $output += $latest.Fragment.Body
            $output += ""

            # Show older replace fragments in history
            $older = @($replaceFrags | Select-Object -Skip 1)
            if ($older.Count -gt 0) {
                $output += "<details><summary>History ($($older.Count) prior version$(if($older.Count -gt 1){'s'}))</summary>"
                $output += ""
                foreach ($old in $older) {
                    $status = if ($old.Fragment.RelPath -in ($correctFrags | ForEach-Object { $_.Supersedes })) { "[corrected]" } else { "[superseded]" }
                    $output += "- **$($old.Created) ($($old.Author))** $status"
                    $output += "  $($old.Fragment.Body -split "`n" | Select-Object -First 2 | ForEach-Object { "  $_" })"
                    $output += ""
                }
                $output += "</details>"
                $output += ""
            }
        }

        # Show append fragments (all coexist)
        foreach ($af in $appendFrags) {
            $output += "### [$($af.Created) $($af.Author)]"
            $output += ""
            $output += $af.Fragment.Body
            $output += ""
        }
    }

    return ($output -join "`n")
}

# Create type subdirectories and assemble pages
$typeToFolder = @{
    "entity" = "entities"
    "concept" = "concepts"
    "source" = "sources"
    "analysis" = "analysis"
    "overview" = ""
    "synthesis" = "entities"  # synthesis fragments compile into their target type folder
}

foreach ($key in $targetGroups.Keys) {
    $group = $targetGroups[$key]
    $type = $group.Type
    $target = $group.Target
    $folder = $typeToFolder[$type]

    if ($type -eq "overview") {
        $outPath = Join-Path $compiledRoot "overview.md"
    } elseif ($type -eq "synthesis") {
        # Synthesis goes into the target's type folder
        # Look up what type the target actually is
        $actualTypeKey = $targetGroups.Keys | Where-Object { $_ -match "\|$target$" -and $_ -notmatch "^synthesis\|" } | Select-Object -First 1
        if ($actualTypeKey) {
            $actualType = ($actualTypeKey -split "\|")[0]
            $folder = $typeToFolder[$actualType]
        }
        $outDir = Join-Path $compiledRoot $folder
        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
        $outPath = Join-Path $outDir "$target.md"
    } else {
        $outDir = Join-Path $compiledRoot $folder
        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
        $outPath = Join-Path $outDir "$target.md"
    }

    $content = Assemble-TargetPage $group
    $content | Set-Content $outPath -Encoding UTF8
    Write-Verbose "Assembled: $outPath"
}

# ─────────────────────────────────────────────
# Assemble lessons.md
# ─────────────────────────────────────────────

$lessonsOutput = @()
$lessonsOutput += "# Lessons Learned"
$lessonsOutput += ""
$lessonsOutput += "> Compiled from $($lessonFragments.Count) lesson fragments. All lessons accumulate — none are overwritten."
$lessonsOutput += ""

$lessonsBySection = $lessonFragments | Group-Object { 
    $s = $_.Frontmatter["section"]
    if ($s) { $s } else { "general" }
}

foreach ($section in ($lessonsBySection | Sort-Object Name)) {
    $lessonsOutput += "## $($section.Name -replace '-', ' ' -replace '(^| )(\w)', { $_.Value.ToUpper() })"
    $lessonsOutput += ""

    $sorted = $section.Group | Sort-Object { $_.Frontmatter["created"] } -Descending
    foreach ($lesson in $sorted) {
        $fm = $lesson.Frontmatter
        $lessonsOutput += "- [$($fm["created"]) $($fm["author"])] $($lesson.Body -replace "`n", " " -replace "\s+", " ")"
    }
    $lessonsOutput += ""
}

$lessonsPath = Join-Path $compiledRoot "lessons.md"
$lessonsOutput -join "`n" | Set-Content $lessonsPath -Encoding UTF8

# ─────────────────────────────────────────────
# Assemble decisions.md
# ─────────────────────────────────────────────

$decisionsOutput = @()
$decisionsOutput += "# Decisions"
$decisionsOutput += ""
$decisionsOutput += "> Compiled from $($decisionFragments.Count) decision fragments. All decisions preserved chronologically."
$decisionsOutput += ""

$decisionsBySection = $decisionFragments | Group-Object {
    $s = $_.Frontmatter["section"]
    if ($s) { $s } else { "general" }
}

foreach ($section in ($decisionsBySection | Sort-Object Name)) {
    $decisionsOutput += "## $($section.Name -replace '-', ' ' -replace '(^| )(\w)', { $_.Value.ToUpper() })"
    $decisionsOutput += ""

    $sorted = $section.Group | Sort-Object { $_.Frontmatter["created"] } -Descending
    foreach ($dec in $sorted) {
        $fm = $dec.Frontmatter
        $decisionsOutput += "### [$($fm["created"]) $($fm["author"])]"
        $decisionsOutput += ""
        $decisionsOutput += $dec.Body
        $decisionsOutput += ""
    }
}

$decisionsPath = Join-Path $compiledRoot "decisions.md"
$decisionsOutput -join "`n" | Set-Content $decisionsPath -Encoding UTF8

# ─────────────────────────────────────────────
# Assemble index.md
# ─────────────────────────────────────────────

$indexOutput = @()
$indexOutput += "# Wiki Index"
$indexOutput += ""
$indexOutput += "> Compiled from fragments by ``scripts/compile-wiki.ps1``"
$indexOutput += "> Regenerate: ``pwsh scripts/compile-wiki.ps1``"
$indexOutput += ""
$indexOutput += "## Stats"
$indexOutput += ""
$indexOutput += "| Metric | Count |"
$indexOutput += "| ------ | ----- |"
$indexOutput += "| Total fragments | $($allFragments.Count) |"
$indexOutput += "| Targets (entities/concepts/etc.) | $($targetGroups.Count) |"
$indexOutput += "| Lessons | $($lessonFragments.Count) |"
$indexOutput += "| Decisions | $($decisionFragments.Count) |"
$indexOutput += "| Contributors | $(($allFragments | ForEach-Object { $_.User } | Select-Object -Unique).Count) |"
$indexOutput += ""

# List targets by type
$typeOrder = @("entity", "concept", "source", "analysis", "overview", "synthesis")
foreach ($type in $typeOrder) {
    $typeTargets = $targetGroups.GetEnumerator() | Where-Object { $_.Value.Type -eq $type }
    if ($typeTargets) {
        $indexOutput += "## $(($type.Substring(0,1).ToUpper() + $type.Substring(1)) + 's')"
        $indexOutput += ""
        $indexOutput += "| Target | Fragments | Authors | Last Updated | Freshness | Conflicts |"
        $indexOutput += "| ------ | --------- | ------- | ------------ | --------- | --------- |"
        foreach ($entry in ($typeTargets | Sort-Object { $_.Value.Target })) {
            $g = $entry.Value
            $conflictMark = if ($g.hasConflicts) { "⚠️" } else { "—" }
            $gAuthors = ($g.Fragments | ForEach-Object { $_.Author } | Select-Object -Unique) -join ", "
            $gLastUpdated = ($g.Fragments | Sort-Object { $_.Created } -Descending | Select-Object -First 1).Created
            $gFragCount = $g.Fragments.Count
            $gWorst = "FRESH"; $gWorstRank = 0
            foreach ($fr in $g.Fragments) {
                $rk = Get-StateRank $fr.Fragment.Freshness.State
                if ($rk -gt $gWorstRank) { $gWorstRank = $rk; $gWorst = $fr.Fragment.Freshness.State }
            }
            $indexOutput += "| $($g.Target) | $gFragCount | $gAuthors | $gLastUpdated | $(Get-StateBadge $gWorst) | $conflictMark |"
        }
        $indexOutput += ""
    }
}

# Recent fragments (last 10)
$recentFragments = $allFragments |
    Sort-Object { $_.Frontmatter["created"] } -Descending |
    Select-Object -First 10

if ($recentFragments) {
    $indexOutput += "## Recent Activity"
    $indexOutput += ""
    $indexOutput += "| Fragment | Author | Target | Created |"
    $indexOutput += "| -------- | ------ | ------ | ------- |"
    foreach ($rf in $recentFragments) {
        $fm = $rf.Frontmatter
        $indexOutput += "| $($rf.FileName) | $($fm["author"]) | $($fm["target"]) | $($fm["created"]) |"
    }
    $indexOutput += ""
}

# Needs Verification (stale or drifted fragments)
if ($needsVerification.Count -gt 0) {
    $indexOutput += "## Needs Verification"
    $indexOutput += ""
    $indexOutput += "> Fragments whose knowledge has aged past its TTL or whose code anchors no longer match the source. Re-verify against code, then write an ``action: correct`` fragment to refresh."
    $indexOutput += ""
    $indexOutput += "| Fragment | Target | State | Detail |"
    $indexOutput += "| -------- | ------ | ----- | ------ |"
    foreach ($nv in $needsVerification) {
        $indexOutput += "| $($nv.file) | $($nv.target) | $(Get-StateBadge $nv.state) | $($nv.detail) |"
    }
    $indexOutput += ""
}

$indexPath = Join-Path $compiledRoot "index.md"
$indexOutput -join "`n" | Set-Content $indexPath -Encoding UTF8

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

$compiledFiles = (Get-ChildItem $compiledRoot -Recurse -File).Count
Write-Host "✅ Wiki compiled: $($allFragments.Count) fragments → $compiledFiles output files in wiki/.compiled/"
Write-Host "   Targets: $($targetGroups.Count) | Lessons: $($lessonFragments.Count) | Decisions: $($decisionFragments.Count)"
if ($targetGroups.Values | Where-Object { $_.hasConflicts }) {
    $conflictTargets = ($targetGroups.Values | Where-Object { $_.hasConflicts } | ForEach-Object { $_.Target }) -join ", "
    Write-Host "   ⚠️  Conflicts detected in: $conflictTargets" -ForegroundColor Yellow
}
if ($needsVerification.Count -gt 0) {
    $driftedTotal = @($needsVerification | Where-Object { $_.state -eq "DRIFTED" }).Count
    $staleTotal = @($needsVerification | Where-Object { $_.state -eq "STALE" }).Count
    Write-Host "   🔎 Needs verification: $($needsVerification.Count) ($driftedTotal drifted, $staleTotal stale) — see index.md" -ForegroundColor Yellow
}
