'use client';

// The Gate — the landing page's living centrepiece. Payment packets stream toward a ring of twelve
// rule lamps: most pass and turn emerald, a few are caught in a gold orbit (STEP-UP) until approved,
// and some shatter at the rim (BLOCK). Canvas 2D, DPR-capped, paused when off-screen or hidden;
// a single still frame for reduced motion.
import { useEffect, useRef } from 'react';

type Kind = 'allow' | 'block' | 'step';
type RGB = [number, number, number];
type Packet = { x: number; y: number; vx: number; kind: Kind; state: 'travel' | 'orbit' | 'exit'; col: RGB; target: RGB; a: number; t: number; amt: string; label: string };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; col: RGB };
type Ring = { x: number; y: number; r: number; life: number; col: RGB };
type Tag = { x: number; y: number; text: string; life: number; col: RGB };

const C = {
  plat: [226, 232, 248] as RGB,
  allow: [52, 227, 160] as RGB,
  step: [246, 195, 91] as RGB,
  block: [255, 77, 109] as RGB,
  accent: [169, 184, 255] as RGB,
};
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const ITEMS: [Kind, string, string][] = [
  ['allow', '$23.98', '2 × USB-C cable'],
  ['block', '$34.00', 'R02 · not in your task'],
  ['step', '$48.00', 'R11 · ask me above $40'],
  ['allow', '$12.49', 'notebook'],
  ['block', '$200.00', 'R04 · gift card'],
  ['allow', '$18.90', 'desk mat'],
  ['block', '$1.00/mo', 'R08 · subscription trap'],
  ['allow', '$9.99', 'pens'],
  ['allow', '$27.50', 'HDMI adapter'],
  ['block', '$45.00', 'R07 · split purchase'],
  ['allow', '$15.00', 'cable ties'],
  ['step', '$52.00', 'R11 · ask me above $40'],
];

