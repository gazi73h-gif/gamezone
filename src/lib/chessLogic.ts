
function cloneBoard(b: Board): Board { return b.map((r) => r.map((c) => (c ? { ...c } : null))); }
function inBounds(r: number, c: number) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getPseudoMoves(b: Board, r: number, c: number): [number, number][] {
  const p = b[r]?.[c];
  if (!p) return [];
  const moves: [number, number][] = [];
  const add = (nr: number, nc: number) => {
    if (!inBounds(nr, nc)) return false;
    const t = b[nr][nc];
    if (!t) { moves.push(Array.of(nr, nc) as [number, number]); return true; }
    if (t.color !== p.color) moves.push(Array.of(nr, nc) as [number, number]);
    return false;
  };
  if (p.type === 'p') {
    const dir = p.color === 'w' ? -1 : 1;
    const start = p.color === 'w' ? 6 : 1;
    if (inBounds(r + dir, c) && !b[r + dir][c]) {
      moves.push(Array.of(r + dir, c) as [number, number]);
      if (r === start && !b[r + 2 * dir][c]) moves.push(Array.of(r + 2 * dir, c) as [number, number]);
    }
    for (const dc of Array.of(-1, 1)) {
      if (inBounds(r + dir, c + dc) && b[r + dir][c + dc]?.color && b[r + dir][c + dc]?.color !== p.color) {
        moves.push(Array.of(r + dir, c + dc) as [number, number]);
      }
    }
  } else if (p.type === 'n') {
    for (const [dr, dc] of Array.of([-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1])) add(r + dr, c + dc);
  } else if (p.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(r + dr, c + dc);
    if (!p.moved) {
      if (b[r]?.[7]?.type === 'r' && !b[r][7]?.moved && !b[r][5] && !b[r][6]) moves.push(Array.of(r, 6) as [number, number]);
      if (b[r]?.[0]?.type === 'r' && !b[r][0]?.moved && !b[r][1] && !b[r][2] && !b[r][3]) moves.push(Array.of(r, 2) as [number, number]);
    }
  } else {
    const dirs = p.type === 'r' ? Array.of([-1,0],[1,0],[0,-1],[0,1]) : p.type === 'b' ? Array.of([-1,-1],[-1,1],[1,-1],[1,1]) : Array.of([-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]);
    for (const [dr, dc] of dirs) { let nr = r + dr, nc = c + dc; while (add(nr, nc)) { nr += dr; nc += dc; } }
  }
  return moves;
}

export function isKingInCheck(b: Board, color: PieceColor): boolean {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c]?.type === 'k' && b[r][c]?.color === color) { kr = r; kc = c; }
  const opp: PieceColor = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (b[r][c]?.color === opp && getPseudoMoves(b, r, c).some(([mr, mc]) => mr === kr && mc === kc)) return true;
  }
  return false;
}

export function getLegalMoves(b: Board, r: number, c: number): [number, number][] {
  const p = b[r]?.[c];
  if (!p) return [];
  return getPseudoMoves(b, r, c).filter(([nr, nc]) => {
    const next = cloneBoard(b);
    next[nr][nc] = { ...p, moved: true };
    next[r][c] = null;
    if (p.type === 'k' && Math.abs(nc - c) === 2) {
      if (isKingInCheck(b, p.color)) return false;
      const midCol = nc === 6 ? 5 : 3;
      const midB = cloneBoard(b);
      midB[r][midCol] = { ...p };
      midB[r][c] = null;
      if (isKingInCheck(midB, p.color)) return false;
    }
    return !isKingInCheck(next, p.color);
  });
}

function hasAnyLegalMove(b: Board, color: PieceColor): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (b[r][c]?.color === color && getLegalMoves(b, r, c).length > 0) return true;
  }
  return false;
}

export function makeChessMove(state: ChessGameState, playerId: string, from: [number, number], to: [number, number]): ChessGameState {
  if (state.status !== 'playing') return state;
  const activeId = state.turn === 'w' ? state.whiteId : state.blackId;
  if (playerId !== activeId) return state;
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = state.board[fr]?.[fc];
  if (!piece || piece.color !== state.turn) return state;
  if (!getLegalMoves(state.board, fr, fc).some(([mr, mc]) => mr === tr && mc === tc)) return state;

  const nextBoard = cloneBoard(state.board);
  const captured = nextBoard[tr][tc];
  const movedPiece: ChessPiece = { ...piece, moved: true };
  if (movedPiece.type === 'p' && (tr === 0 || tr === 7)) movedPiece.type = 'q';
  nextBoard[tr][tc] = movedPiece;
  nextBoard[fr][fc] = null;

  if (piece.type === 'k' && Math.abs(tc - fc) === 2) {
    const rookFrom = tc === 6 ? 7 : 0;
    const rookTo = tc === 6 ? 5 : 3;
    if (nextBoard[fr][rookFrom]) {
      nextBoard[fr][rookTo] = { ...nextBoard[fr][rookFrom]!, moved: true };
      nextBoard[fr][rookFrom] = null;
    }
  }

  const capW = state.turn === 'w' && captured ? state.capturedByWhite.concat(captured) : state.capturedByWhite;
  const capB = state.turn === 'b' && captured ? state.capturedByBlack.concat(captured) : state.capturedByBlack;
  const nextTurn: PieceColor = state.turn === 'w' ? 'b' : 'w';
  const check = isKingInCheck(nextBoard, nextTurn);
  const anyMove = hasAnyLegalMove(nextBoard, nextTurn);
  const moverName = state.turn === 'w' ? state.whiteName : state.blackName;
  const nextName = nextTurn === 'w' ? state.whiteName : state.blackName;

  if (!anyMove) {
    if (check) {
      return { ...state, board: nextBoard, turn: nextTurn, status: 'finished', winnerId: activeId, winnerName: moverName, inCheck: nextTurn, lastMove: { from, to }, capturedByWhite: capW, capturedByBlack: capB, lastActionText: `👑 SHAH-MAT! Fiton ${moverName}!` };
    }
    return { ...state, board: nextBoard, turn: nextTurn, status: 'finished', winnerId: null, winnerName: 'Barazim (Pat)', inCheck: null, lastMove: { from, to }, capturedByWhite: capW, capturedByBlack: capB, lastActionText: '🤝 Loja mbyllur në barazim (Pat)!' };
  }

  return {
    ...state,
    board: nextBoard,
    turn: nextTurn,
    inCheck: check ? nextTurn : null,
    lastMove: { from, to },
    capturedByWhite: capW,
    capturedByBlack: capB,
    lastActionText: check ? `⚠️ SHAH! Kujdes ${nextName}!` : `Radha e ${nextName} (${nextTurn === 'w' ? 'Të Bardhat' : 'Të Zezat'}).`,
  };
}
