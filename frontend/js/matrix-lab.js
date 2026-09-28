/* =========================================================================
   matrix-lab.js
   Live linear-algebra playground (2D plane / 3D space) built with Three.js.
   Self-contained IIFE — exposes only window.MatrixLab for debugging.
   Mounted permanently on the Simulator page, next to the circuit builder,
   so it is visible without switching tabs (per the "one canvas" design).
   ========================================================================= */
(function MatrixLab() {
  const $ = (id) => document.getElementById(id);
  const pageEl = $("page-matrix");
  const stage = $("labStage");
  const canvas = $("matrixCanvas");
  const layoutEl = $("labLayout");
  const labelLayer = $("labLabels");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    stage.innerHTML = '<div class="webgl-fail">WebGL isn\'t available in this browser, so the live scene can\'t start. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration on.</div>';
    return;
  }
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const EASE_RATE = 13, CAM_RATE = 9; // exponential easing speed (per second), frame-rate independent

  /* ---- palette (axis colours follow the reference: x green, y red, z blue) ---- */
  const HEX = { x: 0x83c167, y: 0xfc6255, z: 0x58c4dd, v: 0xf4f1ff, mv: 0xffd84d, cell: 0xa78bfa };
  const CSSC = { x: "#83c167", y: "#fc6255", z: "#58c4dd", v: "#f4f1ff", mv: "#ffd84d" };

  /* ---- small math helpers ---- */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const cloneM = (M) => M.map((r) => r.slice());
  const IDENT = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mulVec = (M, v) => ({
    x: M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z,
    y: M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z,
    z: M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z,
  });
  const len3 = (v) => Math.hypot(v.x, v.y, v.z);
  const det2 = (M) => M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const det3 = (M) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const f2 = (n) => { const s = Number(n.toFixed(2)); return (Object.is(s, -0) ? 0 : s).toString(); };
  const col = (M, c) => ({ x: M[0][c], y: M[1][c], z: M[2][c] });
  const seq = (from, to, step) => { const a = []; for (let v = from; v <= to + 1e-9; v += step) a.push(+v.toFixed(6)); return a; };

  /* ---- scene graph ---- */
  const scene = new THREE.Scene();
  const g2 = new THREE.Group();   // things that only exist in 2D
  const g3 = new THREE.Group();   // things that only exist in 3D
  const gAll = new THREE.Group(); // shared: vectors, handle, boxes
  scene.add(g2, g3, gAll);

  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam2.position.set(0, 0, 20);
  const cam3 = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  cam3.up.set(0, 0, 1);

  /* camera state (the "goal" copies are what presets and sliders ease toward) */
  const V2 = { cx: 0, cy: 0, half: 4.5 };
  const DIST0 = 17; // default camera distance: fits the ±6 floor grid comfortably
  const V3 = { az: rad(40), el: rad(28), dist: DIST0, tx: 0, ty: 0, tz: 0 };
  const G3 = Object.assign({}, V3);
  const VIEWS = {
    iso:   { az: rad(40),  el: rad(28) },
    top:   { az: rad(-90), el: rad(89) },   // x to the right, y up the screen
    front: { az: rad(-90), el: 0 },         // looking along +y, x to the right
    side:  { az: 0,        el: 0 },         // looking along -x, y to the right
  };

  /* ---- geometry helpers ---- */
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  class Arrow {
    constructor(color, o) {
      this.o = Object.assign({ shaft: 0.03, head: 0.2, headR: 0.08 }, o || {});
      this.group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color });
      this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), mat);
      this.head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18), mat);
      this.group.add(this.shaft, this.head);
    }
    update(v, s, z) {
      const L = Math.hypot(v.x, v.y, v.z);
      this.group.visible = L > 1e-3;
      if (!this.group.visible) return;
      this.group.position.set(0, 0, z || 0);
      this.group.quaternion.setFromUnitVectors(Y_AXIS, _dir.set(v.x / L, v.y / L, v.z / L));
      const headLen = this.o.head * s;
      const hl = Math.min(headLen, L * 0.6);
      const k = hl / headLen;
      const sl = Math.max(L - hl, 1e-4);
      const sr = this.o.shaft * s;
      const hr = this.o.headR * s * k;
      this.shaft.scale.set(sr, sl, sr);
      this.shaft.position.y = sl / 2;
      this.head.scale.set(hr, hl, hr);
      this.head.position.y = sl + hl / 2;
    }
  }

  function dynLines(nVerts, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    obj.frustumCulled = false;
    return obj;
  }
  function staticLines(arr, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    obj.frustumCulled = false;
    return obj;
  }
  function gridArray(coords, extent, z) {
    const out = [];
    coords.forEach((c) => out.push(c, -extent, z, c, extent, z, -extent, c, z, extent, c, z));
    return new Float32Array(out);
  }
  function fillLines(obj, pts) { // pts: array of [x,y,z] pairs flattened
    const a = obj.geometry.attributes.position;
    a.array.set(pts);
    a.needsUpdate = true;
  }

  const BOX_EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const CUBE_TRIS = [0,1,3, 0,3,2, 4,5,7, 4,7,6, 0,1,5, 0,5,4, 2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,3,7, 1,7,5];

  /* ---------- 2D group ---------- */
  const Z2 = { base: -0.03, warp: -0.02, fill: -0.015, cellEdge: -0.01, axis: -0.005, basis: 0.01, mv: 0.02, v: 0.03, handle: 0.04 };

  const grid2Major = staticLines(gridArray(seq(-40, 40, 1).filter((c) => c !== 0), 40, Z2.base), 0x2a86a8, 0.34);
  const grid2Minor = staticLines(gridArray(seq(-39.5, 39.5, 1), 40, Z2.base), 0x2a86a8, 0.14);
  g2.add(grid2Major, grid2Minor);

  const axisMat2 = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const axisX2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), axisMat2);
  const axisY2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), axisMat2);
  axisX2.position.z = axisY2.position.z = Z2.axis;
  g2.add(axisX2, axisY2);

  const W2_N = 20;
  const warp2Base = gridArray(seq(-W2_N, W2_N, 1), W2_N, 0);
  const warp2 = dynLines(warp2Base.length / 3, 0x58c4dd, 0.9);
  g2.add(warp2);

  const unit2 = staticLines(new Float32Array([0,0,0, 1,0,0, 1,0,0, 1,1,0, 1,1,0, 0,1,0, 0,1,0, 0,0,0]), 0xffffff, 0.35);
  unit2.position.z = Z2.cellEdge;
  g2.add(unit2);
  const cellGeo2 = new THREE.BufferGeometry();
  cellGeo2.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  cellGeo2.setIndex([0, 1, 2, 0, 2, 3]);
  const cellFill2 = new THREE.Mesh(cellGeo2, new THREE.MeshBasicMaterial({ color: HEX.cell, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  cellFill2.frustumCulled = false;
  cellFill2.position.z = Z2.fill;
  const cellEdge2 = dynLines(8, HEX.cell, 1);
  cellEdge2.position.z = Z2.cellEdge;
  g2.add(cellFill2, cellEdge2);

  /* ---------- 3D group ---------- */
  const FLOOR_N = 6;
  g3.add(staticLines(gridArray(seq(-FLOOR_N, FLOOR_N, 1), FLOOR_N, 0), 0x9aa3c7, 0.3));
  const W3_N = FLOOR_N;
  const warp3Base = gridArray(seq(-W3_N, W3_N, 1), W3_N, 0);
  const warp3 = dynLines(warp3Base.length / 3, 0x58c4dd, 0.45);
  g3.add(warp3);

  const AX_LEN = 6;
  const axisArrows = [];
  [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach((d) => {
    const a = new Arrow(0xa8a8a8, { shaft: 0.012, head: 0.28, headR: 0.085 });
    a.dir = { x: d[0] * AX_LEN, y: d[1] * AX_LEN, z: d[2] * AX_LEN };
    axisArrows.push(a);
    g3.add(a.group);
  });
  (function buildTicks() {
    const t = [], h = 0.1;
    for (let k = -FLOOR_N; k <= FLOOR_N; k++) {
      if (!k) continue;
      t.push(k, -h, 0, k, h, 0, k, 0, -h, k, 0, h);   // on x
      t.push(-h, k, 0, h, k, 0, 0, k, -h, 0, k, h);   // on y
      t.push(-h, 0, k, h, 0, k, 0, -h, k, 0, h, k);   // on z
    }
    g3.add(staticLines(new Float32Array(t), 0x9c9c9c, 0.9));
  })();

  const unit3 = (function () {
    const a = [];
    BOX_EDGES.forEach(([i, j]) => a.push(i & 1, (i >> 1) & 1, (i >> 2) & 1, j & 1, (j >> 1) & 1, (j >> 2) & 1));
    return staticLines(new Float32Array(a), 0xffffff, 0.3);
  })();
  g3.add(unit3);
  const cellGeo3 = new THREE.BufferGeometry();
  cellGeo3.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24), 3));
  cellGeo3.setIndex(CUBE_TRIS);
  const cellFill3 = new THREE.Mesh(cellGeo3, new THREE.MeshBasicMaterial({ color: HEX.cell, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  cellFill3.frustumCulled = false;
  const cellEdge3 = dynLines(24, HEX.cell, 1);
  g3.add(cellFill3, cellEdge3);

  /* ---------- shared: vectors, handle, projection boxes ---------- */
  const arrV = new Arrow(HEX.v, { shaft: 0.034, head: 0.24, headR: 0.09 });
  const arrMv = new Arrow(HEX.mv, { shaft: 0.04, head: 0.26, headR: 0.1 });
  const arrBasis = [
    new Arrow(HEX.x, { shaft: 0.026, head: 0.2, headR: 0.075 }),
    new Arrow(HEX.y, { shaft: 0.026, head: 0.2, headR: 0.075 }),
    new Arrow(HEX.z, { shaft: 0.026, head: 0.2, headR: 0.075 }),
  ];
  gAll.add(arrV.group, arrMv.group, ...arrBasis.map((a) => a.group));

  const handle = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }));
  const hit = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  gAll.add(handle, halo, hit);

  const boxV = dynLines(24, 0xd8d8e6, 0.5);
  const boxMv = dynLines(24, HEX.mv, 0.5);
  gAll.add(boxV, boxMv);

  /* ---------- state ---------- */
  let mode = "3d";
  let M = [[1.2, -0.6, 0], [0.6, 1.2, 0], [0, 0, 1]]; // the matrix the person is editing
  let Mc = cloneM(M);                                 // eased copy that is actually drawn
  const vec = { x: 2, y: 1.5, z: 3 };
  const vc = { x: 2, y: 1.5, z: 3 };                    // eased vector
  let morphT = 1, morphPlaying = false, morphStart = 0;
  let autoRot = false;
  let vectorMode = true; // true: axes/grid stay fixed, only Mv moves. false: whole space warps.
  let dirty = true;
  const opts = {
    "2d": { grid: true, basis: true, cell: true, box: false },
    "3d": { grid: true, basis: true, cell: false, box: true },
  };
  let W = 1, H = 1;

  const is2 = () => mode === "2d";
  const dim = () => (is2() ? 2 : 3);
  const targetMatrix = () => (is2() ? [[M[0][0], M[0][1], 0], [M[1][0], M[1][1], 0], [0, 0, 1]] : M);
  const targetVec = () => (is2() ? { x: vec.x, y: vec.y, z: 0 } : vec);
  const blend = (A, t) => A.map((row, r) => row.map((val, c) => (r === c ? 1 : 0) + t * (val - (r === c ? 1 : 0))));

  /* ---------- HTML labels ---------- */
  function mk(cls, html) {
    const d = document.createElement("div");
    d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    labelLayer.appendChild(d);
    return d;
  }
  const axLbl = {
    x: mk("axis-lbl", "x"), y: mk("axis-lbl", "y"), z: mk("axis-lbl", "z"),
  };
  axLbl.x.style.color = CSSC.x; axLbl.y.style.color = CSSC.y; axLbl.z.style.color = CSSC.z;
  const vLbl = mk("vlabel v");
  const mvLbl = mk("vlabel mv");
  const ticks = [];
  for (let i = 0; i < 90; i++) ticks.push(mk("tick-lbl", ""));

  const proj = new THREE.Vector3();
  function toScreen(x, y, z, cam) {
    proj.set(x, y, z).project(cam);
    return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, behind: proj.z > 1 || proj.z < -1 };
  }
  function place(el, x, y, ax, ay) { // ax/ay: anchor fractions of the element size
    el.style.display = "";
    if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
    const px = clamp(x - el._w * ax, 4, Math.max(4, W - el._w - 4));
    const py = clamp(y - el._h * ay, 4, Math.max(4, H - el._h - 4));
    el.style.transform = `translate(${px}px, ${py}px)`;
  }
  const hide = (el) => { el.style.display = "none"; };
  const setText = (el, txt) => { if (el.textContent !== txt) { el.textContent = txt; el._w = 0; } };

  function setBracket(el, p, n) {
    const rows = [["x", p.x], ["y", p.y], ["z", p.z]].slice(0, n)
      .map(([a, val]) => `<span style="color:${CSSC[a]}">${f2(val)}</span>`).join("");
    el.innerHTML = `<div class="vl-col">${rows}</div>`;
    el._w = 0;
  }

  /* ---------- legend + hint ---------- */
  const legendEl = $("labLegend");
  const hintEl = $("labHint");
  function buildLegend() {
    const items = [["v", CSSC.v], ["Mv", CSSC.mv], ["Mx̂", CSSC.x], ["Mŷ", CSSC.y]];
    if (!is2()) items.push(["Mẑ", CSSC.z]);
    legendEl.innerHTML = items.map(([t, c]) => `<span><i class="swatch" style="background:${c}"></i>${t}</span>`).join("");
    hintEl.textContent = is2()
      ? "Drag to pan · scroll to zoom · drag the white dot to move v"
      : "Drag to orbit · shift-drag to pan · scroll to zoom · drag the white dot to move v";
  }

  /* ---------- circuit ↔ matrix lab bridge ---------- */
  const syncBanner = $("syncBanner");
  const syncBannerText = $("syncBannerText");
  $("syncClearBtn").addEventListener("click", () => { syncBanner.hidden = true; });

  const applyGateRow = $("applyGateRow");
  const applyGateName = $("applyGateName");
  const applyGateQubit = $("applyGateQubit");
  // Same numbers as the PRESETS_3D entries below — kept as their own small
  // table so matching doesn't depend on preset array order/labels.
  const RT = Math.SQRT1_2;
  const GATE_MATRICES = {
    H:   [[0, 0, 1], [0, -1, 0], [1, 0, 0]],
    X:   [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
    Y:   [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    Z:   [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
    S:   [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    Sdg: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
    T:   [[RT, -RT, 0], [RT, RT, 0], [0, 0, 1]],
    Tdg: [[RT, RT, 0], [-RT, RT, 0], [0, 0, 1]],
    SX:  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  };
  // board labels (S†, √X ...) come from circuit-builder.js, which loads first
  const gateLabel = (n) => (typeof GATE_LABEL !== "undefined" && GATE_LABEL[n]) || n;
  function matchedGateName() {
    if (is2()) return null;
    for (const name of Object.keys(GATE_MATRICES)) {
      const G = GATE_MATRICES[name];
      let close = true;
      for (let i = 0; i < 3 && close; i++) for (let j = 0; j < 3; j++) {
        if (Math.abs(M[i][j] - G[i][j]) > 0.01) { close = false; break; }
      }
      if (close) return name;
    }
    return null;
  }
  function syncGateMatch() {
    const name = matchedGateName();
    applyGateRow.hidden = !name;
    if (name) applyGateName.textContent = gateLabel(name);
  }
  $("applyGateBtn").addEventListener("click", () => {
    const name = matchedGateName();
    if (!name) return;
    // addGateToQubit lives in circuit-builder.js, loaded before this file.
    if (typeof addGateToQubit === "function") addGateToQubit(name, parseInt(applyGateQubit.value, 10));
  });

  /* ---------- readouts ---------- */
  const ro = {
    v: $("roV"), mv: $("roMv"), lv: $("roLenV"), lmv: $("roLenMv"), det: $("roDet"), detLbl: $("roDetLbl"),
    c0: $("roCol0"), c1: $("roCol1"), c2: $("roCol2"), note: $("roNote"), morph: $("roMorph"),
  };
  const tup = (p, n) => "(" + [p.x, p.y, p.z].slice(0, n).map(f2).join(", ") + ")";

  function describe(T, n) {
    const A = T.slice(0, n).map((r) => r.slice(0, n));
    const det = n === 2 ? det2(A) : det3(A);
    const unitWord = n === 2 ? "areas" : "volumes";
    let orth = true, ident = true;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let dot = 0;
      for (let k = 0; k < n; k++) dot += A[k][i] * A[k][j];
      if (Math.abs(dot - (i === j ? 1 : 0)) > 0.02) orth = false;
      if (Math.abs(A[i][j] - (i === j ? 1 : 0)) > 0.005) ident = false;
    }
    const k0 = A[0][0];
    let uniform = true;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.abs(A[i][j] - (i === j ? k0 : 0)) > 0.005) uniform = false;

    if (Math.abs(det) < 1e-3) return { det, text: n === 2
      ? "det = 0: the whole plane is squashed onto a line (or a point). Information is lost, so no matrix can undo this."
      : "det = 0: space is squashed onto a plane, a line or a point. Information is lost, so no matrix can undo this." };
    if (ident) return { det, text: "Identity: nothing moves." };
    if (uniform && k0 > 0) return { det, text: `Uniform scaling by ${f2(k0)}: lengths grow ${f2(k0)}× and ${unitWord} grow ${f2(Math.abs(det))}×.` };
    if (orth) return { det, text: det > 0
      ? "A pure rotation: lengths, angles and the size of the unit cell are all preserved."
      : "A reflection: lengths and angles survive, but orientation flips (det is negative)." };
    return { det, text: `${unitWord[0].toUpperCase() + unitWord.slice(1)} scale by ${f2(Math.abs(det))}×${det < 0 ? " and orientation flips" : ""}. Lengths or angles change, so this is more than a rotation.` };
  }

  function updateReadouts() {
    const n = dim();
    const T = targetMatrix(), v = targetVec();
    const out = mulVec(T, v);
    ro.v.textContent = tup(v, n);
    ro.mv.textContent = tup(out, n);
    ro.lv.textContent = f2(len3(v));
    ro.lmv.textContent = f2(len3(out));
    const d = describe(T, n);
    ro.detLbl.textContent = n === 2 ? "det 2×2" : "det";
    ro.det.textContent = f2(d.det);
    ro.c0.textContent = tup(col(T, 0), n);
    ro.c1.textContent = tup(col(T, 1), n);
    ro.c2.textContent = tup(col(T, 2), 3);
    ro.note.textContent = d.text;
    ro.morph.hidden = morphT >= 0.999;
    ro.morph.textContent = `Previewing the morph at t = ${f2(morphT)}. The numbers above show the finished transformation.`;
    setBracket(vLbl, v, n);
    setBracket(mvLbl, out, n);
    syncGateMatch();
    dirty = true;
  }

  /* ---------- UI: matrix, vector, presets ---------- */
  const matrixGrid = $("matrixGrid");
  const matrixInputs = [[], [], []];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const inp = document.createElement("input");
      inp.type = "number"; inp.step = "0.1"; inp.value = M[r][c];
      inp.className = "c" + c;
      inp.setAttribute("aria-label", `Matrix row ${r + 1}, column ${c + 1}`);
      inp.addEventListener("input", () => { M[r][c] = parseFloat(inp.value) || 0; updateReadouts(); });
      matrixGrid.appendChild(inp);
      matrixInputs[r][c] = inp;
    }
  }
  function syncMatrixInputs() {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      matrixInputs[r][c].value = +M[r][c].toFixed(4);
      matrixInputs[r][c].disabled = is2() && (r === 2 || c === 2);
    }
  }

  const vecFields = {};
  const vectorControls = $("vectorControls");
  ["x", "y", "z"].forEach((axis) => {
    const row = document.createElement("div");
    row.className = "vector-row";
    const label = document.createElement("label");
    label.textContent = axis; label.style.color = CSSC[axis];
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "-4"; slider.max = "4"; slider.step = "0.05"; slider.value = vec[axis];
    slider.setAttribute("aria-label", `Vector ${axis} component`);
    const out = document.createElement("output");
    out.textContent = f2(vec[axis]);
    slider.addEventListener("input", () => {
      vec[axis] = parseFloat(slider.value);
      out.textContent = f2(vec[axis]);
      Object.assign(vc, targetVec());
      updateReadouts();
    });
    row.append(label, slider, out);
    vectorControls.appendChild(row);
    vecFields[axis] = { slider, out };
  });
  function syncVectorUI() {
    ["x", "y", "z"].forEach((a) => {
      vecFields[a].slider.value = vec[a];
      vecFields[a].out.textContent = f2(vec[a]);
      vecFields[a].slider.disabled = is2() && a === "z";
    });
  }

  const z3 = (a) => [[a[0][0], a[0][1], 0], [a[1][0], a[1][1], 0], [0, 0, 1]];
  const S = Math.SQRT1_2;
  const PRESETS_3D = [
    { name: "Spin & stretch", M: [[1.2, -0.6, 0], [0.6, 1.2, 0], [0, 0, 1]], gen: true },
    { name: "Identity", M: IDENT() },
    { name: "Pauli-X", M: [[1, 0, 0], [0, -1, 0], [0, 0, -1]] },
    { name: "Pauli-Y", M: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]] },
    { name: "Pauli-Z", M: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]] },
    { name: "Hadamard", M: [[0, 0, 1], [0, -1, 0], [1, 0, 0]] },
    { name: "S (90° Z)", M: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
    { name: "S† (−90° Z)", M: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] },
    { name: "T (45° Z)", M: [[S, -S, 0], [S, S, 0], [0, 0, 1]] },
    { name: "T† (−45° Z)", M: [[S, S, 0], [-S, S, 0], [0, 0, 1]] },
    { name: "√X (90° X)", M: [[1, 0, 0], [0, 0, -1], [0, 1, 0]] },
    { name: "Scale ×2", M: [[2, 0, 0], [0, 2, 0], [0, 0, 2]], gen: true },
    { name: "Flatten to XY", M: [[1, 0, 0], [0, 1, 0], [0, 0, 0]], gen: true },
    { name: "Shear", M: [[1, 0, 0.6], [0, 1, 0], [0, 0, 1]], gen: true },
  ];
  const PRESETS_2D = [
    { name: "Spin & stretch", M: z3([[1.2, -0.6], [0.6, 1.2]]), gen: true },
    { name: "Identity", M: IDENT() },
    { name: "Rotate 90°", M: z3([[0, -1], [1, 0]]) },
    { name: "Rotate 45°", M: z3([[S, -S], [S, S]]) },
    { name: "Reflect in x-axis", M: z3([[1, 0], [0, -1]]) },
    { name: "Scale ×2", M: z3([[2, 0], [0, 2]]), gen: true },
    { name: "Stretch x", M: z3([[2, 0], [0, 1]]), gen: true },
    { name: "Shear", M: z3([[1, 1], [0, 1]]), gen: true },
    { name: "Squash to a line", M: z3([[1, 1], [0.5, 0.5]]), gen: true },
  ];
  const presetRow = $("presetRow");
  function buildPresets() {
    presetRow.innerHTML = "";
    (is2() ? PRESETS_2D : PRESETS_3D).forEach((p) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-chip" + (p.gen ? " gen" : "");
      chip.textContent = p.name;
      chip.addEventListener("click", () => {
        M = cloneM(p.M);
        syncMatrixInputs();
        updateReadouts();
      });
      presetRow.appendChild(chip);
    });
  }

  /* ---------- UI: transformation options ---------- */
  const optEls = { grid: $("optGrid"), basis: $("optBasis"), cell: $("optCell"), box: $("optBox") };
  Object.keys(optEls).forEach((k) => optEls[k].addEventListener("change", () => { opts[mode][k] = optEls[k].checked; dirty = true; }));
  function syncOptions() {
    Object.keys(optEls).forEach((k) => { optEls[k].checked = opts[mode][k]; });
    $("optCellLbl").textContent = is2() ? "Unit square (area)" : "Unit cube (volume)";
  }

  const morphRange = $("morphRange"), morphOut = $("morphOut"), playBtn = $("playBtn");
  function setMorph(t) {
    morphT = clamp(t, 0, 1);
    morphRange.value = morphT;
    morphOut.textContent = morphT.toFixed(2);
    ro.morph.hidden = morphT >= 0.999;
    ro.morph.textContent = `Previewing the morph at t = ${f2(morphT)}. The numbers above show the finished transformation.`;
    dirty = true;
  }
  morphRange.addEventListener("input", () => { morphPlaying = false; setMorph(parseFloat(morphRange.value)); });
  playBtn.addEventListener("click", () => { setMorph(0); morphPlaying = true; morphStart = performance.now(); });

  /* ---------- UI: camera ---------- */
  const camAz = $("camAz"), camEl = $("camEl"), camDist = $("camDist");
  const camAzOut = $("camAzOut"), camElOut = $("camElOut"), camDistOut = $("camDistOut");
  function syncCameraUI() {
    const az = ((deg(V3.az) % 360) + 360) % 360;
    camAz.value = az; camAzOut.textContent = Math.round(az) + "°";
    camEl.value = deg(V3.el); camElOut.textContent = Math.round(deg(V3.el)) + "°";
    camDist.value = V3.dist; camDistOut.textContent = V3.dist.toFixed(1);
  }
  const setBoth = (k, val) => { V3[k] = val; G3[k] = val; dirty = true; };
  camAz.addEventListener("input", () => setBoth("az", rad(parseFloat(camAz.value))));
  camEl.addEventListener("input", () => setBoth("el", rad(parseFloat(camEl.value))));
  camDist.addEventListener("input", () => setBoth("dist", parseFloat(camDist.value)));
  $("autoRot").addEventListener("change", (e) => { autoRot = e.target.checked; dirty = true; });
  $("viewChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    const v = VIEWS[b.dataset.view];
    G3.az = v.az; G3.el = v.el; G3.dist = DIST0; G3.tx = G3.ty = G3.tz = 0;
    dirty = true;
  });
  $("resetViewBtn").addEventListener("click", () => {
    if (is2()) { V2.cx = 0; V2.cy = 0; V2.half = 4.5; }
    else { Object.assign(G3, { az: VIEWS.iso.az, el: VIEWS.iso.el, dist: DIST0, tx: 0, ty: 0, tz: 0 }); }
    dirty = true;
  });

  /* ---------- mode switch ---------- */
  function setMode(next) {
    mode = next;
    $("modeBtn2D").classList.toggle("active", is2());
    $("modeBtn3D").classList.toggle("active", !is2());
    layoutEl.classList.toggle("mode-3d", !is2());
    syncMatrixInputs(); syncVectorUI(); syncOptions(); buildPresets(); buildLegend(); syncCameraUI();
    updateReadouts();
  }
  $("modeBtn2D").addEventListener("click", () => setMode("2d"));
  $("modeBtn3D").addEventListener("click", () => setMode("3d"));
  // Matrix Lab is permanently mounted now (no tab switch), so there's no
  // #tabMatrixBtn to bind to anymore — resize() already runs once at boot
  // below, and window resize is handled separately.

  /* ---------- pointer interaction ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPt = new THREE.Vector3();
  const dragOff = new THREE.Vector3();
  const pointers = new Map();
  let action = null, pinchDist = 0, pinchMid = { x: 0, y: 0 };
  const activeCam = () => (is2() ? cam2 : cam3);

  function setNDC(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function overHandle(e) {
    setNDC(e);
    ray.setFromCamera(ndc, activeCam());
    return ray.intersectObject(hit, false).length > 0;
  }
  function beginDrag() {
    const cam = activeCam();
    const tip = new THREE.Vector3(vc.x, vc.y, is2() ? 0 : vc.z);
    if (is2()) dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0));
    else dragPlane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()), tip);
    ray.setFromCamera(ndc, cam);
    if (ray.ray.intersectPlane(dragPlane, dragPt)) dragOff.copy(dragPt).sub(tip); else dragOff.set(0, 0, 0);
  }
  function moveDrag() {
    ray.setFromCamera(ndc, activeCam());
    if (!ray.ray.intersectPlane(dragPlane, dragPt)) return;
    const p = dragPt.clone().sub(dragOff);
    vec.x = clamp(p.x, -4, 4); vec.y = clamp(p.y, -4, 4);
    if (!is2()) vec.z = clamp(p.z, -4, 4);
    Object.assign(vc, targetVec());
    syncVectorUI();
    updateReadouts();
  }

  function pan3(dx, dy) {
    const k = (2 * V3.dist * Math.tan(rad(cam3.fov / 2))) / H;
    const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
    cam3.matrixWorld.extractBasis(right, up, fwd);
    const t = new THREE.Vector3(V3.tx, V3.ty, V3.tz).addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    V3.tx = G3.tx = clamp(t.x, -8, 8); V3.ty = G3.ty = clamp(t.y, -8, 8); V3.tz = G3.tz = clamp(t.z, -8, 8);
  }
  function pan2(dx, dy) {
    const aspect = W / H;
    V2.cx -= dx * (2 * V2.half * aspect) / W;
    V2.cy += dy * (2 * V2.half) / H;
  }
  function zoom2(factor, sx, sy) {
    const aspect = W / H;
    const nx = (sx / W) * 2 - 1, ny = -((sy / H) * 2 - 1);
    const wx = V2.cx + nx * V2.half * aspect, wy = V2.cy + ny * V2.half;
    V2.half = clamp(V2.half * factor, 1.2, 14);
    V2.cx = wx - nx * V2.half * aspect; V2.cy = wy - ny * V2.half;
  }
  function zoom3(factor) { V3.dist = G3.dist = clamp(V3.dist * factor, 4, 28); }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      if (e.button === 0 && overHandle(e)) { action = "drag"; beginDrag(); canvas.style.cursor = "grabbing"; }
      else if (e.button === 2 || e.button === 1 || e.shiftKey || is2()) action = "pan";
      else action = "orbit";
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      action = "pinch";
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) { canvas.style.cursor = overHandle(e) ? "grab" : "default"; return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (action === "drag") { setNDC(e); moveDrag(); }
    else if (action === "orbit") {
      V3.az = G3.az = V3.az - dx * 0.0065;
      V3.el = G3.el = clamp(V3.el + dy * 0.0065, rad(-89), rad(89));
      dirty = true;
    } else if (action === "pan") { is2() ? pan2(dx, dy) : pan3(dx, dy); dirty = true; }
    else if (action === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = canvas.getBoundingClientRect();
      const factor = pinchDist / d;
      if (is2()) { zoom2(factor, mid.x - r.left, mid.y - r.top); pan2(mid.x - pinchMid.x, mid.y - pinchMid.y); }
      else { zoom3(factor); pan3(mid.x - pinchMid.x, mid.y - pinchMid.y); }
      pinchDist = d; pinchMid = mid; dirty = true;
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { action = null; canvas.style.cursor = "default"; }
    else action = "none";
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0012));
    if (is2()) { const r = canvas.getBoundingClientRect(); zoom2(factor, e.clientX - r.left, e.clientY - r.top); }
    else zoom3(factor);
    dirty = true;
  }, { passive: false });

  /* ---------- resize ---------- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w < 2 || h < 2) return;
    W = w; H = h;
    renderer.setSize(w, h, false);
    cam3.aspect = w / h; cam3.updateProjectionMatrix();
    ticks.forEach((t) => { t._w = 0; });
    vLbl._w = 0; mvLbl._w = 0;
    Object.values(axLbl).forEach((a) => { a._w = 0; });
    dirty = true;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener("resize", resize);

  /* ---------- per-frame animation ---------- */
  let lastT = performance.now();
  function step(now) {
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    const EASE = REDUCE ? 1 : 1 - Math.exp(-EASE_RATE * dt);
    const CAM_EASE = REDUCE ? 1 : 1 - Math.exp(-CAM_RATE * dt);
    let moving = false;

    const T = targetMatrix();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const d = T[r][c] - Mc[r][c];
      if (Math.abs(d) > 1e-4) { Mc[r][c] += d * EASE; moving = true; } else Mc[r][c] = T[r][c];
    }
    const tv = targetVec();
    ["x", "y", "z"].forEach((a) => {
      const d = tv[a] - vc[a];
      if (Math.abs(d) > 1e-4) { vc[a] += d * EASE; moving = true; } else vc[a] = tv[a];
    });

    if (morphPlaying) {
      const p = Math.min(1, (now - morphStart) / 1700);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setMorph(e);
      if (p >= 1) morphPlaying = false;
      moving = true;
    }

    if (!is2()) {
      if (autoRot && pointers.size === 0) { V3.az += 0.35 * dt; G3.az = V3.az; moving = true; }
      const keys = ["az", "el", "dist", "tx", "ty", "tz"];
      keys.forEach((k) => {
        const d = k === "az" ? wrapPi(G3.az - V3.az) : G3[k] - V3[k];
        if (Math.abs(d) > 1e-3) { V3[k] += d * CAM_EASE; moving = true; } else if (k !== "az") V3[k] = G3[k]; else V3.az += d;
      });
    }
    return moving;
  }

  /* ---------- drawing ---------- */
  const pts = [];
  function transformBase(base, T, z2) { // base: Float32Array of xyz triples (z = 0)
    pts.length = 0;
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i], y = base[i + 1];
      const nx = T[0][0] * x + T[0][1] * y, ny = T[1][0] * x + T[1][1] * y, nz = T[2][0] * x + T[2][1] * y;
      pts.push(nx, ny, z2 === undefined ? nz : z2);
    }
    return pts;
  }
  function boxPoints(p) {
    pts.length = 0;
    BOX_EDGES.forEach(([i, j]) => {
      pts.push(p.x * (i & 1), p.y * ((i >> 1) & 1), p.z * ((i >> 2) & 1), p.x * (j & 1), p.y * ((j >> 1) & 1), p.z * ((j >> 2) & 1));
    });
    return pts;
  }
  const cellCorner = (a, b, c, i) => [
    a.x * (i & 1) + b.x * ((i >> 1) & 1) + c.x * ((i >> 2) & 1),
    a.y * (i & 1) + b.y * ((i >> 1) & 1) + c.y * ((i >> 2) & 1),
    a.z * (i & 1) + b.z * ((i >> 1) & 1) + c.z * ((i >> 2) & 1),
  ];

  function updateCameras() {
    if (is2()) {
      const aspect = W / H;
      cam2.left = -V2.half * aspect + V2.cx; cam2.right = V2.half * aspect + V2.cx;
      cam2.top = V2.half + V2.cy; cam2.bottom = -V2.half + V2.cy;
      cam2.position.set(0, 0, 20); cam2.lookAt(0, 0, 0);
      cam2.updateProjectionMatrix();
      cam2.updateMatrixWorld();
    } else {
      const ce = Math.cos(V3.el);
      cam3.position.set(V3.tx + V3.dist * ce * Math.cos(V3.az), V3.ty + V3.dist * ce * Math.sin(V3.az), V3.tz + V3.dist * Math.sin(V3.el));
      cam3.up.set(0, 0, 1);
      cam3.lookAt(V3.tx, V3.ty, V3.tz);
      cam3.updateMatrixWorld();
    }
  }

  function draw() {
    const two = is2();
    const o = opts[mode];
    const Mtrue = blend(Mc, morphT);
    const out = mulVec(Mtrue, vc);           // the result vector always follows the real matrix
    const Md = vectorMode ? [[1,0,0],[0,1,0],[0,0,1]] : Mtrue; // grid, basis arrows, unit cell
    const s = two ? V2.half / 4.5 : clamp(V3.dist / DIST0, 0.55, 1.8);

    updateCameras();
    if (!two) syncCameraUI();
    g2.visible = two; g3.visible = !two;

    /* vectors */
    arrV.update(vc, s, two ? Z2.v : 0);
    arrMv.update(out, s, two ? Z2.mv : 0);
    const tipZ = two ? Z2.handle : 0;
    handle.position.set(vc.x, vc.y, two ? tipZ : vc.z);
    halo.position.copy(handle.position); hit.position.copy(handle.position);
    handle.scale.setScalar(0.085 * s); halo.scale.setScalar(0.19 * s); hit.scale.setScalar(0.4 * s);
    arrBasis.forEach((a, i) => {
      const show = o.basis && (i < 2 || !two);
      a.group.visible = show;
      if (show) a.update(col(Md, i), s, two ? Z2.basis : 0);
    });

    /* boxes */
    boxV.visible = boxMv.visible = o.box;
    if (o.box) {
      fillLines(boxV, boxPoints(vc));
      fillLines(boxMv, boxPoints(out));
    }

    if (two) {
      const th = 0.04 * s;
      axisX2.scale.set(400, th, 1); axisX2.position.x = 0;
      axisY2.scale.set(th, 400, 1);
      grid2Minor.visible = V2.half < 6;
      warp2.visible = o.grid;
      if (o.grid) fillLines(warp2, transformBase(warp2Base, Md, Z2.warp));
      const a = col(Md, 0), b = col(Md, 1);
      unit2.visible = cellFill2.visible = cellEdge2.visible = o.cell;
      if (o.cell) {
        const pos = cellGeo2.attributes.position.array;
        pos.set([0, 0, 0, a.x, a.y, 0, a.x + b.x, a.y + b.y, 0, b.x, b.y, 0]);
        cellGeo2.attributes.position.needsUpdate = true;
        fillLines(cellEdge2, [0,0,0, a.x,a.y,0, a.x,a.y,0, a.x+b.x,a.y+b.y,0, a.x+b.x,a.y+b.y,0, b.x,b.y,0, b.x,b.y,0, 0,0,0]);
      }
    } else {
      axisArrows.forEach((a) => a.update(a.dir, s, 0));
      warp3.visible = o.grid;
      if (o.grid) fillLines(warp3, transformBase(warp3Base, Md));
      unit3.visible = o.cell;
      cellFill3.visible = cellEdge3.visible = o.cell;
      if (o.cell) {
        const a = col(Md, 0), b = col(Md, 1), c = col(Md, 2);
        const corners = [];
        for (let i = 0; i < 8; i++) corners.push(cellCorner(a, b, c, i));
        const pos = cellGeo3.attributes.position.array;
        corners.forEach((p, i) => pos.set(p, i * 3));
        cellGeo3.attributes.position.needsUpdate = true;
        const e = [];
        BOX_EDGES.forEach(([i, j]) => e.push(...corners[i], ...corners[j]));
        fillLines(cellEdge3, e);
      }
    }

    renderer.render(scene, activeCam());
    updateLabels(two, out, s);
  }

  /* ---------- labels follow the scene ---------- */
  function updateLabels(two, out, s) {
    const cam = activeCam();
    // vector brackets, anchored near each arrow tip
    const pv = toScreen(vc.x, vc.y, two ? 0 : vc.z, cam);
    const pm = toScreen(out.x, out.y, two ? 0 : out.z, cam);
    // put the two brackets on opposite sides so they never sit on top of each other
    const vRight = pv.x >= pm.x;
    place(vLbl, pv.x + (vRight ? 14 : -14), pv.y - 12, vRight ? 0 : 1, 1);
    place(mvLbl, pm.x + (vRight ? -14 : 14), pm.y - 12, vRight ? 1 : 0, 1);

    if (two) {
      axLbl.z.style.display = "none";
      const o = toScreen(0, 0, 0, cam);
      place(axLbl.x, W - 26, clamp(o.y, 16, H - 30) + 6, 0, 0);
      place(axLbl.y, clamp(o.x, 16, W - 30) + 10, 8, 0, 0);
      // numbered ticks along both axes, spaced so they never crowd
      const ppu = H / (2 * V2.half);
      const step = [0.5, 1, 2, 5, 10, 20].find((st) => st * ppu >= 46) || 20;
      let n = 0;
      const aspect = W / H;
      const x0 = Math.ceil((V2.cx - V2.half * aspect) / step), x1 = Math.floor((V2.cx + V2.half * aspect) / step);
      for (let k = x0; k <= x1 && n < ticks.length; k++) {
        if (!k) continue;
        const p = toScreen(k * step, 0, 0, cam);
        if (p.x > W - 44) continue;
        const el = ticks[n++]; setText(el, f2(k * step));
        place(el, p.x, clamp(p.y, 8, H - 24) + 6, 0.5, 0);
      }
      const y0 = Math.ceil((V2.cy - V2.half) / step), y1 = Math.floor((V2.cy + V2.half) / step);
      for (let k = y0; k <= y1 && n < ticks.length; k++) {
        if (!k) continue;
        const p = toScreen(0, k * step, 0, cam);
        if (p.y < 34) continue;
        const el = ticks[n++]; setText(el, f2(k * step));
        place(el, clamp(p.x, 24, W - 8) - 8, p.y, 1, 0.5);
      }
      for (; n < ticks.length; n++) hide(ticks[n]);
    } else {
      ticks.forEach(hide);
      const L = AX_LEN + 0.45;
      [["x", L, 0, 0], ["y", 0, L, 0], ["z", 0, 0, L]].forEach(([a, x, y, z]) => {
        const p = toScreen(x, y, z, cam);
        if (p.behind) hide(axLbl[a]); else place(axLbl[a], p.x, p.y, 0.5, 0.5);
      });
    }
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (!pageEl.classList.contains("active") || stage.clientWidth < 2) { lastT = now; return; }
    const moving = step(now);
    if (!(dirty || moving)) return;
    dirty = false;
    draw();
  }

  const viewToggle = $("viewModeToggle");
  function syncViewMode() {
    viewToggle.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", (b.dataset.vm === "vector") === vectorMode));
    dirty = true;
  }
  viewToggle.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    vectorMode = b.dataset.vm === "vector";
    $("vmNote").textContent = vectorMode
      ? "Axes stay fixed. Only the result arrow Mv moves — this is the view used on the Bloch sphere."
      : "The whole grid warps: you see where every point of space lands, not just one vector.";
    syncViewMode();
  });
  syncViewMode();

  /* boot */
  syncMatrixInputs(); syncVectorUI(); syncOptions(); buildPresets(); buildLegend(); syncCameraUI();
  updateReadouts();
  resize();
  requestAnimationFrame(frame);

  /* handy for debugging in the console: MatrixLab.setMode('2d') */
  window.MatrixLab = {
    setMode,
    handleScreen: () => toScreen(vc.x, vc.y, is2() ? 0 : vc.z, activeCam()),
    setView: (n) => $("viewChips").querySelector(`[data-view="${n}"]`).click(),
    get state() { return { mode, M, vec, morphT }; },

    /* Called from circuit-builder.js's "View this qubit's transform" buttons.
       payload: { matrix, qubit, labels, entangled, finalBloch }. `matrix` is
       the composed single-qubit rotation (identity if no gates yet); v is
       always set to (0,0,1) since every qubit here starts at |0>. */
    loadFromCircuit(payload) {
      if (mode !== "3d") setMode("3d");
      M = cloneM(payload.matrix);
      syncMatrixInputs();
      vec.x = 0; vec.y = 0; vec.z = 1;
      Object.assign(vc, targetVec());
      syncVectorUI();
      updateReadouts();

      const seq = payload.labels.length ? payload.labels.join(" → ") : "no gates yet";
      let text = `Showing Qubit ${payload.qubit}: ${seq}.`;
      if (payload.entangled) {
        const fb = payload.finalBloch;
        const by = payload.stoppedBy || "CNOT";
        text += by === "SWAP"
          ? ` The SWAP hands this wire's state over to the other qubit, so past that point it isn't a rotation of v anymore — ` +
            `the simulator's actual Bloch vector is (${f2(fb.x)}, ${f2(fb.y)}, ${f2(fb.z)}).`
          : ` The ${by} can entangle this qubit with the other one, so past that point its state isn't a pure rotation of v anymore — ` +
            `the simulator's actual Bloch vector is (${f2(fb.x)}, ${f2(fb.y)}, ${f2(fb.z)}), and it is shorter than |Mv| whenever the qubit ends up mixed.`;
      }
      syncBannerText.textContent = text;
      syncBanner.hidden = false;
      dirty = true;
    },
  };
})();
