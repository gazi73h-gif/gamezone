import type { ChessGameState } from './chessLogic';
import { computeStrongMove, type SearchResult } from './chessAI';

type BotInput = Pick<ChessGameState, 'board' | 'turn' | 'lastMove' | 'aiDifficulty'>;

// Nis llogaritjen në Web Worker; nëse shfletuesi s'e lejon, llogarit drejtpërdrejt
export function requestBotMove(state: BotInput): Promise<SearchResult | null> {
  const input: BotInput = { board: state.board, turn: state.turn, lastMove: state.lastMove, aiDifficulty: state.aiDifficulty };
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./chessAI.worker.ts', import.meta.url));
    } catch {
      resolve(computeStrongMove(input));
      return;
    }
    worker.onmessage = (e: MessageEvent<SearchResult | null>) => { resolve(e.data); worker?.terminate(); };
    worker.onerror = () => { worker?.terminate(); resolve(computeStrongMove(input)); };
    worker.postMessage(input);
  });
}
