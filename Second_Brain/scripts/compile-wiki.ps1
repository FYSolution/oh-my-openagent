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
        if ($inFrontmatter -and -not $frontmatterDone) {
            if ($line -match "^(\w[\w-]*):\s*(.+)$") {
                $key = $Matches[1]
                $value = $Matches[2].Trim()
                # Handle YAML arrays: [item1, item2]
                if ($value -match "^\[(.+)\]$") {
                    $value = ($Matches[1] -split ",") | ForEach-Object { $_.Trim() }
                }
                # Handle bare values (strip quotes)
                elseif ($value -match "^['""](.+)['""]$") {
                    $value = $Matches[1]
                }
                $frontmatter[$key] = $value
            }
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

    $output = @()
    $output += "# $($target -replace '-', ' ' -replace '(^| )(\w)', { $_.Value.ToUpper() })"
    $output += ""
    $output += "> Compiled from $fragCount fragments by $authors | Last updated: $lastUpdated"
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
        $indexOutput += "| Target | Fragments | Authors | Last Updated | Conflicts |"
        $indexOutput += "| ------ | --------- | ------- | ------------ | --------- |"
        foreach ($entry in ($typeTargets | Sort-Object { $_.Value.Target })) {
            $g = $entry.Value
            $conflictMark = if ($g.hasConflicts) { "⚠️" } else { "—" }
            $gAuthors = ($g.Fragments | ForEach-Object { $_.Author } | Select-Object -Unique) -join ", "
            $gLastUpdated = ($g.Fragments | Sort-Object { $_.Created } -Descending | Select-Object -First 1).Created
            $gFragCount = $g.Fragments.Count
            $indexOutput += "| $($g.Target) | $gFragCount | $gAuthors | $gLastUpdated | $conflictMark |"
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
