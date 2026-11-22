'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  VizatoGameState,
  DrawStroke,
  StrokePoint,
  submitVizatoGuess,
  advanceVizatoTurn,
} from '../lib/vizatoLogic';
import { recordWin } from '@/lib/supabase';
import {
  Palette,
  Eraser,
  Trash2,
  Send,
  Trophy,
  SkipForward,
  RotateCcw,
  Eye,
} from 'lucide-react';

interface VizatoGameProps {
  gameState: VizatoGameState;
  currentPlayerId: string;
  isHost: boolean;
  onUpdateState: (newState: VizatoGameState) => Promise<void>;
  onRestartGame?: () => Promise<void>;
}

const COLORS: Array<string> = Array.of(
  '#0f172a',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#f97316',
  '#ffffff'
);

export default function VizatoGame({
  gameState,
  currentPlayerId,
  isHost,
  onUpdateState,
  onRestartGame,
}: VizatoGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Array<StrokePoint>>(Array.of());
  const [selectedColor, setSelectedColor] = useState<string>('#0f172a');
  const [brushSize, setBrushSize] = useState<number>(5);
  const [guessInput, setGuessInput] = useState<string>('');

  const winRecordedRef = useRef(false);
  useEffect(() => {
    if (gameState.status !== 'finished') { winRecordedRef.current = false; return; }
    if (winRecordedRef.current) return;
    const w = Object.values(gameState.players).sort((a, b) => b.score - a.score);
    if (w && w.id === currentPlayerId) { winRecordedRef.current = true; recordWin(w.nickname, w.score, 'Vizato & Qëllo'); }
  }, [gameState.status, gameState.players, currentPlayerId]);

  const isDrawer = gameState.currentDrawerId === currentPlayerId && gameState.status === 'playing';
  const drawerName = gameState.players[gameState.currentDrawerId]?.nickname || 'Lojtari';

  // Vizato të gjitha vijat sa herë përditësohet gjendja
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawSingleStroke = (stroke: DrawStroke) => {
      if (stroke.points.length === 0) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      const first = stroke.points.at(0)!;
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points.at(i)!;
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    };

    for (const s of gameState.strokes) {
      drawSingleStroke(s);
    }

    if (isDrawing && currentPoints.length > 0) {
      drawSingleStroke({
        points: currentPoints,
        color: selectedColor,
        size: brushSize,
      });
    }
  }, [gameState.strokes, isDrawing, currentPoints, selectedColor, brushSize]);

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches.item(0)!;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    setIsDrawing(true);
    const pt = getCoords(e);
    setCurrentPoints(Array.of(pt));
  };

  const moveDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawing) return;
    const pt = getCoords(e);
    setCurrentPoints((prev) => Array.from(prev).concat(pt));
  };

  const endDrawing = async () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);
    if (currentPoints.length === 0) return;

    const newStroke: DrawStroke = {
      points: currentPoints,
      color: selectedColor,
      size: brushSize,
    };
    setCurrentPoints(Array.of());

    const nextState: VizatoGameState = {
      ...gameState,
      strokes: Array.from(gameState.strokes).concat(newStroke),
    };
    await onUpdateState(nextState);
  };

  const handleClearCanvas = async () => {
    if (!isDrawer) return;
    await onUpdateState({
      ...gameState,
      strokes: Array.of(),
    });
  };

  const handleSkipTurn = async () => {
    if (!isDrawer && !isHost) return;
    const next = advanceVizatoTurn(gameState);
    await onUpdateState(next);
  };

  const handleSendGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim() || isDrawer) return;
    const updated = submitVizatoGuess(gameState, currentPlayerId, guessInput);
    setGuessInput('');
    await onUpdateState(updated);
  };

  const maskedWord = gameState.secretWord
    .split('')
    .map((ch) => (ch === ' ' ? '  ' : '_'))
    .join(' ');

  if (gameState.status === 'finished') {
    const sorted = Object.values(gameState.players).sort((a, b) => b.score - a.score);

    return (
      <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-6 text-center max-w-xl mx-auto shadow-2xl">
        <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-3 animate-bounce" />
        <h2 className="text-2xl font-extrabold text-white mb-1">Loja Përfundoi!</h2>
        <p className="text-slate-400 text-sm mb-6">Renditja përfundimtare — Vizato & Qëllo</p>

        <div className="space-y-3 mb-6">
          {sorted.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                idx === 0
                  ? 'bg-amber-500/20 border-amber-500/50 text-white'
                  : 'bg-slate-800/70 border-slate-700 text-slate-200'
              }`}
            >
              <span className="font-bold text-lg">
                {idx === 0 ? '👑 ' : `${idx + 1}. `}
                {p.nickname}
              </span>
              <span className="text-xl font-black text-amber-400">{p.score} pikë</span>
            </div>
          ))}
        </div>

        {isHost && onRestartGame && (
          <button
            onClick={onRestartGame}
            className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-500 text-white font-bold px-6 py-3 rounded-xl transition cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            Luaj Përsëri
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      {/* Shiriti i sipërm me fjalën sekrete dhe raundin */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-5 py-3.5 rounded-2xl">
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg">
            Raundi {gameState.round} / {gameState.maxRounds}
          </span>
          <span className="text-sm text-slate-300">
            Po vizaton: <strong className="text-pink-400">{drawerName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 border border-pink-500/40 px-4 py-1.5 rounded-xl">
          <Eye className="w-4 h-4 text-pink-400" />
          {isDrawer ? (
            <span className="text-sm font-bold text-white">
              Vizato fjalën: <span className="text-amber-400 uppercase">{gameState.secretWord}</span>
            </span>
          ) : (
            <span className="text-sm font-mono font-bold tracking-widest text-amber-300">
              {maskedWord} ({gameState.secretWord.length} shkronja)
            </span>
          )}
        </div>

        {(isDrawer || isHost) && (
          <button
            onClick={handleSkipTurn}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
          >
            <SkipForward className="w-4 h-4 text-amber-400" />
            Kalo Radhën
          </button>
        )}
      </div>

      {/* Pikët e lojtarëve */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {gameState.playerOrder.map((id) => {
          const p = gameState.players[id];
          const drawingNow = gameState.currentDrawerId === id;
          return (
            <div
              key={id}
              className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-sm ${
                drawingNow
                  ? 'bg-pink-950/40 border-pink-500/60'
                  : p.hasGuessed
                  ? 'bg-emerald-950/40 border-emerald-500/50'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <span className="font-semibold text-white truncate">
                {drawingNow ? '🎨 ' : p.hasGuessed ? '✅ ' : ''}
                {p.nickname}
              </span>
              <span className="font-bold text-amber-400">{p.score}</span>
            </div>
          );
        })}
      </div>

      {/* Zona kryesore: Kanavaca + Chat-i */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="bg-white rounded-2xl overflow-hidden border-4 border-slate-800 shadow-xl">
            <canvas
              ref={canvasRef}
              width={640}
              height={400}
              onMouseDown={startDrawing}
              onMouseMove={moveDrawing}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={moveDrawing}
              onTouchEnd={endDrawing}
              className={`w-full h-[300px] sm:h-[380px] block touch-none ${
                isDrawer ? 'cursor-crosshair' : 'cursor-not-allowed'
              }`}
            />
          </div>

          {/* Mjetet e vizatimit (vetëm për atë që po vizaton) */}
          {isDrawer && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
              <div className="flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-slate-400 mr-1" />
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full border-2 transition cursor-pointer ${
                      selectedColor === color ? 'border-amber-400 scale-110' : 'border-slate-600'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedColor('#ffffff')}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 cursor-pointer"
                  title="Gomë"
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <select
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="bg-slate-800 text-white text-xs rounded-lg px-2.5 py-2 outline-none"
                >
                  <option value={3}>I hollë</option>
                  <option value={6}>Mesatar</option>
                  <option value={12}>I trashë</option>
                </select>
                <button
                  onClick={handleClearCanvas}
                  className="flex items-center gap-1 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-semibold px-3 py-2 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Pastro
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chat-i për të qëlluar fjalën */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[380px] lg:h-[445px]">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800 mb-3">
            Chat & Qëllimi i Fjalës
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-sm">
            {gameState.messages.map((m) => (
              <div
                key={m.id}
                className={`px-3 py-2 rounded-xl ${
                  m.isCorrect
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold'
                    : m.playerId === 'system'
                    ? 'bg-slate-800/80 text-amber-300 text-xs'
                    : 'bg-slate-950 text-slate-200'
                }`}
              >
                {m.playerId !== 'system' && !m.isCorrect && (
                  <span className="font-bold text-pink-400 mr-1.5">{m.nickname}:</span>
                )}
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendGuess} className="mt-3 flex gap-2">
            <input
              type="text"
              disabled={isDrawer}
              placeholder={isDrawer ? 'Ti po vizaton tani...' : 'Shkruaj fjalën këtu...'}
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-pink-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isDrawer || !guessInput.trim()}
              className="bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white p-2.5 rounded-xl transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

