$f = "c:\Users\rodrigo.coli\Documents\Antigravity\FinVision-GPT-main\FinVision-GPT-main\components\history\TransactionTable.tsx"
$c = [System.IO.File]::ReadAllText($f)

$old = @'
                                    <td className="px-6 py-4 text-right">
                                        <span className={`text-sm font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                            {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                        </span>
                                    </td>
'@

$new = @'
                                    <td className="px-6 py-4 text-right">
                                        {editingRow?.id === t.id && editingRow.field === 'amount' ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-sm font-bold text-slate-400">{t.type === 'EXPENSE' ? '-' : ''}</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    autoFocus
                                                    className="w-28 h-8 px-2 text-sm font-bold text-right bg-white border border-brand-500 rounded outline-none"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'amount', parseFloat(editValue))}
                                                    onBlur={() => handleUpdate(t.id, 'amount', parseFloat(editValue))}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingRow({ id: t.id, field: 'amount' }); setEditValue(Math.abs(t.amount).toString()); }}
                                                className={`text-sm font-bold hover:text-brand-600 transition-colors bg-transparent border-none p-0 cursor-pointer ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}
                                            >
                                                {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                            </button>
                                        )}
                                    </td>
'@

if ($c.Contains('<td className="px-6 py-4 text-right">')) {
    # Normalize line endings for matching
    $cNorm = $c -replace "`r`n", "`n"
    $oldNorm = $old -replace "`r`n", "`n"
    $newNorm = $new -replace "`r`n", "`n"
    
    if ($cNorm.Contains($oldNorm)) {
        $result = $cNorm.Replace($oldNorm, $newNorm)
        # Restore original line endings
        $result = $result -replace "`n", "`r`n"
        [System.IO.File]::WriteAllText($f, $result)
        Write-Host "SUCCESS: Amount column made editable"
    } else {
        Write-Host "WARN: Exact block not found after normalization. Searching..."
        # Try line by line
        $lines = $cNorm.Split("`n")
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -eq '<td className="px-6 py-4 text-right">') {
                Write-Host "Found td at line $($i+1): $($lines[$i].Trim())"
                if ($lines[$i+1].Trim().StartsWith('<span className=')) {
                    Write-Host "Found span at line $($i+2): $($lines[$i+1].Trim())"
                }
            }
        }
    }
} else {
    Write-Host "ERROR: td element not found in file"
}
