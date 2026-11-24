// Motori i shahut për botin: minimax (negamax) me alpha-beta, kërkim i qetë (shkëmbimet deri në fund),
// renditje e lëvizjeve (MVV-LVA), thellim gradual me kufi kohe dhe tabela pozicionesh për çdo figurë.
// Punon me tabelën e lojës (rreshti 0 = të zezat lart, të bardhat lëvizin drejt rreshtit 0).
import type { Board, ChessGameState, PieceType } from './chessLogic';

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const TYPE_CODE: Record<PieceType, number> = { p: P, n: N, b: B, r: R, q: Q, k: K };
const VALUE = [0, 100, 320, 330, 500, 900, 20000];
const MATE = 100000;

// Tabelat e pozicioneve (nga ana e të bardhave, rreshti 0 = rreshti i 8-të)
const PST: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
// mbreti në fund të lojës: drejt qendrës
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export interface Move { from: number; to: number; piece: number; captured: number; promo: number; ep: boolean; castle: boolean }

export class Position {
  sq = new Int8Array(64);
  side = 1; // 1 = të bardhat, -1 = të zezat
  castle = 0; // 1 = W kral, 2 = W mbretëreshë, 4 = B kral, 8 = B mbretëreshë
  ep = -1;
  private undo: { castle: number; ep: number }[] = [];

