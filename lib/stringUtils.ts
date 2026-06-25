export function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, (_, j) => j)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function findCloseMatch(input: string, list: string[]): string | null {
  const normInput = normalizeStr(input);
  if (!normInput) return null;
  for (const item of list) {
    if (normalizeStr(item) === normInput) return item;
  }
  let bestMatch: string | null = null;
  let minDistance = 999;
  for (const item of list) {
    const normItem = normalizeStr(item);
    const dist = getLevenshteinDistance(normInput, normItem);
    const threshold = Math.max(1, Math.min(2, Math.floor(normItem.length * 0.3)));
    if (dist <= threshold && dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  }
  return bestMatch;
}
