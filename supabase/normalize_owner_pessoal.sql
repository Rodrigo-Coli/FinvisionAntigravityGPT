-- Normaliza a coluna owner_name para que "Pessoal" seja o único valor padrão.
-- Converte NULL, strings vazias e variações de capitalização ("pessoal", "PESSOAL", " Pessoal", etc.)
-- para o valor canônico 'Pessoal'.

UPDATE transactions
SET owner_name = 'Pessoal'
WHERE
    owner_name IS NULL
    OR TRIM(owner_name) = ''
    OR LOWER(TRIM(owner_name)) = 'pessoal';

-- Confirma os resultados
SELECT owner_name, COUNT(*) AS total
FROM transactions
GROUP BY owner_name
ORDER BY total DESC;