  static fromGame(state: Pick<ChessGameState, 'board' | 'turn' | 'lastMove'>): Position {
    const pos = new Position();
    const b: Board = state.board;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p) pos.sq[r * 8 + c] = TYPE_CODE[p.type] * (p.color === 'w' ? 1 : -1);
    }
    pos.side = state.turn === 'w' ? 1 : -1;
    const fresh = (r: number, c: number, t: PieceType, w: boolean) => { const p = b[r][c]; return !!p && p.type === t && (p.color === 'w') === w && !p.moved; };
    if (fresh(7, 4, 'k', true)) { if (fresh(7, 7, 'r', true)) pos.castle |= 1; if (fresh(7, 0, 'r', true)) pos.castle |= 2; }
    if (fresh(0, 4, 'k', false)) { if (fresh(0, 7, 'r', false)) pos.castle |= 4; if (fresh(0, 0, 'r', false)) pos.castle |= 8; }
    const lm = state.lastMove;
    if (lm) {
      const moved = b[lm.to[0]][lm.to[1]];
      if (moved?.type === 'p' && Math.abs(lm.to[0] - lm.from[0]) === 2) pos.ep = ((lm.to[0] + lm.from[0]) / 2) * 8 + lm.to[1];
    }
    return pos;
  }

  // vetëm për teste (FEN standard)
  static fromFEN(fen: string): Position {
    const pos = new Position();
    const [placement, side, castling, ep] = fen.split(' ');
    const codes: Record<string, number> = { p: P, n: N, b: B, r: R, q: Q, k: K };
    placement.split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { c += Number(ch); continue; }
        pos.sq[r * 8 + c++] = codes[ch.toLowerCase()] * (ch === ch.toUpperCase() ? 1 : -1);
      }
    });
    pos.side = side === 'w' ? 1 : -1;
    pos.castle = (castling.includes('K') ? 1 : 0) | (castling.includes('Q') ? 2 : 0) | (castling.includes('k') ? 4 : 0) | (castling.includes('q') ? 8 : 0);
    pos.ep = ep && ep !== '-' ? (8 - Number(ep[1])) * 8 + (ep.charCodeAt(0) - 97) : -1;
    return pos;
  }

  attacked(s: number, by: number): boolean {
    const r = s >> 3, c = s & 7;
    // ushtari i bardhë sulmon lart, prandaj qëndron një rresht më poshtë
    for (const dc of [-1, 1]) {
      const rr = r + (by === 1 ? 1 : -1), cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && this.sq[rr * 8 + cc] === P * by) return true;
    }
    for (const [dr, dc] of KNIGHT) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && this.sq[rr * 8 + cc] === N * by) return true;
    }
    for (const [dr, dc] of KING_DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && this.sq[rr * 8 + cc] === K * by) return true;
    }
    for (const [dirs, a, b] of [[ROOK_DIRS, R, Q], [BISHOP_DIRS, B, Q]] as const) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const p = this.sq[rr * 8 + cc];
          if (p) { if (p === a * by || p === b * by) return true; break; }
          rr += dr; cc += dc;
        }
      }
    }
    return false;
  }

  kingSquare(side: number): number {
    for (let i = 0; i < 64; i++) if (this.sq[i] === K * side) return i;
    return -1;
  }

  inCheck(side = this.side): boolean {
    const k = this.kingSquare(side);
    return k >= 0 && this.attacked(k, -side);
  }

  pseudoMoves(capturesOnly = false): Move[] {
    const out: Move[] = [];
    const s = this.side;
    const push = (from: number, to: number, extra: Partial<Move> = {}) => {
      const piece = this.sq[from];
      out.push({ from, to, piece, captured: this.sq[to], promo: 0, ep: false, castle: false, ...extra });
    };
    for (let from = 0; from < 64; from++) {
      const p = this.sq[from];
      if (!p || Math.sign(p) !== s) continue;
      const t = Math.abs(p), r = from >> 3, c = from & 7;
      if (t === P) {
        const dir = s === 1 ? -1 : 1, start = s === 1 ? 6 : 1, last = s === 1 ? 0 : 7;
        const one = (r + dir) * 8 + c;
        if (!capturesOnly && r + dir >= 0 && r + dir < 8 && !this.sq[one]) {
          push(from, one, { promo: r + dir === last ? Q * s : 0 });
          const two = (r + 2 * dir) * 8 + c;
          if (r === start && !this.sq[two]) push(from, two);
        }
        for (const dc of [-1, 1]) {
          const rr = r + dir, cc = c + dc;
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc;
          if (this.sq[to] && Math.sign(this.sq[to]) === -s) push(from, to, { promo: rr === last ? Q * s : 0 });
          else if (to === this.ep) push(from, to, { ep: true, captured: -s * P });
        }
      } else if (t === N || t === K) {
        for (const [dr, dc] of t === N ? KNIGHT : KING_DIRS) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc, q = this.sq[to];
          if (q ? Math.sign(q) === -s : !capturesOnly) push(from, to);
        }
        if (t === K && !capturesOnly) this.castleMoves(from, push);
      } else {
        const dirs = t === R ? ROOK_DIRS : t === B ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const to = rr * 8 + cc, q = this.sq[to];
            if (q) { if (Math.sign(q) === -s) push(from, to); break; }
            if (!capturesOnly) push(from, to);
            rr += dr; cc += dc;
          }
        }
      }
    }
    return out;
  }

  private castleMoves(from: number, push: (f: number, t: number, e?: Partial<Move>) => void) {
    const s = this.side, row = s === 1 ? 56 : 0;
    if (from !== row + 4 || this.attacked(from, -s)) return;
    const [kRight, qRight] = s === 1 ? [1, 2] : [4, 8];
    if (this.castle & kRight && !this.sq[row + 5] && !this.sq[row + 6] && this.sq[row + 7] === R * s &&
      !this.attacked(row + 5, -s) && !this.attacked(row + 6, -s)) push(from, row + 6, { castle: true });
    if (this.castle & qRight && !this.sq[row + 3] && !this.sq[row + 2] && !this.sq[row + 1] && this.sq[row] === R * s &&
      !this.attacked(row + 3, -s) && !this.attacked(row + 2, -s)) push(from, row + 2, { castle: true });
  }

  make(m: Move) {
    this.undo.push({ castle: this.castle, ep: this.ep });
    const s = this.side;
    this.sq[m.to] = m.promo || m.piece;
    this.sq[m.from] = 0;
    if (m.ep) this.sq[m.to + (s === 1 ? 8 : -8)] = 0;
    if (m.castle) {
      const row = m.to & 56;
      if ((m.to & 7) === 6) { this.sq[row + 5] = this.sq[row + 7]; this.sq[row + 7] = 0; }
      else { this.sq[row + 3] = this.sq[row]; this.sq[row] = 0; }
    }
    this.ep = Math.abs(m.piece) === P && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : -1;
    for (const [square, mask] of [[60, 3], [63, 1], [56, 2], [4, 12], [7, 4], [0, 8]] as const) {
      if (m.from === square || m.to === square) this.castle &= ~mask;
    }
    this.side = -s;
  }

  unmake(m: Move) {
    const u = this.undo.pop()!;
    this.side = -this.side;
    const s = this.side;
    this.castle = u.castle;
    this.ep = u.ep;
    this.sq[m.from] = m.piece;
    if (m.ep) { this.sq[m.to] = 0; this.sq[m.to + (s === 1 ? 8 : -8)] = m.captured; }
    else this.sq[m.to] = m.captured;
    if (m.castle) {
      const row = m.to & 56;
      if ((m.to & 7) === 6) { this.sq[row + 7] = this.sq[row + 5]; this.sq[row + 5] = 0; }
      else { this.sq[row] = this.sq[row + 3]; this.sq[row + 3] = 0; }
    }
  }

  legalMoves(capturesOnly = false): Move[] {
    const out: Move[] = [];
    for (const m of this.pseudoMoves(capturesOnly)) {
      this.make(m);
      if (!this.inCheck(-this.side)) out.push(m);
      this.unmake(m);
    }
    return out;
  }

  evaluate(): number {
    let score = 0, material = 0;
    for (let i = 0; i < 64; i++) { const t = Math.abs(this.sq[i]); if (t && t !== K && t !== P) material += VALUE[t]; }
    const endgame = material <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = this.sq[i];
      if (!p) continue;
      const t = Math.abs(p), white = p > 0;
      const idx = white ? i : (7 - (i >> 3)) * 8 + (i & 7);
      const table = t === K && endgame ? KING_END : PST[t];
      score += (VALUE[t] + table[idx]) * (white ? 1 : -1);
    }
    return score * this.side;
  }
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pos.legalMoves()) { pos.make(m); n += perft(pos, depth - 1); pos.unmake(m); }
  return n;
}

