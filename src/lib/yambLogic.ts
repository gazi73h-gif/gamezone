export type ColumnKey = 'down' | 'up' | 'free' | 'call';

export type RowKey =

  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'max' | 'min'
  | 'tris' | 'straight' | 'full' | 'poker' | 'yamb';

export type PlayerSheet = Record<ColumnKey, Partial<Record<RowKey, number>>>;

export interface YambGameState {
  currentTurnPlayerId: string;
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  calledRow: RowKey | null;
  sheets: Record<string, PlayerSheet>;
  winnerId?: string | null;
}

export const ROWS_ORDER: RowKey[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'max', 'min',
  'tris', 'straight', 'full', 'poker', 'yamb'
];

export const ROW_LABELS: Record<RowKey, string> = {
  ones: '1 (Njëshat)',
  twos: '2 (Dyshat)',
  threes: '3 (Treshat)',
  fours: '4 (Katrat)',
  fives: '5 (Pesat)',
  sixes: '6 (Gjashtat)',
  max: 'Max (Maksimumi)',
  min: 'Min (Minimumi)',
  tris: 'Tris (+20)',
  straight: 'Skala (35/45)',
  full: 'Full House (+30)',
  poker: 'Poker (+40)',
  yamb: 'YAMB (+50)'
};

export function createEmptySheet(): PlayerSheet {
  return { down: {}, up: {}, free: {}, call: {} };
}
export function calculateScore(row: RowKey, dice: number[], rollsLeft: number): number {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  dice.forEach((d) => { if (d >= 1 && d <= 6) counts[d]++; });
  const sorted = [...dice].sort((a, b) => a - b);

  switch (row) {
    case 'ones': return Math.min(counts[1], 5) * 1;
    case 'twos': return Math.min(counts[2], 5) * 2;
    case 'threes': return Math.min(counts[3], 5) * 3;
    case 'fours': return Math.min(counts[4], 5) * 4;
    case 'fives': return Math.min(counts[5], 5) * 5;
    case 'sixes': return Math.min(counts[6], 5) * 6;
    case 'max': return sorted.slice(1, 6).reduce((a, b) => a + b, 0);
    case 'min': return sorted.slice(0, 5).reduce((a, b) => a + b, 0);
    case 'tris': {
      for (let v = 6; v >= 1; v--) {
        if (counts[v] >= 3) return v * 3 + 20;
      }
      return 0;
    }
        case 'straight': {
      const unique = Array.from(new Set(sorted));
      const small = new Array(1, 2, 3, 4, 5);
      const large = new Array(2, 3, 4, 5, 6);
      const isSmall = small.every((n) => unique.includes(n));
      const isLarge = large.every((n) => unique.includes(n));
      if (!isSmall && !isLarge) return 0;
      if (rollsLeft === 2) return 66;
      if (rollsLeft === 1) return 56;
      return 46;
    }
    case 'full': {
      let threeVal = 0;
      let pairVal = 0;
      for (let v = 6; v >= 1; v--) {
        if (counts[v] >= 3 && threeVal === 0) threeVal = v;
        else if (counts[v] >= 2 && pairVal === 0) pairVal = v;
      }
      return threeVal > 0 && pairVal > 0 ? threeVal * 3 + pairVal * 2 + 30 : 0;
    }
    case 'poker': {
      for (let v = 6; v >= 1; v--) {
        if (counts[v] >= 4) return v * 4 + 40;
      }
      return 0;
    }
    case 'yamb': {
      for (let v = 6; v >= 1; v--) {
        if (counts[v] >= 5) return v * 5 + 50;
      }
      return 0;
    }
  }
}

export function canSelectCell(
  sheet: PlayerSheet,
  col: ColumnKey,
  row: RowKey,
  rollsLeft: number,
  calledRow: RowKey | null
): boolean {
  if (rollsLeft === 3) return false;
  if (sheet[col][row] !== undefined) return false;

  if (col === 'call') {
    if (calledRow !== null) return calledRow === row;
    return rollsLeft === 2;
  }

  if (calledRow !== null) return false;

  if (col === 'free') return true;

  const idx = ROWS_ORDER.indexOf(row);
  if (col === 'down') {
    if (idx === 0) return true;
    return sheet.down[ROWS_ORDER[idx - 1]] !== undefined;
  }
  if (col === 'up') {
    if (idx === ROWS_ORDER.length - 1) return true;
    return sheet.up[ROWS_ORDER[idx + 1]] !== undefined;
  }
  return false;
}

export function getColumnTotals(colData: Partial<Record<RowKey, number>>) {
  const upperKeys: RowKey[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  let upperSum = upperKeys.reduce((acc, k) => acc + (colData[k] || 0), 0);
  if (upperSum >= 60) upperSum += 30;

  let midSum = 0;
  if (colData.max !== undefined && colData.min !== undefined && colData.ones !== undefined) {
    midSum = Math.max(0, (colData.max - colData.min) * colData.ones);
  }

  const lowerKeys: RowKey[] = ['tris', 'straight', 'full', 'poker', 'yamb'];
  const lowerSum = lowerKeys.reduce((acc, k) => acc + (colData[k] || 0), 0);

  return { upperSum, midSum, lowerSum, total: upperSum + midSum + lowerSum };
}

export function getGrandTotal(sheet: PlayerSheet): number {
  const cols: ColumnKey[] = ['down', 'up', 'free', 'call'];
  return cols.reduce((sum, c) => sum + getColumnTotals(sheet[c]).total, 0);
}