export function GateCanvas({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let gx = 0;
    let gy = 0;
    let R = 0;
    let mobile = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mobile = w < 900;
      gx = mobile ? w * 0.5 : w * 0.73;
      gy = mobile ? Math.min(h * 0.3, 260) : h * 0.5;
      R = Math.max(90, Math.min(mobile ? w * 0.3 : Math.min(w, h) * 0.26, 230));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const packets: Packet[] = [];
    const sparks: Spark[] = [];
    const rings: Ring[] = [];
    const tags: Tag[] = [];
    const lamps = Array.from({ length: 12 }, () => ({ k: 0, col: C.plat as RGB }));
    const sweeps: { at: number; i: number; col: RGB }[] = [];
    let flash = { k: 0, col: C.accent as RGB };
    let seq = 0;
    let spawnIn = 0.2;
    let t = 0;
    const par = { x: 0, y: 0, tx: 0, ty: 0 };

    const lampAngle = (i: number) => -Math.PI / 2 + (i / 12) * Math.PI * 2;
    const nearestLamp = (ang: number) => {
      let best = 0;
      let bd = 9;
      for (let i = 0; i < 12; i++) {
        const d = Math.abs(Math.atan2(Math.sin(ang - lampAngle(i)), Math.cos(ang - lampAngle(i))));
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    };
    const sweep = (col: RGB, start = 0) => {
      for (let i = 0; i < 12; i++) sweeps.push({ at: t + start + i * 0.028, i, col });
    };

    const spawn = () => {
      const [kind, amt, label] = ITEMS[seq++ % ITEMS.length]!;
      const spread = R * 0.72;
      const y = gy + (Math.random() * 2 - 1) * spread;
      packets.push({ x: -40, y, vx: 170 + Math.random() * 70, kind, state: 'travel', col: [...C.plat], target: [...C.plat], a: 0, t: 0, amt, label });
    };

    const step = (dt: number) => {
      t += dt;
      spawnIn -= dt;
      if (spawnIn <= 0 && packets.length < 18) {
        spawn();
        spawnIn = 0.55 + Math.random() * 0.75;
      }
      par.x += (par.tx - par.x) * Math.min(1, dt * 3);
      par.y += (par.ty - par.y) * Math.min(1, dt * 3);
      const cx = gx + par.x;
      const cy = gy + par.y;

      for (let i = sweeps.length - 1; i >= 0; i--) {
        const s = sweeps[i]!;
        if (t >= s.at) {
          lamps[s.i]!.k = 1;
          lamps[s.i]!.col = s.col;
          sweeps.splice(i, 1);
        }
      }
      for (const l of lamps) l.k = Math.max(0, l.k - dt * 1.4);
      flash.k = Math.max(0, flash.k - dt * 1.8);

      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i]!;
        p.t += dt;
        p.col = mix(p.col, p.target, Math.min(1, dt * 6));
        if (p.state === 'travel') {
          const dy = p.y - cy;
          const hitX = Math.abs(dy) < R ? cx - Math.sqrt(R * R - dy * dy) : cx;
          p.x += p.vx * dt;
          if (p.x >= hitX) {
            const ang = Math.atan2(dy, hitX - cx);
            const li = nearestLamp(ang);
            if (p.kind === 'block') {
              for (let k = 0; k < 22; k++) {
                const a = Math.PI + (Math.random() - 0.5) * 2.4;
                const sp = 60 + Math.random() * 220;
                sparks.push({ x: hitX, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.6, col: C.block });
              }
              rings.push({ x: hitX, y: p.y, r: 4, life: 1, col: C.block });
              tags.push({ x: hitX - 14, y: p.y - 18, text: `✕ BLOCK · ${p.label}`, life: 1.6, col: C.block });
              lamps[li]!.k = 1.4;
              lamps[li]!.col = C.block;
              flash = { k: 0.8, col: C.block };
              packets.splice(i, 1);
              continue;
            }
            if (p.kind === 'step') {
              p.state = 'orbit';
              p.a = ang;
              p.t = 0;
              p.target = [...C.step];
              lamps[li]!.k = 1.4;
              lamps[li]!.col = C.step;
              flash = { k: 0.6, col: C.step };
              tags.push({ x: hitX - 14, y: p.y - 18, text: `! STEP-UP · ${p.label}`, life: 1.8, col: C.step });
              continue;
            }
            // allow: pass through the gate
            p.state = 'exit';
            p.target = [...C.allow];
            sweep(C.allow);
            flash = { k: 0.55, col: C.allow };
          }
        } else if (p.state === 'orbit') {
          p.a += dt * 1.5;
          const rr = R + 20;
          p.x = cx + Math.cos(p.a) * rr;
          p.y = cy + Math.sin(p.a) * rr;
          if (p.t > 2.6 && Math.cos(p.a) > 0.2) {
            p.state = 'exit';
            p.vx = 260;
            p.target = [...C.allow];
            sweep(C.allow);
            flash = { k: 0.6, col: C.allow };
            tags.push({ x: p.x + 10, y: p.y - 14, text: '✓ approved in PayPal', life: 1.6, col: C.allow });
          }
        } else {
          p.vx = Math.min(p.vx * (1 + dt * 1.2), 520);
          p.x += p.vx * dt;
          p.y += (cy - p.y) * dt * 0.25;
          if (p.x > w + 60) packets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.life -= dt;
        s.vx *= 1 - dt * 2.2;
        s.vy *= 1 - dt * 2.2;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life <= 0) sparks.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]!;
        r.life -= dt * 1.4;
        r.r += dt * 120;
        if (r.life <= 0) rings.splice(i, 1);
      }
      for (let i = tags.length - 1; i >= 0; i--) {
        const g = tags[i]!;
        g.life -= dt;
        g.y -= dt * 8;
        if (g.life <= 0) tags.splice(i, 1);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = gx + par.x;
      const cy = gy + par.y;

      // halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.1);
      halo.addColorStop(0, rgba(C.accent, 0.1 + flash.k * 0.08));
      halo.addColorStop(0.45, rgba(flash.k > 0.05 ? flash.col : C.accent, 0.05 + flash.k * 0.12));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // the lane: faint guide lines converging on the gate
      ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) {
        const yy = cy + k * R * 0.32;
        const g = ctx.createLinearGradient(0, 0, cx, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0.06)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(cx - Math.sqrt(Math.max(0, R * R - (yy - cy) ** 2)), yy);
        ctx.stroke();
      }

      // bezel ticks (slow counter-rotation)
      const rot = t * 0.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rot);
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r1 = R + 30;
        const r2 = R + (i % 6 === 0 ? 40 : 35);
        ctx.strokeStyle = `rgba(220,228,255,${i % 6 === 0 ? 0.22 : 0.09})`;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // glass disc
      const disc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R);
      disc.addColorStop(0, 'rgba(255,255,255,0.05)');
      disc.addColorStop(1, 'rgba(255,255,255,0.008)');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // main ring + rotating sheen
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(226,232,248,0.32)';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      const anyCtx = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
      if (anyCtx.createConicGradient) {
        const cg = anyCtx.createConicGradient(t * 0.6, cx, cy);
        cg.addColorStop(0, 'rgba(255,255,255,0)');
        cg.addColorStop(0.06, 'rgba(255,255,255,0.9)');
        cg.addColorStop(0.16, 'rgba(201,184,255,0.25)');
        cg.addColorStop(0.3, 'rgba(255,255,255,0)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = cg;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (flash.k > 0.02) {
        ctx.save();
        ctx.shadowColor = rgba(flash.col, 0.9);
        ctx.shadowBlur = 28;
        ctx.strokeStyle = rgba(flash.col, flash.k * 0.85);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // the gate beam
      const beam = ctx.createLinearGradient(0, cy - R * 0.8, 0, cy + R * 0.8);
      beam.addColorStop(0, 'rgba(255,255,255,0)');
      beam.addColorStop(0.5, rgba(flash.k > 0.05 ? mix(C.plat, flash.col, flash.k) : C.plat, 0.55 + flash.k * 0.35));
      beam.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.shadowColor = 'rgba(200,210,255,0.8)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = beam;
      ctx.fillRect(cx - 1.2, cy - R * 0.8, 2.4, R * 1.6);
      ctx.restore();

      // lamps
      for (let i = 0; i < 12; i++) {
        const a = lampAngle(i);
        const lx = cx + Math.cos(a) * R;
        const ly = cy + Math.sin(a) * R;
        const l = lamps[i]!;
        const on = Math.min(1, l.k);
        ctx.save();
        if (on > 0.05) {
          ctx.shadowColor = rgba(l.col, 0.95);
          ctx.shadowBlur = 18 * on;
        }
        ctx.fillStyle = on > 0.05 ? rgba(mix(C.plat, l.col, on), 0.55 + on * 0.45) : 'rgba(226,232,248,0.42)';
        ctx.beginPath();
        ctx.arc(lx, ly, 3.4 + on * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // packets with light trails (on wide screens they emerge from behind the headline)
      ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      const emerge = (x: number) => (mobile ? 1 : Math.max(0, Math.min(1, (x - w * 0.42) / (w * 0.1))));
      for (const p of packets) {
        const vis = p.state === 'travel' ? emerge(p.x) : 1;
        if (vis <= 0.01) continue;
        ctx.globalAlpha = vis;
        const trail = p.state === 'orbit' ? 0 : Math.min(120, p.vx * 0.28);
        if (trail > 0) {
          const g = ctx.createLinearGradient(p.x - trail, p.y, p.x, p.y);
          g.addColorStop(0, rgba(p.col, 0));
          g.addColorStop(1, rgba(p.col, 0.7));
          ctx.strokeStyle = g;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - trail, p.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        ctx.save();
        ctx.shadowColor = rgba(p.col, 0.95);
        ctx.shadowBlur = 16;
        ctx.fillStyle = rgba(p.col, 1);
        ctx.beginPath();
        ctx.roundRect?.(p.x - 7, p.y - 3, 14, 6, 3);
        if (!ctx.roundRect) ctx.rect(p.x - 7, p.y - 3, 14, 6);
        ctx.fill();
        ctx.restore();
        if (!mobile || p.state !== 'travel') {
          const fade = p.state === 'exit' ? Math.max(0, 1 - (p.x - cx - R) / 260) : Math.min(1, p.t * 2);
          if (fade > 0.02) {
            ctx.fillStyle = rgba(p.col, 0.6 * fade);
            ctx.fillText(p.amt, p.x - 16, p.y - 10);
          }
        }
        ctx.globalAlpha = 1;
      }

      for (const r of rings) {
        ctx.strokeStyle = rgba(r.col, Math.max(0, r.life) * 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const s of sparks) {
        ctx.fillStyle = rgba(s.col, Math.max(0, Math.min(1, s.life * 1.4)));
        ctx.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
      }
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      for (const g of tags) {
        const a = Math.min(1, g.life * 1.5);
        const tw = ctx.measureText(g.text).width;
        const x = Math.min(Math.max(8, g.x - tw), w - tw - 8);
        ctx.fillStyle = rgba([5, 7, 13], 0.7 * a);
        ctx.beginPath();
        ctx.roundRect?.(x - 8, g.y - 13, tw + 16, 20, 10);
        if (!ctx.roundRect) ctx.rect(x - 8, g.y - 13, tw + 16, 20);
        ctx.fill();
        ctx.strokeStyle = rgba(g.col, 0.55 * a);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = rgba(g.col, a);
        ctx.fillText(g.text, x, g.y + 1);
      }

      // caption under the ring
      ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(140,149,171,0.75)';
      const cap = 'ALLOWANCE · 12 RULES · DETERMINISTIC';
      ctx.fillText(cap, cx - ctx.measureText(cap).width / 2, cy + R + 64);
    };

    // Seed a pleasant first frame.
    for (let k = 0; k < 6; k++) {
      spawn();
      packets[packets.length - 1]!.x = -40 + k * (gx / 6);
    }
    if (reduce) {
      step(0.016);
      draw();
      return () => ro.disconnect();
    }

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const onMove = (e: PointerEvent) => {
      par.tx = (e.clientX / window.innerWidth - 0.5) * 18;
      par.ty = (e.clientY / window.innerHeight - 0.5) * 12;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    start();
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
