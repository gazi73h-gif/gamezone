'use client';

import React, { useState, useEffect } from 'react';
import { recordWin } from '../lib/supabase';
import {
  YambGameState, ColumnKey, RowKey, ROWS_ORDER, ROW_LABELS,
  calculateScore, canSelectCell, getColumnTotals, getGrandTotal, createEmptySheet
} from '../lib/yambLogic';
import { Dices, Lock, Trophy, Bell } from 'lucide-react';
import { PlayerChip, GameKitStyles, SEAT_COLORS } from './gamekit';
import { playSound } from '../lib/sound';
import { updateRoom } from '../lib/rooms';

interface Player {
  player_id: string;
  nickname: string;
}

interface Props {
  roomCode: string;
  gameState: YambGameState;
  players: Player[];
  currentPlayerId: string;
}

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'down', label: 'Poshtë ↓' },
  { key: 'up', label: 'Lart ↑' },
  { key: 'free', label: 'Lirë ↕' },
  { key: 'call', label: 'N (Thirr)' },
];
function DiceFace({ value }: { value: number; locked?: boolean }) {
    const dotPositions: Record<number, number[]> = {
    1: Array.of(4),
    2: Array.of(0, 8),
    3: Array.of(0, 4, 8),
    4: Array.of(0, 2, 6, 8),
    5: Array.of(0, 2, 4, 6, 8),
    6: Array.of(0, 2, 3, 5, 6, 8),
  };
  const activeDots = dotPositions[value] || Array.of();

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-[3px] w-[70%] h-[70%]">
      {Array.from({ length: 9 }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-center">
          {activeDots.includes(idx) && (
            <span
              className={`yb-pip ${value === 1 ? 'yb-pip-red' : ''}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
export default function YambGame({ roomCode, gameState, players, currentPlayerId }: Props) {
  const [selectedViewPlayer, setSelectedViewPlayer] = useState<string>(currentPlayerId);
  const [busy, setBusy] = useState(false);

  const allPlayers = players.some((p) => p.player_id === 'BOT_YAMB') || !gameState.sheets['BOT_YAMB'] ? players : players.concat({ player_id: 'BOT_YAMB', nickname: '🤖 Bot Yamb' });
  useEffect(() => { if (gameState.winnerId || allPlayers.at(0)?.player_id !== currentPlayerId || gameState.currentTurnPlayerId !== 'BOT_YAMB') return; const t = setTimeout(async () => { const d = Array.from({ length: 6 }, () => Math.floor(Math.random() * 6) + 1); const sheet = gameState.sheets['BOT_YAMB']; if (!sheet) return; const cols = ['down', 'up', 'free'] as const; const rows = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'max', 'min', 'straight', 'full', 'poker', 'yamb'] as const; let picked: { col: typeof cols[number]; row: typeof rows[number] } | null = null; for (const c of cols) { for (const r of rows) { if (sheet[c][r] === null) { picked = { col: c, row: r }; break; } } if (picked) break; } if (!picked) return; const val = calculateScore(picked.row, d, 1); const nextSheet = { ...sheet, [picked.col]: { ...sheet[picked.col], [picked.row]: val } }; await updateGameState({ ...gameState, dice: d, rollsLeft: 3, calledRow: null, sheets: { ...gameState.sheets, BOT_YAMB: nextSheet }, currentTurnPlayerId: Object.keys(gameState.sheets).find((id) => id !== 'BOT_YAMB') || 'BOT_YAMB' }); }, 900); return () => clearTimeout(t); }, [gameState, currentPlayerId]);
  const isMyTurn = gameState.currentTurnPlayerId === currentPlayerId && !gameState.winnerId;
  const activePlayer = allPlayers.find((p) => p.player_id === gameState.currentTurnPlayerId);
  const viewedSheet = gameState.sheets[selectedViewPlayer] || createEmptySheet();

  const updateGameState = async (newState: YambGameState) => {
    setBusy(true);
    await updateRoom(currentPlayerId, roomCode, { state: newState }).catch(() => false);
    setBusy(false);
  };

  const handleRollDice = async () => {
    if (!isMyTurn || gameState.rollsLeft <= 0 || busy) return;
    playSound('dice');
    const newDice = gameState.dice.map((val, idx) =>
      gameState.held[idx] && gameState.rollsLeft < 3 ? val : Math.floor(Math.random() * 6) + 1
    );
    await updateGameState({
      ...gameState,
      dice: newDice,
      rollsLeft: gameState.rollsLeft - 1,
    });
  };

  const toggleHoldDie = async (index: number) => {
    if (!isMyTurn || gameState.rollsLeft === 3 || gameState.rollsLeft === 0 || busy) return;
    const newHeld = [...gameState.held];
    newHeld[index] = !newHeld[index];
    await updateGameState({ ...gameState, held: newHeld });
  };
  const handleCellClick = async (col: ColumnKey, row: RowKey) => {
    if (!isMyTurn || busy) return;
    const mySheet = gameState.sheets[currentPlayerId] || createEmptySheet();

    if (!canSelectCell(mySheet, col, row, gameState.rollsLeft, gameState.calledRow)) return;

    if (col === 'call' && gameState.calledRow === null && gameState.rollsLeft === 2) {
      await updateGameState({ ...gameState, calledRow: row });
      return;
    }

    const score = calculateScore(row, gameState.dice, gameState.rollsLeft);
    const updatedSheet = {
      ...mySheet,
      [col]: { ...mySheet[col], [row]: score },
    };

    const updatedSheets = { ...gameState.sheets, [currentPlayerId]: updatedSheet };

    const allFinished = players.every((p) => {
      const s = updatedSheets[p.player_id];
      if (!s) return false;
      const cols = new Array<ColumnKey>('down', 'up', 'free', 'call');
      const totalCells = cols.reduce(
        (acc, c) => acc + Object.keys(s[c] || {}).length,
        0
      );
      return totalCells >= 52;
    });

     let winnerId: string | null = null;
 if (allFinished) {
   let bestScore = -1;
   let winnerNick = '';
   players.forEach((p) => {
     const total = getGrandTotal(updatedSheets[p.player_id]);
     if (total > bestScore) {
       bestScore = total;
       winnerId = p.player_id;
       winnerNick = p.nickname;
     }
   });
   if (winnerNick) {
     await recordWin(winnerNick, bestScore, 'Yamb', winnerId === currentPlayerId);
   }
 }


    const currentIdx = players.findIndex((p) => p.player_id === currentPlayerId);
    const nextPlayer = players[(currentIdx + 1) % players.length];
    setSelectedViewPlayer(nextPlayer.player_id);

    await updateGameState({
      currentTurnPlayerId: nextPlayer.player_id,
      dice: new Array(1, 2, 3, 4, 5, 6),
      held: new Array(false, false, false, false, false, false),
      rollsLeft: 3,
      calledRow: null,
      sheets: updatedSheets,
      winnerId,
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-3 py-4">
      <GameKitStyles />
      <style>{`
        .yb-felt { background: radial-gradient(70% 60% at 50% 45%, #2f9a72 0%, #1d7457 45%, #12503d 100%);
          box-shadow: inset 0 0 0 2px rgba(255,214,140,0.3), inset 0 10px 30px rgba(0,0,0,0.45), 0 0 0 8px #7c4520, 0 18px 40px rgba(0,0,0,0.5); }
        .yb-die { position: relative; width: 56px; height: 56px; border-radius: 14px; display: grid; place-items: center; cursor: pointer;
          background: linear-gradient(145deg, #ffffff 0%, #f1ece0 55%, #d9cfb8 100%);
          box-shadow: inset -3px -4px 6px rgba(0,0,0,0.18), inset 3px 3px 5px rgba(255,255,255,0.9), 0 6px 0 #b9ab8b, 0 10px 16px rgba(0,0,0,0.45);
          transition: transform .15s; }
        .yb-die:not(:disabled):hover { transform: translateY(-3px) rotate(-3deg); }
        .yb-die:disabled { cursor: default; }
        .yb-die-held { transform: translateY(4px); box-shadow: 0 0 0 3px #ffc83d, 0 0 16px rgba(255,200,61,0.6), inset -3px -4px 6px rgba(0,0,0,0.18), 0 2px 0 #b9ab8b; }
        .yb-pip { width: 100%; aspect-ratio: 1; border-radius: 999px; background: radial-gradient(circle at 35% 35%, #4b4b4b, #111); }
        .yb-pip-red { background: radial-gradient(circle at 35% 35%, #ff6b6b, #b91c1c); }
        .yb-row:nth-child(odd) { background: rgba(255,255,255,0.045); }
        .yb-row:hover { background: rgba(255,200,61,0.08); }
      `}</style>
      <div className="gz-panel rounded-3xl p-3 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {allPlayers.map((p, i) => {
            const total = getGrandTotal(gameState.sheets[p.player_id] || createEmptySheet());
            return (
              <PlayerChip key={p.player_id} id={p.player_id} name={p.nickname} me={p.player_id === currentPlayerId} bot={p.player_id.startsWith('BOT')}
                color={SEAT_COLORS[i % SEAT_COLORS.length]} active={p.player_id === gameState.currentTurnPlayerId && !gameState.winnerId}
                selected={selectedViewPlayer === p.player_id} onClick={() => setSelectedViewPlayer(p.player_id)}
                sub={<span className="text-gold font-display">{total} pikë</span>} />
            );
          })}
        </div>

        <div className="text-sm font-semibold">
          {gameState.winnerId ? (
            <span className="flex items-center gap-2 text-amber-400">
              <Trophy className="w-5 h-5" />
              Fituesi: {allPlayers.find((p) => p.player_id === gameState.winnerId)?.nickname}
            </span>
          ) : isMyTurn ? (
            <span className="text-emerald-400">Radha jote! Hidh zarat ose shkruaj pikët.</span>
          ) : (
            <span className="text-slate-400">Po luan: {activePlayer?.nickname}...</span>
          )}
        </div>
      </div>

      <div className="yb-felt rounded-[28px] p-4 sm:p-5 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          {gameState.dice.map((val, idx) => {
            const locked = gameState.held[idx] && gameState.rollsLeft < 3;
            return (
              <button
                key={idx}
                onClick={() => toggleHoldDie(idx)}
                disabled={!isMyTurn || gameState.rollsLeft === 3 || gameState.rollsLeft === 0}
                className={`yb-die ${locked ? 'yb-die-held' : ''}`}
                aria-label={`Zari ${idx + 1}: ${val}${locked ? ' (i mbajtur)' : ''}`}
              >
                <DiceFace value={val} locked={locked} />
                {locked && <Lock className="w-3.5 h-3.5 absolute -top-1.5 -right-1.5 bg-gold text-[#2a1600] rounded-full p-0.5" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {gameState.calledRow && (
            <span className="flex items-center gap-1.5 text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 px-3 py-2 rounded-xl">
              <Bell className="w-4 h-4" />
              Thirrur: {ROW_LABELS[gameState.calledRow]}
            </span>
          )}
          <button
            onClick={handleRollDice}
            disabled={!isMyTurn || gameState.rollsLeft <= 0 || busy}
            className="gz-btn flex items-center gap-2 font-display font-semibold text-lg px-6 py-3 rounded-2xl cursor-pointer"
          >
            <Dices className="w-5 h-5" />
            Hidh Zarat ({gameState.rollsLeft})
          </button>
        </div>
      </div>

      <div className="gz-panel rounded-3xl overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-black/30 text-mute border-b border-white/10 text-xs uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Kombinimi</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="py-3 px-3 text-center">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS_ORDER.map((row) => (
              <tr key={row} className="yb-row">
                <td className="py-2.5 px-4 font-medium text-slate-200">{ROW_LABELS[row]}</td>
                {COLUMNS.map((col) => {
                  const val = viewedSheet[col.key]?.[row];
                  const playable =
                    isMyTurn &&
                    selectedViewPlayer === currentPlayerId &&
                    canSelectCell(viewedSheet, col.key, row, gameState.rollsLeft, gameState.calledRow);
                  const preview = playable ? calculateScore(row, gameState.dice, gameState.rollsLeft) : null;
                  const isCalled = col.key === 'call' && gameState.calledRow === row;

                  return (
                    <td key={col.key} className="py-1.5 px-2 text-center">
                      {val !== undefined ? (
                        <span className="inline-block w-14 py-1 rounded-lg bg-black/30 font-display font-semibold text-gold">
                          {val}
                        </span>
                      ) : playable ? (
                        <button
                          onClick={() => handleCellClick(col.key, row)}
                          className={`w-14 py-1 rounded-lg font-semibold transition cursor-pointer ${
                            isCalled
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40'
                          }`}
                        >
                          {col.key === 'call' && gameState.calledRow === null && gameState.rollsLeft === 2
                            ? 'Thirr'
                            : preview}
                        </button>
                      ) : (
                        <span className="inline-block w-14 py-1 text-slate-700">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-black/35 font-display font-semibold text-gold border-t border-white/10">
            <tr>
              <td className="py-3 px-4">Totali i Kolonës</td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="py-3 px-3 text-center">
                  {getColumnTotals(viewedSheet[col.key]).total}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
