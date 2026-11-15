/* الحج والعمرة — محرك ثلاثي الأبعاد صغير بلا مكتبات خارجية (WebGL 1).
   كل المجسمات تُبنى برمجيًا من أشكال هندسية، وتعمل دون إنترنت.
   المحاور: Y للأعلى، الشرق +X، الشمال −Z. الوحدة: متر. */
'use strict';

const Hajj3D = (() => {
  /* ---------- رياضيات ---------- */
  const persp = (fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };
  const lookAt = (eye, target, up) => {
    const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
  };
  const mul = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  };
  const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] };

  /* ---------- بانٍ للمجسمات (مثلثات مستقلة) ---------- */
  class Builder {
    constructor() { this.p = []; this.n = []; this.c = [] }
    tri(a, b, c, col, nrm) {
      const n = nrm || norm(cross(sub(b, a), sub(c, a)));
      this.p.push(...a, ...b, ...c); this.n.push(...n, ...n, ...n); this.c.push(...col, ...col, ...col);
    }
    quad(a, b, c, d, col, nrm) { this.tri(a, b, c, col, nrm); this.tri(a, c, d, col, nrm) }
    /* صندوق مركزه (x,y,z) وأبعاده، مدوّر حول Y بزاوية ry */
    box(x, y, z, sx, sy, sz, color, ry = 0, faces) {
      const col = typeof color === 'string' ? hex(color) : color, cs = Math.cos(ry), sn = Math.sin(ry);
      const P = (dx, dy, dz) => [x + dx * cs + dz * sn, y + dy, z - dx * sn + dz * cs];
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
      const fc = faces || {};
      this.quad(v[4], v[5], v[6], v[7], fc.front || col); // +z
      this.quad(v[1], v[0], v[3], v[2], fc.back || col);  // −z
      this.quad(v[5], v[1], v[2], v[6], fc.right || col); // +x
      this.quad(v[0], v[4], v[7], v[3], fc.left || col);  // −x
      this.quad(v[3], v[7], v[6], v[2], fc.top || col);   // +y
      this.quad(v[0], v[1], v[5], v[4], col);             // −y
    }
    cylinder(x, y, z, r, h, seg, color, top = true, r2 = r) {
      const col = typeof color === 'string' ? hex(color) : color;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const p0 = [x + Math.cos(a0) * r, y, z - Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z - Math.sin(a1) * r];
        const q0 = [x + Math.cos(a0) * r2, y + h, z - Math.sin(a0) * r2], q1 = [x + Math.cos(a1) * r2, y + h, z - Math.sin(a1) * r2];
        this.quad(p0, p1, q1, q0, col);
        if (top && r2 > 0) this.tri([x, y + h, z], q0, q1, col, [0, 1, 0]);
      }
    }
    cone(x, y, z, r, h, seg, color) { this.cylinder(x, y, z, r, h, seg, color, false, 0.0001) }
    /* قطاع حلقي مسطح على ارتفاع y — زوايا بعكس عقارب الساعة من الشرق */
    ring(x, z, y, r1, r2, a0, a1, seg, color) {
      const col = typeof color === 'string' ? hex(color) : color;
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
        const A = [x + Math.cos(t0) * r1, y, z - Math.sin(t0) * r1], B = [x + Math.cos(t1) * r1, y, z - Math.sin(t1) * r1];
        const C = [x + Math.cos(t1) * r2, y, z - Math.sin(t1) * r2], D = [x + Math.cos(t0) * r2, y, z - Math.sin(t0) * r2];
        this.quad(A, D, C, B, col, [0, 1, 0]);
      }
    }
    /* جدار منحنٍ (مثل حِجر إسماعيل) */
    wallArc(x, z, r, thick, h, a0, a1, seg, color) {
      const col = typeof color === 'string' ? hex(color) : color, ri = r - thick / 2, ro = r + thick / 2;
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
        const P = (rr, t, yy) => [x + Math.cos(t) * rr, yy, z - Math.sin(t) * rr];
        this.quad(P(ro, t0, 0), P(ro, t1, 0), P(ro, t1, h), P(ro, t0, h), col);
        this.quad(P(ri, t1, 0), P(ri, t0, 0), P(ri, t0, h), P(ri, t1, h), col);
        this.quad(P(ri, t0, h), P(ro, t0, h), P(ro, t1, h), P(ri, t1, h), col, [0, 1, 0]);
      }
    }
    /* قبة/تل بيضاوي */
    dome(x, y, z, rx, ry, rz, color, seg = 18, rings = 8) {
      const col = typeof color === 'string' ? hex(color) : color;
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const v0 = j / rings * Math.PI / 2, v1 = (j + 1) / rings * Math.PI / 2, u0 = i / seg * Math.PI * 2, u1 = (i + 1) / seg * Math.PI * 2;
        const P = (u, v) => [x + Math.cos(u) * Math.cos(v) * rx, y + Math.sin(v) * ry, z - Math.sin(u) * Math.cos(v) * rz];
        const N = (u, v) => norm([Math.cos(u) * Math.cos(v) / rx, Math.sin(v) / ry, -Math.sin(u) * Math.cos(v) / rz]);
        const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
        this.tri(a, b, c, col, N((u0 + u1) / 2, (v0 + v1) / 2)); this.tri(a, c, d, col, N((u0 + u1) / 2, (v0 + v1) / 2));
      }
    }
    /* سهم مسطح على الأرض يشير إلى الزاوية dir */
    arrow(x, z, y, size, dir, color) {
      const col = typeof color === 'string' ? hex(color) : color;
      const fx = Math.cos(dir), fz = -Math.sin(dir), lx = -fz, lz = fx; // forward and left on ground
      const pt = (f, l) => [x + fx * f + lx * l, y, z + fz * f + lz * l];
      this.tri(pt(size, 0), pt(-size * 0.6, size * 0.7), pt(-size * 0.25, 0), col, [0, 1, 0]);
      this.tri(pt(size, 0), pt(-size * 0.25, 0), pt(-size * 0.6, -size * 0.7), col, [0, 1, 0]);
    }
    get count() { return this.p.length / 3 }
  }

  /* ---------- العارض ---------- */
  const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uVP;uniform vec3 uOff;varying vec3 vC;varying vec3 vN;varying float vY;
  void main(){vec3 p=aP+uOff;gl_Position=uVP*vec4(p,1.0);vC=aC;vN=aN;vY=p.y;}`;
  const FS = `precision mediump float;varying vec3 vC;varying vec3 vN;varying float vY;uniform float uGlow;uniform float uAlpha;uniform vec3 uTint;uniform float uTintMix;
  void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(0.45,0.85,0.35));float d=max(dot(n,L),0.0);float hemi=0.5+0.5*n.y;
  vec3 base=mix(vC,uTint,uTintMix);vec3 col=base*(0.38+0.32*hemi+0.55*d);col=mix(col,base,uGlow);gl_FragColor=vec4(col,uAlpha);}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  class Viewer {
    constructor(host, opts = {}) {
      this.host = host; this.opts = opts; this.light = !!opts.light;
      this.canvas = document.createElement('canvas'); this.canvas.className = 'h3d-canvas';
      this.labels = document.createElement('div'); this.labels.className = 'h3d-labels';
      host.append(this.canvas, this.labels);
      const gl = this.canvas.getContext('webgl', { antialias: !this.light, alpha: true, preserveDrawingBuffer: false });
      if (!gl) throw new Error('webgl');
      this.gl = gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      this.prog = prog;
      this.loc = { aP: gl.getAttribLocation(prog, 'aP'), aN: gl.getAttribLocation(prog, 'aN'), aC: gl.getAttribLocation(prog, 'aC'),
        uVP: gl.getUniformLocation(prog, 'uVP'), uOff: gl.getUniformLocation(prog, 'uOff'), uGlow: gl.getUniformLocation(prog, 'uGlow'),
        uAlpha: gl.getUniformLocation(prog, 'uAlpha'), uTint: gl.getUniformLocation(prog, 'uTint'), uTintMix: gl.getUniformLocation(prog, 'uTintMix') };
      this.meshes = new Map(); this.labelList = [];
      this.cam = { yaw: opts.yaw ?? -0.6, pitch: opts.pitch ?? 0.62, dist: opts.dist ?? 80, target: opts.target || [0, 4, 0], min: opts.min ?? 20, max: opts.max ?? 260 };
      this.home = { ...this.cam, target: [...this.cam.target] };
      this.time = 0; this.running = false; this.dirty = true; this.onFrame = null;
      this.bind(); this.resize();
      this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null; this.ro?.observe(host);
      this.vis = () => { if (document.hidden) this.stop(); else this.start() };
      document.addEventListener('visibilitychange', this.vis);
    }
    resize() {
      const r = this.host.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, this.light ? 1 : 2);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.dirty = true }
      this.cssW = r.width; this.cssH = r.height;
      if (!this.running) this.frame(performance.now(), true);
    }
    setMesh(name, builder, opt = {}) {
      const gl = this.gl, old = this.meshes.get(name);
      if (old) gl.deleteBuffer(old.buf);
      const n = builder.count, data = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        data.set(builder.p.slice(i * 3, i * 3 + 3), i * 9); data.set(builder.n.slice(i * 3, i * 3 + 3), i * 9 + 3); data.set(builder.c.slice(i * 3, i * 3 + 3), i * 9 + 6);
      }
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.meshes.set(name, { buf, n, alpha: opt.alpha ?? 1, glow: opt.glow ?? 0, off: opt.off || [0, 0, 0], order: opt.order ?? (opt.alpha < 1 ? 10 : 0), visible: opt.visible ?? true, tint: opt.tint || null, tintMix: 0 });
      this.dirty = true;
    }
    mesh(name) { return this.meshes.get(name) }
    label(text, pos, cls = '') {
      const el = document.createElement('span'); el.className = 'h3d-label ' + cls; el.textContent = text;
      this.labels.append(el); const item = { el, pos }; this.labelList.push(item); this.dirty = true; return item;
    }
    clearLabels() { this.labels.textContent = ''; this.labelList = [] }
    bind() {
      const c = this.canvas, pts = new Map(); let last = null, pinch = 0, tapAt = 0;
      c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY];
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]) }
        const now = Date.now(); if (pts.size === 1 && now - tapAt < 300) this.reset(); tapAt = now; });
      c.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 1 && last) { const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
          this.cam.yaw -= dx * 0.008; this.cam.pitch = Math.min(1.45, Math.max(0.12, this.cam.pitch + dy * 0.006)); this.dirty = true; this.kick(); }
        else if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoom(pinch / d); pinch = d }
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; last = pts.size === 1 ? [...pts.values()][0] : null };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)) }, { passive: false });
    }
    zoom(f) { this.cam.dist = Math.min(this.cam.max, Math.max(this.cam.min, this.cam.dist * f)); this.dirty = true; this.kick() }
    reset() { Object.assign(this.cam, { ...this.home, target: [...this.home.target] }); this.dirty = true; this.kick() }
    focus(target, dist, yaw, pitch) { this.cam.target = target; if (dist) this.cam.dist = dist; if (yaw != null) this.cam.yaw = yaw; if (pitch != null) this.cam.pitch = pitch; this.dirty = true; this.kick() }
    kick() { if (!this.running) requestAnimationFrame(t => this.frame(t, true)) }
    setLight(on) { this.light = on; this.resize(); this.dirty = true; if (on) this.stop(); else this.start() }
    start() { if (this.running || this.light || this.destroyed) return; this.running = true; const loop = t => { if (!this.running) return; this.frame(t); requestAnimationFrame(loop) }; requestAnimationFrame(loop) }
    stop() { this.running = false }
    eye() {
      const { yaw, pitch, dist, target } = this.cam;
      return [target[0] + Math.cos(pitch) * Math.cos(yaw) * dist, target[1] + Math.sin(pitch) * dist, target[2] - Math.cos(pitch) * Math.sin(yaw) * dist];
    }
    frame(t, once) {
      if (this.destroyed) return;
      this.time = t / 1000;
      if (this.onFrame) this.onFrame(this.time);
      const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.useProgram(this.prog);
      const eye = this.eye(), vp = mul(persp(0.75, w / h, Math.max(0.5, this.cam.dist / 200), this.cam.dist * 12), lookAt(eye, this.cam.target, [0, 1, 0]));
      this.vp = vp;
      gl.uniformMatrix4fv(this.loc.uVP, false, vp);
      const list = [...this.meshes.values()].filter(m => m.visible).sort((a, b) => a.order - b.order);
      for (const m of list) {
        if (m.alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false) } else { gl.disable(gl.BLEND); gl.depthMask(true) }
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
        gl.enableVertexAttribArray(this.loc.aP); gl.vertexAttribPointer(this.loc.aP, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(this.loc.aN); gl.vertexAttribPointer(this.loc.aN, 3, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(this.loc.aC); gl.vertexAttribPointer(this.loc.aC, 3, gl.FLOAT, false, 36, 24);
        gl.uniform3fv(this.loc.uOff, m.off); gl.uniform1f(this.loc.uGlow, m.glow); gl.uniform1f(this.loc.uAlpha, m.alpha);
        gl.uniform3fv(this.loc.uTint, m.tint || [1, 1, 1]); gl.uniform1f(this.loc.uTintMix, m.tint ? m.tintMix : 0);
        gl.drawArrays(gl.TRIANGLES, 0, m.n);
      }
      gl.depthMask(true);
      this.placeLabels();
      this.dirty = false;
    }
    project(p) {
      const m = this.vp; if (!m) return null;
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (w <= 0.01) return null;
      return [(x / w * 0.5 + 0.5) * this.cssW, (1 - (y / w * 0.5 + 0.5)) * this.cssH];
    }
    placeLabels() {
      for (const l of this.labelList) {
        const s = this.project(l.pos);
        if (!s || s[0] < -40 || s[1] < -20 || s[0] > this.cssW + 40 || s[1] > this.cssH + 20) { l.el.style.visibility = 'hidden'; continue }
        l.el.style.visibility = ''; l.el.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px) translate(-50%,-100%)`;
      }
    }
    destroy() {
      this.destroyed = true; this.stop(); this.ro?.disconnect(); document.removeEventListener('visibilitychange', this.vis);
      for (const m of this.meshes.values()) this.gl.deleteBuffer(m.buf);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.canvas.remove(); this.labels.remove();
    }
  }

  /* ---------- ألوان مصحفي ---------- */
  const C = { marble: '#ece6d8', marble2: '#dcd3c0', kaaba: '#16130f', gold: '#c9a35a', goldL: '#e6cf9a', green: '#2f7d5b', stone: '#6f6656',
    arch: '#d9cfbb', sand: '#cdb68f', rock: '#8a7458', tent: '#f4f1ea', path: '#c9a35a', faint: '#8d8371', road: '#5d574c' };

  /* ---------- الكعبة والمطاف ---------- */
  const KAABA = { half: 6.1, height: 13.1, rot: Math.PI / 4 };
  // أركان الكعبة (الكعبة مدوّرة 45°: الأركان باتجاه الجهات الأربع تقريبًا)
  const corner = name => { const a = { stone: 0, iraqi: Math.PI / 2, shami: Math.PI, yamani: -Math.PI / 2 }[name], r = KAABA.half * Math.SQRT2; return [Math.cos(a) * r, 0, -Math.sin(a) * r] };

  function buildKaaba(v, path) {
    const b = new Builder(), s = KAABA.half * 2, h = KAABA.height;
    b.ring(0, 0, -0.02, 0, 120, 0, Math.PI * 2, 72, C.marble2);           // ساحة المسجد
    b.ring(0, 0, 0, 0, 52, 0, Math.PI * 2, 72, C.marble);                // صحن المطاف
    b.box(0, h / 2, 0, s, h, s, C.kaaba, KAABA.rot);                     // الكعبة
    b.box(0, h * 0.72, 0, s + 0.08, 0.9, s + 0.08, C.gold, KAABA.rot);   // حزام الكسوة
    b.box(0, 0.3, 0, s + 0.9, 0.6, s + 0.9, C.marble2, KAABA.rot);       // الشاذروان
    // الباب على الجدار الشمالي الشرقي، قريبًا من ركن الحجر الأسود
    const e = corner('stone'), n = corner('iraqi'), mid = [(e[0] + n[0]) / 2, 0, (e[2] + n[2]) / 2], out = norm([mid[0], 0, mid[2]]);
    const doorAt = [mid[0] + (e[0] - mid[0]) * 0.28 + out[0] * 0.08, 0, mid[2] + (e[2] - mid[2]) * 0.28 + out[2] * 0.08];
    b.box(doorAt[0], 3.9, doorAt[2], 1.9, 3.4, 0.2, C.gold, KAABA.rot + Math.PI / 2);
    // الحجر الأسود
    const st = corner('stone'); b.box(st[0] + 0.25, 1.5, st[2], 0.5, 0.6, 0.6, '#1c1a17'); b.cylinder(st[0] + 0.32, 1.15, st[2], 0.42, 0.75, 14, '#b9b4a8', false);
    // حِجر إسماعيل: نصف دائرة خارج الجدار الشمالي الغربي
    const sh = corner('shami'), hw = [(n[0] + sh[0]) / 2, 0, (n[2] + sh[2]) / 2], ha = Math.atan2(-hw[2], hw[0]);
    const hm = [hw[0] + Math.cos(ha) * 2.6, 0, hw[2] - Math.sin(ha) * 2.6];   // مركز القوس خارج الجدار، وفتحتان عند الركنين
    b.wallArc(hm[0], hm[2], 5.6, 1.3, 1.3, ha - Math.PI / 2, ha + Math.PI / 2, 26, C.marble2);
    // مقام إبراهيم أمام الباب
    const mq = [mid[0] + out[0] * 13, 0, mid[2] + out[2] * 13];
    b.cylinder(mq[0], 0, mq[2], 1.2, 0.5, 16, C.marble2); b.box(mq[0], 1.5, mq[2], 1.2, 2, 1.2, C.goldL, KAABA.rot); b.dome(mq[0], 2.5, mq[2], 0.75, 0.6, 0.75, C.gold, 12, 4);
    // أروقة المسجد حول المطاف
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; b.box(Math.cos(a) * 56, 6, -Math.sin(a) * 56, 1.6, 12, 1.6, C.arch, -a) }
    b.ring(0, 0, 12, 54, 66, 0, Math.PI * 2, 72, C.arch);
    v.setMesh('kaaba', b);
    // خط محاذاة الحجر الأسود (بداية الشوط ونهايته)
    const line = new Builder(); line.box(st[0] + 46 / 2 + 1, 0.06, 0, 46, 0.08, 0.5, C.green);
    line.box(52.5, 2.2, 0, 0.4, 4.4, 0.4, C.green); line.box(52.5, 4.6, 0, 1.2, 0.6, 1.2, '#55c08c');
    v.setMesh('startLine', line, { glow: 0.35 });
    // الطوابق العليا لمن اختارها
    const floor = new Builder(); floor.ring(0, 0, 0, 62, 104, 0, Math.PI * 2, 72, C.arch);
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; floor.box(Math.cos(a) * 64, -4.5, -Math.sin(a) * 64, 1.2, 9, 1.2, C.arch, -a) }
    v.setMesh('floor', floor, { alpha: 0.42, visible: false, off: [0, 9, 0] });
    v.clearLabels();
    v.label('الحجر الأسود', [st[0], 3.2, st[2]], 'gold');
    v.label('الركن اليماني', [corner('yamani')[0], 3, corner('yamani')[2]]);
    v.label('حِجر إسماعيل', [hm[0] + Math.cos(ha) * 5.6, 2.4, hm[2] - Math.sin(ha) * 5.6]);
    v.label('مقام إبراهيم', [mq[0], 4, mq[2]]);
    v.label('باب الكعبة', [doorAt[0], 6.5, doorAt[2]]);
    v.label('محاذاة الحجر: بداية الشوط ونهايته', [50, 6, 0], 'green');
    setTawafPath(v, path || 'near', 0, false);
  }

  /* حلقات الأشواط السبعة: المكتمل ذهبي، الحالي يُضاء، والباقي باهت */
  function setTawafPath(v, pathKey, done, active) {
    const p = (typeof HAJJ_TAWAF_PATHS !== 'undefined' && HAJJ_TAWAF_PATHS[pathKey]) || { radius: 17, height: 0 };
    const r = p.radius, y = p.height + 0.07, gap = 0.75;
    const fl = v.mesh('floor'); if (fl) { fl.visible = p.height > 0; fl.off = [0, p.height - 0.05, 0] }
    for (let i = 0; i < 7; i++) {
      const b = new Builder(), rr = r - 3 * gap + i * gap;
      b.ring(0, 0, y + i * 0.002, rr - 0.22, rr + 0.22, 0, Math.PI * 2, 96, i < done ? C.gold : '#9a8f78');
      v.setMesh('lap' + i, b, { alpha: i < done ? 1 : 0.35, glow: i < done ? 0.45 : 0, order: 5 });
    }
    // أسهم اتجاه الطواف (عكس عقارب الساعة)
    const ar = new Builder();
    for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; ar.arrow(Math.cos(a) * (r + 2.6), -Math.sin(a) * (r + 2.6), y + 0.02, 1.1, a + Math.PI / 2, C.green) }
    v.setMesh('arrows', ar, { glow: 0.3 });
    // المؤشر المتحرك على الشوط الحالي — يوضح الاتجاه فقط، وليس موقعك
    const pulse = new Builder(), cur = Math.min(done, 6), rr = r - 3 * gap + cur * gap;
    pulse.ring(0, 0, y + 0.03, rr - 0.38, rr + 0.38, -0.32, 0, 10, C.goldL);
    v.setMesh('pulse', pulse, { glow: 0.85, order: 6, visible: active && done < 7 });
    v.tawaf = { r, y, done, active };
    v.onFrame = time => {
      const m = v.mesh('pulse'); if (!m || !m.visible) return;
      // دوران ببطء بعكس عقارب الساعة مرة كل ١٢ ثانية
      const a = (time % 12) / 12 * Math.PI * 2; m.angle = a;
      // تدوير المؤشر: نعيد البناء بزاوية بسيطة (١٠ مقاطع فقط)
      const b = new Builder(); b.ring(0, 0, y + 0.03, rr - 0.38, rr + 0.38, a - 0.32, a, 10, C.goldL);
      v.setMesh('pulse', b, { glow: 0.85, order: 6, visible: true });
    };
    v.dirty = true; v.kick();
  }

  /* ---------- المسعى ---------- */
  const SAI = { L: 395, W: 40 };
  function buildMasaa(v) {
    const b = new Builder(), L = SAI.L, W = SAI.W, zS = L / 2, zM = -L / 2;
    b.box(0, -0.25, 0, W + 30, 0.5, L + 80, C.marble2);
    b.box(0, 0.02, 0, W, 0.04, L, C.marble);
    b.box(0, 0.6, 0, 1.4, 1.2, L - 30, C.arch);                                  // الحاجز الأوسط
    for (let i = 0; i <= 26; i++) { const z = zS - i * L / 26; b.box(-W / 2 - 1, 7, z, 2, 14, 2, C.arch); b.box(W / 2 + 1, 7, z, 2, 14, 2, C.arch) }
    b.box(-W / 2 - 1, 14.3, 0, 3, 0.6, L, C.arch); b.box(W / 2 + 1, 14.3, 0, 3, 0.6, L, C.arch);
    b.dome(0, 0, zS + 8, 16, 7, 12, C.rock, 20, 7); b.dome(0, 0, zM - 6, 11, 4.5, 9, C.rock, 20, 6);
    // منطقة الهرولة بين العلمين الأخضرين (تقريبية)
    const g1 = zS - L * 0.3, g2 = zS - L * 0.45;
    for (const z of [g1, g2]) { b.box(-W / 2 - 0.2, 7, z, 0.6, 14, 2.4, C.green); b.box(W / 2 + 0.2, 7, z, 0.6, 14, 2.4, C.green); b.box(0, 13.6, z, W, 0.5, 1.2, '#55c08c') }
    v.setMesh('masaa', b);
    const zone = new Builder(); zone.box(0, 0.06, (g1 + g2) / 2, W - 2, 0.04, g1 - g2, '#3f9a70');
    v.setMesh('zone', zone, { alpha: 0.35, glow: 0.3, order: 4 });
    v.clearLabels();
    v.label('الصفا — البداية', [0, 10, zS + 6], 'gold'); v.label('المروة — النهاية', [0, 8, zM - 4], 'gold');
    v.label('منطقة الهرولة للرجال (بين العلمين الأخضرين)', [0, 16, (g1 + g2) / 2], 'green');
    v.label('مسار الذهاب ← المروة', [W / 4, 2.5, zS - 40]); v.label('مسار العودة ← الصفا', [-W / 4, 2.5, zM + 40]);
    v.sai = { zS, zM, W };
    setSaiProgress(v, 0, false);
  }
  function setSaiProgress(v, done, active) {
    const { zS, zM, W } = v.sai, L = zS - zM, ar = new Builder();
    for (let i = 1; i < 9; i++) { const z = zS - i * L / 9; ar.arrow(W / 4, z, 0.08, 2.2, Math.PI / 2, C.gold); ar.arrow(-W / 4, z, 0.08, 2.2, -Math.PI / 2, C.faint) }
    v.setMesh('arrowsSai', ar, { glow: 0.3 });
    const going = done % 2 === 0, lane = new Builder();
    lane.box(going ? W / 4 : -W / 4, 0.07, 0, W / 2 - 3, 0.03, L - 10, C.gold);
    v.setMesh('lane', lane, { alpha: 0.28, glow: 0.4, order: 5, visible: active && done < 7 });
    // سبع علامات للأشواط عند الجانب
    const ticks = new Builder();
    for (let i = 0; i < 7; i++) { const z = zS - 30 - i * 8; ticks.cylinder(W / 2 + 6, 0, z, 1.6, 0.5, 14, i < done ? C.gold : '#9a8f78') }
    v.setMesh('ticks', ticks, { glow: 0.4 });
    v.saiState = { done, active };
    v.onFrame = time => {
      const m = v.mesh('pulseSai'); if (!active || done >= 7) { if (m) m.visible = false; return }
      const k = (time % 8) / 8, z = going ? zS - 8 - k * (L - 16) : zM + 8 + k * (L - 16);
      const b = new Builder(); b.cylinder(going ? W / 4 : -W / 4, 0.1, z, 2, 0.25, 16, C.goldL);
      v.setMesh('pulseSai', b, { glow: 0.9, order: 6 });
    };
    v.dirty = true; v.kick();
  }

  /* ---------- مواقع الحج (مجسمات تعليمية مبسطة) ---------- */
  function hills(b, list, color) { for (const [x, z, r, h] of list) b.dome(x, 0, z, r, h, r * 0.9, color, 14, 6) }

  function buildMina(v) {
    const b = new Builder();
    b.box(0, -0.3, 0, 900, 0.6, 600, C.sand);
    hills(b, [[-470, -330, 70, 40], [470, -330, 80, 45], [0, -360, 75, 34], [-480, 320, 60, 30], [480, 330, 70, 42]], C.rock);
    for (let ix = -16; ix <= 16; ix++) for (let iz = -9; iz <= 9; iz++) {
      if (Math.abs(ix) < 2 && Math.abs(iz) < 2) continue;
      const x = ix * 22 + 60, z = iz * 22;
      b.box(x, 1.6, z, 14, 3.2, 14, C.tent); b.cone(x, 3.2, z, 8, 3.2, 4, C.tent);
    }
    b.box(-330, 6, 0, 80, 12, 60, '#e8e0cf'); b.cylinder(-300, 0, -24, 2.6, 34, 10, C.goldL); // مسجد الخيف
    b.box(-420, 5, -20, 30, 10, 240, '#d8cfbb');                                              // جسر الجمرات
    v.setMesh('site', b);
    v.clearLabels(); v.label('خيام منى', [60, 12, 0], 'gold'); v.label('مسجد الخيف', [-330, 40, 0]); v.label('منشأة الجمرات', [-420, 18, -20]);
    v.focus([-60, 0, 0], 780, -0.95, 0.78); v.home = { ...v.cam, target: [0, 0, 0] };
  }
  function buildArafah(v) {
    const b = new Builder();
    b.box(0, -0.3, 0, 1400, 0.6, 1000, C.sand);
    b.dome(-140, 0, -120, 70, 55, 60, C.rock, 18, 8);                                   // جبل الرحمة
    b.box(-140, 55, -120, 3, 10, 3, '#efe7d6');
    b.box(380, 9, 140, 120, 18, 80, '#ece4d3'); for (const [dx, dz] of [[-60, -40], [60, -40], [-60, 40], [60, 40], [0, -40], [0, 40]]) b.cylinder(380 + dx, 0, 140 + dz, 2.5, 50, 10, C.goldL); // مسجد نمرة
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, x = Math.cos(a) * 560, z = -Math.sin(a) * 400; b.box(x, 4, z, 3, 8, 3, '#d9a441') }        // علامات الحدود
    for (let i = 0; i < 160; i++) { const x = ((i * 97) % 900) - 450, z = ((i * 53) % 600) - 300; if (Math.hypot(x + 140, z + 120) < 110) continue; b.box(x, 2, z, 18, 4, 14, C.tent) }
    v.setMesh('site', b);
    v.clearLabels(); v.label('جبل الرحمة', [-140, 72, -120], 'gold'); v.label('مسجد نمرة (مقدمته خارج عرفة)', [380, 58, 140]); v.label('حدود عرفة — تأكد أنك داخلها', [560, 14, 0], 'green');
    v.focus([60, 0, 0], 1250, -0.7, 0.72); v.home = { ...v.cam, target: [0, 0, 0] };
  }
  function buildMuzdalifah(v) {
    const b = new Builder();
    b.box(0, -0.3, 0, 1200, 0.6, 800, C.sand);
    hills(b, [[-560, -370, 80, 45], [560, -370, 80, 40], [-560, 370, 70, 36], [560, 370, 85, 48]], C.rock);
    b.box(0, 8, 0, 90, 16, 60, '#ece4d3'); b.cylinder(-40, 0, -26, 2.6, 46, 10, C.goldL); b.cylinder(40, 0, -26, 2.6, 46, 10, C.goldL); // المشعر الحرام
    for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; b.box(Math.cos(a) * 470, 4, -Math.sin(a) * 300, 3, 8, 3, '#d9a441') }
    for (let i = 0; i < 220; i++) { const x = ((i * 89) % 820) - 410, z = ((i * 41) % 520) - 260; if (Math.hypot(x, z) < 80) continue; b.box(x, 0.2, z, 6, 0.4, 3, '#e9e2d2') }
    v.setMesh('site', b);
    v.clearLabels(); v.label('المشعر الحرام', [0, 52, 0], 'gold'); v.label('حدود مزدلفة', [470, 14, 0], 'green');
    v.focus([0, 0, 0], 1050, -0.6, 0.72); v.home = { ...v.cam, target: [0, 0, 0] };
  }
  function buildJamarat(v, mode) {
    const b = new Builder(), xs = { sughra: 120, wusta: 0, aqaba: -150 };
    b.box(0, -0.3, 0, 520, 0.6, 220, C.sand);
    const deck = new Builder();
    for (let lvl = 0; lvl < 3; lvl++) deck.box(0, 16 * (lvl + 1), 0, 420, 0.8, 80, '#d8cfbb');
    for (let i = -6; i <= 6; i++) for (const z of [-38, 38]) b.box(i * 32, 24, z, 2, 48, 2, '#cfc5af');
    const sel = mode === 'aqaba' ? ['aqaba'] : ['sughra', 'wusta', 'aqaba'];
    for (const [k, x] of Object.entries(xs)) {
      const on = sel.includes(k);
      b.wallArc(x, 0, 14, 1.2, 1.2, 0, Math.PI * 2, 36, on ? C.gold : C.faint);       // الحوض
      b.box(x, 26, 0, 4, 52, 26, on ? '#7a6a52' : '#a59b88');                         // الشاخص (جدار ممتد)
    }
    v.setMesh('site', b); v.setMesh('deck', deck, { alpha: 0.22 });
    v.clearLabels();
    v.label('الجمرة الصغرى' + (mode === 'aqaba' ? '' : ' — الأولى'), [xs.sughra, 58, 0], mode === 'aqaba' ? '' : 'gold');
    v.label('الجمرة الوسطى' + (mode === 'aqaba' ? '' : ' — الثانية'), [xs.wusta, 58, 0], mode === 'aqaba' ? '' : 'gold');
    v.label('جمرة العقبة' + (mode === 'aqaba' ? ' — وحدها يوم النحر' : ' — الثالثة'), [xs.aqaba, 58, 0], 'gold');
    v.focus([0, 18, 0], 470, -1.2, 0.62); v.home = { ...v.cam, target: [0, 20, 0] };
  }

  function create(host, scene, opts = {}) {
    const isK = scene === 'kaaba', isS = scene === 'masaa';
    const v = new Viewer(host, {
      light: opts.light, yaw: isK ? -0.75 : isS ? -1.32 : -0.8, pitch: isK ? 0.55 : isS ? 0.78 : 0.6,
      dist: isK ? 88 : isS ? 430 : 600, target: isK ? [0, 3, 0] : [0, 0, 0], min: isK ? 22 : isS ? 60 : 120, max: isK ? 300 : isS ? 900 : 1600
    });
    if (isK) buildKaaba(v, opts.path);
    else if (isS) buildMasaa(v);
    else if (scene === 'mina') buildMina(v);
    else if (scene === 'arafah') buildArafah(v);
    else if (scene === 'muzdalifah') buildMuzdalifah(v);
    else if (scene === 'jamarat') buildJamarat(v, opts.mode);
    v.start(); v.kick();
    return v;
  }

  function supported() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl')) } catch (e) { return false } }

  return { create, supported, setTawafPath, setSaiProgress, Builder };
})();