const orderScore = (m: Move) => (m.captured ? 10 * VALUE[Math.abs(m.captured)] - VALUE[Math.abs(m.piece)] : 0) + (m.promo ? 800 : 0);

class TimeUp extends Error {}

export interface SearchResult { from: [number, number]; to: [number, number]; score: number; depth: number; nodes: number }

/**
 * Lëvizja më e mirë. maxDepth/timeMs sipas vështirësisë; thellimi gradual përdor rezultatin e plotë më të thellë.
 */
export function searchBestMove(pos: Position, maxDepth: number, timeMs: number, noise = 0): SearchResult | null {
  const deadline = Date.now() + timeMs;
  let nodes = 0;
  const quiesce = (alpha: number, beta: number, qdepth: number): number => {
    if ((++nodes & 2047) === 0 && Date.now() > deadline) throw new TimeUp();
    const stand = pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qdepth <= 0) return alpha;
    const caps = pos.pseudoMoves(true).sort((a, b) => orderScore(b) - orderScore(a));
    for (const m of caps) {
      pos.make(m);
      if (pos.inCheck(-pos.side)) { pos.unmake(m); continue; }
      const sc = -quiesce(-beta, -alpha, qdepth - 1);
      pos.unmake(m);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };
  const negamax = (depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 2047) === 0 && Date.now() > deadline) throw new TimeUp();
    if (depth === 0) return quiesce(alpha, beta, 6);
    const moves = pos.pseudoMoves().sort((a, b) => orderScore(b) - orderScore(a));
    let legal = 0;
    for (const m of moves) {
      pos.make(m);
      if (pos.inCheck(-pos.side)) { pos.unmake(m); continue; }
      legal++;
      const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
      pos.unmake(m);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    if (!legal) return pos.inCheck() ? -MATE + ply : 0;
    return alpha;
  };

  let root = pos.legalMoves().sort((a, b) => orderScore(b) - orderScore(a));
  if (!root.length) return null;
  let best: { m: Move; score: number; depth: number } = { m: root[0], score: 0, depth: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const scored: { m: Move; score: number }[] = [];
      let alpha = -Infinity;
      for (const m of root) {
        pos.make(m);
        const sc = -negamax(depth - 1, -Infinity, noise ? Infinity : -alpha, 1);
        pos.unmake(m);
        scored.push({ m, score: sc });
        if (sc > alpha) alpha = sc;
      }
      scored.sort((a, b) => b.score - a.score);
      root = scored.map((x) => x.m); // lëvizja më e mirë kërkohet e para në thellësinë tjetër
      let pick = scored[0];
      if (noise > 0) {
        const near = scored.filter((x) => x.score >= scored[0].score - noise);
        pick = near[Math.floor(Math.random() * near.length)];
      }
      best = { m: pick.m, score: pick.score, depth };
      if (Math.abs(pick.score) > MATE - 100) break; // mat i gjetur
    } catch (e) {
      if (e instanceof TimeUp) break;
      throw e;
    }
  }
  const sq = (i: number): [number, number] => [i >> 3, i & 7];
  return { from: sq(best.m.from), to: sq(best.m.to), score: best.score, depth: best.depth, nodes };
}

export const DIFFICULTY = {
  easy: { depth: 1, time: 300, noise: 120 },
  medium: { depth: 3, time: 900, noise: 15 },
  hard: { depth: 6, time: 2000, noise: 0 },
} as const;

export function computeStrongMove(state: Pick<ChessGameState, 'board' | 'turn' | 'lastMove' | 'aiDifficulty'>) {
  const d = DIFFICULTY[state.aiDifficulty ?? 'hard'];
  return searchBestMove(Position.fromGame(state), d.depth, d.time, d.noise);
}
