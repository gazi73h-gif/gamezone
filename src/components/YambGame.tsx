'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  YambGameState, ColumnKey, RowKey, ROWS_ORDER, ROW_LABELS,
  calculateScore, canSelectCell, getColumnTotals, getGrandTotal, createEmptySheet
} from '../lib/yambLogic';
import { Dices, Lock, Trophy, Bell } from 'lucide-react';

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
function DiceFace({ value, locked }: { value: number; locked: boolean }) {
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
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-9 h-9 p-0.5">
      {Array.from({ length: 9 }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-center">
          {activeDots.includes(idx) && (
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                locked
                  ? 'bg-slate-950'
                  : value === 1 || value === 6
                  ? 'bg-rose-500'
                  : 'bg-white'
              }`}
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

  const isMyTurn = gameState.currentTurnPlayerId === currentPlayerId && !gameState.winnerId;
  const activePlayer = players.find((p) => p.player_id === gameState.currentTurnPlayerId);
  const viewedSheet = gameState.sheets[selectedViewPlayer] || createEmptySheet();

  const updateGameState = async (newState: YambGameState) => {
    setBusy(true);
    await supabase
      .from('rooms')
      .update({ game_state: newState })
      .eq('code', roomCode);
    setBusy(false);
  };

  const handleRollDice = async () => {
    if (!isMyTurn || gameState.rollsLeft <= 0 || busy) return;
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
      players.forEach((p) => {
        const total = getGrandTotal(updatedSheets[p.player_id]);
        if (total > bestScore) {
          bestScore = total;
          winnerId = p.player_id;
        }
      });
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
    <div className="max-w-5xl mx-auto px-3 py-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const total = getGrandTotal(gameState.sheets[p.player_id] || createEmptySheet());
            const active = p.player_id === gameState.currentTurnPlayerId;
            return (
              <button
                key={p.player_id}
                onClick={() => setSelectedViewPlayer(p.player_id)}
                className={`px-4 py-2 rounded-xl border text-left transition cursor-pointer ${
                  selectedViewPlayer === p.player_id
                    ? 'bg-amber-500/20 border-amber-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{p.nickname}</span>
                  {active && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                </div>
                <div className="text-xs text-amber-400 font-mono">{total} pikë</div>
              </button>
            );
          })}
        </div>

        <div className="text-sm font-semibold">
          {gameState.winnerId ? (
            <span className="flex items-center gap-2 text-amber-400">
              <Trophy className="w-5 h-5" />
              Fituesi: {players.find((p) => p.player_id === gameState.winnerId)?.nickname}
            </span>
          ) : isMyTurn ? (
            <span className="text-emerald-400">Radha jote! Hidh zarat ose shkruaj pikët.</span>
          ) : (
            <span className="text-slate-400">Po luan: {activePlayer?.nickname}...</span>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          {gameState.dice.map((val, idx) => {
            const locked = gameState.held[idx] && gameState.rollsLeft < 3;
            return (
              <button
                key={idx}
                onClick={() => toggleHoldDie(idx)}
                disabled={!isMyTurn || gameState.rollsLeft === 3 || gameState.rollsLeft === 0}
                className={`relative w-14 h-14 rounded-2xl font-black text-2xl flex items-center justify-center border-2 transition cursor-pointer ${
                  locked
                    ? 'bg-amber-500 text-slate-950 border-amber-300 scale-95'
                    : 'bg-slate-950 text-white border-slate-700 hover:border-amber-500/60'
                }`}
              >
                <DiceFace value={val} locked={locked} />
                {locked && <Lock className="w-3.5 h-3.5 absolute top-1 right-1" />}
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
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold px-6 py-3.5 rounded-xl transition cursor-pointer"
          >
            <Dices className="w-5 h-5" />
            Hidh Zarat ({gameState.rollsLeft})
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Kombinimi</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="py-3 px-3 text-center">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {ROWS_ORDER.map((row) => (
              <tr key={row} className="hover:bg-slate-800/30">
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
                        <span className="inline-block w-14 py-1 rounded-lg bg-slate-950 font-bold text-amber-300">
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
          <tfoot className="bg-slate-950 font-bold text-amber-400 border-t border-slate-800">
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
