'use client';
import React, { useEffect, useRef } from 'react';
import { playSound } from '@/lib/sound';

const COLORS = ['#ffc83d', '#ff5d73', '#3ddc97', '#4cc9f0', '#b388ff', '#ff9f1c', '#ffffff'];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rocket?: boolean };

// Fishekzjarre mbi gjithë ekranin (canvas), me tingull për çdo shpërthim
export default function Fireworks({ duration = 9000 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    const size = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);

    const ps: Particle[] = [];
    const start = performance.now();
    let last = start, nextLaunch = start, launches = 0, raf = 0;

    const launch = () => {
      const x = w * (0.12 + Math.random() * 0.76);
      const peak = h * (0.12 + Math.random() * 0.3);
      const vy = -Math.sqrt(2 * 0.09 * (h - peak));
      ps.push({ x, y: h, vx: (Math.random() - 0.5) * 1.2, vy, life: 999, max: 999, color: '#ffe8a3', size: 2.4, rocket: true });
      if (launches < 14) playSound('firework');
      launches++;
    };
    const burst = (x: number, y: number) => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const second = COLORS[Math.floor(Math.random() * COLORS.length)];
      const n = reduce ? 30 : 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const sp = 1.5 + Math.random() * 3.8;
        const max = 55 + Math.random() * 45;
        ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max, color: i % 3 ? color : second, size: 1.6 + Math.random() * 1.8 });
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.7);
      last = now;
      if (now - start < duration && now >= nextLaunch) {
        launch();
        if (Math.random() < 0.35) launch();
        nextLaunch = now + (reduce ? 1200 : 380 + Math.random() * 520);
      }
      // gjurmët zbehen ngadalë
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (p.rocket) {
          p.vy += 0.09 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          g.fillStyle = p.color;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
          if (p.vy >= -0.6) { ps.splice(i, 1); burst(p.x, p.y); }
          continue;
        }
        p.vx *= Math.pow(0.965, dt); p.vy = p.vy * Math.pow(0.965, dt) + 0.045 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        const alpha = Math.min(1, p.life / p.max * 1.4);
        g.globalAlpha = alpha * (0.75 + Math.random() * 0.25);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
      if (now - start < duration || ps.length) raf = requestAnimationFrame(frame);
      else g.clearRect(0, 0, w, h);
    };
    launch(); launch();
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, [duration]);

  return <canvas ref={ref} data-testid="fireworks" aria-hidden className="fixed inset-0 w-full h-full pointer-events-none z-[60]" />;
}
