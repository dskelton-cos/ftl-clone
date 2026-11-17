import './style.css';
import { Game } from './core/game';
import { Renderer, VIEW_H, VIEW_W } from './render/renderer';
import { Hud } from './ui/hud';

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const game = new Game(renderer);
const hud = new Hud(document.getElementById('hud')!, document.getElementById('overlay')!, game);

// The game is laid out at 1280x720 and scaled to fit the window (letterboxed).
let scale = 1;
function fit() {
  scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  renderer.resize(scale * (window.devicePixelRatio || 1));
}
window.addEventListener('resize', fit);
fit();

const toView = (e: PointerEvent | MouseEvent) => {
  const r = stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
};
stage.addEventListener('pointermove', (e) => { const p = toView(e); game.onMouseMove(p.x, p.y); });
canvas.addEventListener('pointerdown', (e) => { const p = toView(e); game.onCanvasDown(p.x, p.y, e.button); });
stage.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => game.onKey(e));
window.addEventListener('gamepadconnected', () => game.sfx.unlock());

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  hud.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging from the browser console.
(window as unknown as { game: Game }).game = game;
