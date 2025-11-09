// Minimal RD (Gray–Scott) + optional particles drift; mobile-safe sizing.
// NOTE: This is not a strict reproduction of diffusiophoresis experiments.

const SIM_W = 256, SIM_H = 256;
let u, v, u2, v2, running = true, raf = null;
let t = 0;
const params = { Du: 0.16, Dv: 0.08, F: 0.036, k: 0.065, stepsPerFrame: 20, particleVis: false, mu: 0.4 };

// Particles (hidden by default; can be toggled with 'P')
const Np = 1200;
let px = new Float32Array(Np), py = new Float32Array(Np);

const cvs = document.getElementById('view');
const ctx = cvs.getContext('2d', {willReadFrequently:true});
const img = ctx.createImageData(SIM_W, SIM_H);

// UI
const btnReset = document.getElementById('btnReset');
const btnPause = document.getElementById('btnPause');
const btnSave  = document.getElementById('btnSave');

btnReset.addEventListener('click', () => resetAll());
btnPause.addEventListener('click', () => { running = !running; btnPause.textContent = running?'Pause':'Resume'; if(running) loop(); });
btnSave.addEventListener('click', savePNG);

window.addEventListener('resize', sizeCanvas);
cvs.addEventListener('pointerdown', (ev) => {
  const rect = cvs.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / rect.width  * SIM_W);
  const y = Math.floor((ev.clientY - rect.top)  / rect.height * SIM_H);
  seed(x,y,6);
});

document.addEventListener('keydown', (e)=>{
  if(e.key==='r' || e.key==='R') resetAll();
  if(e.key===' ') { e.preventDefault(); btnPause.click(); }
  if(e.key==='p' || e.key==='P') params.particleVis = !params.particleVis;
});

function init(){
  u = new Float32Array(SIM_W*SIM_H);
  v = new Float32Array(SIM_W*SIM_H);
  u2 = new Float32Array(SIM_W*SIM_H);
  v2 = new Float32Array(SIM_W*SIM_H);
  for(let i=0;i<u.length;i++){ u[i]=1.0; v[i]=0.0; }
  // Initial seed in center
  for(let dy=-8; dy<=8; dy++){
    for(let dx=-8; dx<=8; dx++){
      const x = (SIM_W>>1)+dx, y=(SIM_H>>1)+dy;
      if(x>=0&&x<SIM_W&&y>=0&&y<SIM_H){
        const i = y*SIM_W+x; v[i]=1.0;
      }
    }
  }
  // Particles random
  for(let i=0;i<Np;i++){ px[i]=Math.random()*SIM_W; py[i]=Math.random()*SIM_H; }
  sizeCanvas();
  t = 0;
}

function sizeCanvas(){
  // The canvas bitmap resolution is SIM_W x SIM_H, CSS size is responsive (square)
  cvs.width  = SIM_W;
  cvs.height = SIM_H;
  // CSS sizing is handled by CSS aspect-ratio; here we ensure devicePixelRatio crispness
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
  ctx.imageSmoothingEnabled = false;
}

function idx(x,y){ return y*SIM_W + x; }
function laplacian(field, x, y){
  const xm = (x-1+SIM_W) % SIM_W, xp = (x+1) % SIM_W;
  const ym = (y-1+SIM_H) % SIM_H, yp = (y+1) % SIM_H;
  return 0.05*(field[idx(xm,ym)] + field[idx(xp,ym)] + field[idx(xm,yp)] + field[idx(xp,yp)]) +
         0.2 *(field[idx(x,ym)]  + field[idx(x,yp)]  + field[idx(xm,y)]  + field[idx(xp,y)]) +
         (-1.0)*field[idx(x,y)];
}

function step(){
  const {Du,Dv,F,k} = params;
  for(let s=0; s<params.stepsPerFrame; s++){
    for(let y=0;y<SIM_H;y++){
      for(let x=0;x<SIM_W;x++){
        const i = idx(x,y);
        const U = u[i], V = v[i];
        const dU = Du*laplacian(u,x,y) - U*V*V + F*(1.0 - U);
        const dV = Dv*laplacian(v,x,y) + U*V*V - (F + k)*V;
        u2[i] = U + dU;
        v2[i] = V + dV;
      }
    }
    // swap
    [u,u2] = [u2,u];
    [v,v2] = [v2,v];
  }
  // Particle drift (optional view)
  if(params.particleVis){
    for(let i=0;i<Np;i++){
      const x = Math.max(1, Math.min(SIM_W-2, px[i]));
      const y = Math.max(1, Math.min(SIM_H-2, py[i]));
      const gx = v[idx(Math.floor(x+1),Math.floor(y))] - v[idx(Math.floor(x-1),Math.floor(y))];
      const gy = v[idx(Math.floor(x),Math.floor(y+1))] - v[idx(Math.floor(x),Math.floor(y-1))];
      px[i] += -params.mu*gx + (Math.random()-0.5)*0.1;
      py[i] += -params.mu*gy + (Math.random()-0.5)*0.1;
      if(px[i]<0) px[i]+=SIM_W; if(px[i]>=SIM_W) px[i]-=SIM_W;
      if(py[i]<0) py[i]+=SIM_H; if(py[i]>=SIM_H) py[i]-=SIM_H;
    }
  }
}

function draw(){
  // Palette: cool dark -> soft light
  for(let y=0;y<SIM_H;y++){
    for(let x=0;x<SIM_W;x++){
      const i = idx(x,y);
      const val = v[i]; // 0..1 approx
      // Smooth two-tone gradient based on v
      const t = Math.min(1, Math.max(0, val));
      // from #0b0f14 to a blend of accent colors
      const r = (1-t)*0x0b + t*0x9a;
      const g = (1-t)*0x0f + t*0xd7;
      const b = (1-t)*0x14 + t*0xfc;
      const j = i*4;
      img.data[j+0]=r; img.data[j+1]=g; img.data[j+2]=b; img.data[j+3]=255;
    }
  }
  ctx.putImageData(img,0,0);

  if(params.particleVis){
    ctx.fillStyle='rgba(255,255,255,0.7)';
    for(let i=0;i<Math.min(Np,800);i++){
      ctx.fillRect(px[i]|0, py[i]|0, 1, 1);
    }
  }
}

function loop(){
  if(!running) return;
  step();
  draw();
  raf = requestAnimationFrame(loop);
  t++;
}

function seed(cx,cy,r=6){
  for(let y=-r;y<=r;y++){
    for(let x=-r;x<=r;x++){
      const xx=cx+x, yy=cy+y;
      if(xx<0||yy<0||xx>=SIM_W||yy>=SIM_H) continue;
      if(x*x+y*y<=r*r){
        const i = idx(xx,yy);
        v[i] = 1.0; // add inhibitor locally to spark spots
      }
    }
  }
}

function resetAll(){
  cancelAnimationFrame(raf);
  init();
  running = true;
  btnPause.textContent = 'Pause';
  loop();
}

// Expose helpers for console hard reset
window.kill = function(){ running = false; cancelAnimationFrame(raf); };
window.reset = resetAll;

init();
loop();

function savePNG(){
  // upscale export
  const scale = 2;
  const tmp = document.createElement('canvas');
  tmp.width = SIM_W*scale; tmp.height = SIM_H*scale;
  const c2 = tmp.getContext('2d');
  c2.imageSmoothingEnabled = 'high';
  c2.drawImage(cvs,0,0,tmp.width,tmp.height);
  const a = document.createElement('a');
  a.download = 'rd.png';
  a.href = tmp.toDataURL('image/png');
  a.click();
}
