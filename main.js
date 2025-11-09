(() => {
'use strict';

// ===== Canvas & DPI-safe sizing =====
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
if(!ctx) { throw new Error('2D context not available'); }

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function fitCanvas() {
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  canvas.width  = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height= h + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ===== RD grid (Gray–Scott-like) =====
const gridW = 256, gridH = 256; // internal simulation resolution
let U = new Float32Array(gridW * gridH);
let V = new Float32Array(gridW * gridH);
let U2 = new Float32Array(gridW * gridH);
let V2 = new Float32Array(gridW * gridH);

// parameters
const Du = 0.16, Dv = 0.08;
let F = 0.036, k = 0.062; // decent maze/dots region
const dt = 1.0;
const lap = (A, x, y) => {
  // 5-point stencil with Neumann boundary (clamp)
  const ix = (x, y) => Math.max(0, Math.min(gridW-1, x)) + Math.max(0, Math.min(gridH-1, y))*gridW;
  const c = A[ix(x,y)];
  const l = A[ix(x-1,y)];
  const r = A[ix(x+1,y)];
  const u = A[ix(x,y-1)];
  const d = A[ix(x,y+1)];
  return -4*c + l + r + u + d;
};

function initField() {
  U.fill(1.0);
  V.fill(0.0);
  // a few random seeds
  for (let n=0;n<6;n++) {
    const cx = Math.floor(Math.random()*gridW);
    const cy = Math.floor(Math.random()*gridH);
    seedField(Math.floor(gridW*0.45 + Math.random()*gridW*0.1),
              Math.floor(gridH*0.45 + Math.random()*gridH*0.1), 10);
  }
}

function seedField(cx, cy, r=10) {
  const r2 = r*r;
  for (let y=cy-r; y<=cy+r; y++) {
    for (let x=cx-r; x<=cx+r; x++) {
      if (x<0||x>=gridW||y<0||y>=gridH) continue;
      const dx=x-cx, dy=y-cy;
      if (dx*dx + dy*dy <= r2) {
        const i = x + y*gridW;
        U[i] = 0.5;
        V[i] = 0.25;
      }
    }
  }
}

function stepRD(iters=8) {
  for (let it=0; it<iters; it++) {
    for (let y=0; y<gridH; y++) {
      for (let x=0; x<gridW; x++) {
        const i = x + y*gridW;
        const u = U[i], v = V[i];
        const uvv = u*v*v;
        const du = Du*lap(U,x,y) - uvv + F*(1-u);
        const dv = Dv*lap(V,x,y) + uvv - (F+k)*v;
        U2[i] = u + du*dt;
        V2[i] = v + dv*dt;
      }
    }
    // swap
    [U,U2] = [U2,U];
    [V,V2] = [V2,V];
  }
}

// ===== Particles driven by ∇V (diffusiophoresis-like) =====
const N = 3000;
let px = new Float32Array(N);
let py = new Float32Array(N);
let vx = new Float32Array(N);
let vy = new Float32Array(N);
let showParticles = false;
let mu = 0.65;

function randRange(a,b){ return a + Math.random()*(b-a); }
function initParticles() {
  for (let i=0;i<N;i++){
    px[i] = Math.random()*gridW;
    py[i] = Math.random()*gridH;
    vx[i] = 0; vy[i] = 0;
  }
}

function sampleGradV(x, y) {
  // bilinear sample of central differences on V
  const xi = Math.max(1, Math.min(gridW-2, x));
  const yi = Math.max(1, Math.min(gridH-2, y));
  const x0 = Math.floor(xi), y0 = Math.floor(yi);
  const fx = xi - x0, fy = yi - y0;
  const i = (x,y)=> x + y*gridW;
  // central diff at four neighbors
  function g(ix,iy){
    const dvx = 0.5*(V[i(ix+1,iy)] - V[i(ix-1,iy)]);
    const dvy = 0.5*(V[i(ix,iy+1)] - V[i(ix,iy-1)]);
    return [dvx, dvy];
  }
  const g00 = g(x0, y0);
  const g10 = g(x0+1, y0);
  const g01 = g(x0, y0+1);
  const g11 = g(x0+1, y0+1);
  const gx = (g00[0]*(1-fx)*(1-fy) + g10[0]*fx*(1-fy) + g01[0]*(1-fx)*fy + g11[0]*fx*fy);
  const gy = (g00[1]*(1-fx)*(1-fy) + g10[1]*fx*(1-fy) + g01[1]*(1-fx)*fy + g11[1]*fx*fy);
  return [gx, gy];
}

function stepParticles() {
  const noise = 0.15;
  for (let i=0;i<N;i++){
    const gxgy = sampleGradV(px[i], py[i]);
    // diffusiophoretic drift + mild persistence + noise
    vx[i] = 0.9*vx[i] + mu*gxgy[0] + (Math.random()*2-1)*noise;
    vy[i] = 0.9*vy[i] + mu*gxgy[1] + (Math.random()*2-1)*noise;
    px[i] += vx[i];
    py[i] += vy[i];
    // reflect at bounds
    if (px[i] < 1){ px[i]=1; vx[i]*=-0.6; }
    if (py[i] < 1){ py[i]=1; vy[i]*=-0.6; }
    if (px[i] > gridW-2){ px[i]=gridW-2; vx[i]*=-0.6; }
    if (py[i] > gridH-2){ py[i]=gridH-2; vy[i]*=-0.6; }
  }
}

// ===== Rendering =====
const fieldImg = ctx.createImageData(gridW, gridH);
function render() {
  // upscale with nearest-neighbor to preserve crispness
  // 1) draw RD field to offscreen ImageData
  const data = fieldImg.data;
  for (let i=0;i<gridW*gridH;i++){
    const v = V[i];
    // nice neutral palette: dark background -> lavender/teal highlights
    // map v to 0..1
    const t = Math.max(0, Math.min(1, v*3.0));
    // cubic smooth
    const s = t*t*(3-2*t);
    // palette
    const r = 16 + Math.floor(180*s);
    const g = 24 + Math.floor(140*s);
    const b = 32 + Math.floor(220*s);
    const o = i*4;
    data[o+0]=r; data[o+1]=g; data[o+2]=b; data[o+3]=255;
  }

  // 2) paint to canvas scaled
  // putImageData at 1:1 to an internal canvas, then drawImage for scaling.
  // To save allocations, reuse a hidden canvas
  if (!render._tmp) {
    render._tmp = document.createElement('canvas');
    render._tmp.width = gridW; render._tmp.height = gridH;
    render._ctx = render._tmp.getContext('2d');
  }
  render._ctx.putImageData(fieldImg, 0, 0);

  // clear main
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // scale to fit (cover) while preserving aspect
  const scale = Math.min(canvas.width/gridW, canvas.height/gridH);
  const drawW = Math.floor(gridW*scale);
  const drawH = Math.floor(gridH*scale);
  const dx = Math.floor((canvas.width - drawW)/2);
  const dy = Math.floor((canvas.height - drawH)/2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(render._tmp, 0,0, gridW,gridH, dx,dy, drawW,drawH);

  if (showParticles) {
    ctx.save();
    ctx.translate(dx,dy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.8;
    for (let i=0;i<N;i++){
      const x = px[i], y = py[i];
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI*2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }
}

// ===== Interaction =====
function canvasToGrid(ev){
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width/rect.width);
  const y = (ev.clientY - rect.top)  * (canvas.height/rect.height);
  // invert the cover transform:
  const scale = Math.min(canvas.width/gridW, canvas.height/gridH);
  const drawW = gridW*scale, drawH = gridH*scale;
  const dx = (canvas.width - drawW)/2;
  const dy = (canvas.height - drawH)/2;
  const gx = (x - dx)/scale;
  const gy = (y - dy)/scale;
  return [Math.floor(gx), Math.floor(gy)];
}

canvas.addEventListener('pointerdown', (ev)=>{
  const [gx, gy] = canvasToGrid(ev);
  if (!Number.isFinite(gx)) return;
  seedField(gx, gy, 10);
});

document.addEventListener('keydown', (e)=>{
  if (e.key === 'p' || e.key === 'P') { showParticles = !showParticles; }
  if (e.key === 'r' || e.key === 'R') { strongReset(); }
});

// UI wiring
document.getElementById('btnReset').addEventListener('click', strongReset);
document.getElementById('chkParticles').addEventListener('change', (e)=>{
  showParticles = e.target.checked;
});
const muSlider = document.getElementById('mu');
const muVal = document.getElementById('muVal');
const syncMu = () => { mu = parseFloat(muSlider.value); muVal.textContent = mu.toFixed(2); };
muSlider.addEventListener('input', syncMu); syncMu();

// ===== Control loop =====
let running = true;
window.kill = () => { running = false; };
window.reset = () => { strongReset(); };

function strongReset(){
  initField();
  initParticles();
}

function frame(){
  if (!running) return;
  stepRD(8);
  stepParticles();
  render();
  requestAnimationFrame(frame);
}

// boot
strongReset();
requestAnimationFrame(frame);

})();