// Boti i shahut mendon këtu, në sfond, që tavolina të mos ngrijë
import { computeStrongMove } from './chessAI';

self.onmessage = (e: MessageEvent) => {
  self.postMessage(computeStrongMove(e.data));
};
