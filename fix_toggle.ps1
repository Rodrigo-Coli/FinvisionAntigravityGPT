$f = "c:\Users\rodrigo.coli\Documents\Antigravity\FinVision-GPT-main\FinVision-GPT-main\pages\Settings.tsx"
$c = [System.IO.File]::ReadAllText($f)
$c = $c -replace "`r`n", "`n"

$old = 'onClick={() => { setShowArchived(!showArchived); fetchData(); }}'
$new = 'onClick={() => setShowArchived(prev => !prev)}'

if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    $c = $c -replace "`n", "`r`n"
    [System.IO.File]::WriteAllText($f, $c)
    Write-Host "SUCCESS: Fixed toggle button"
}
else {
    Write-Host "WARN: Old toggle code not found"
}
