/* =========================================================================
   circuit-builder.js
   Circuit-builder module: drag/drop gate palette, 2-qubit board, run button,
   Bloch sphere canvases and the AI-tutor explanation panel.
   Talks to the backend only through window.EntangleAPI.simulate() (api.js).
   ========================================================================= */
const N_SLOTS = 8;

/* Gate catalogue: what the palette, the board and the tooltips all read from.
   One-qubit gates sit in a single slot; two-qubit gates take the same column on both wires. */
const TWO_QUBIT = QM.TWO_QUBIT;                       // ["CNOT", "CZ", "SWAP"]
const isTwoQubit = (t) => TWO_QUBIT.includes(t);
const GATE_LABEL = { H: "H", X: "X", Y: "Y", Z: "Z", S: "S", Sdg: "S†", T: "T", Tdg: "T†", SX: "√X" };

/* ---------------- circuit board state ---------------- */
// slotState[row][col] = null | 'H' | 'X' | 'Y' | ... | {pair:'CNOT'|'CZ'|'SWAP', role, otherRow, slot}
//   role: CNOT -> 'C' (control) / 'T' (target); CZ -> 'C' on both; SWAP -> 'X' on both
const slotState = [new Array(N_SLOTS).fill(null), new Array(N_SLOTS).fill(null)];
let gates = []; // ordered list of {type, qubit|control/target, slot}

function buildRows() {
  for (let row = 0; row < 2; row++) {
    const rowEl = document.getElementById(`row${row}`);
    for (let col = 0; col < N_SLOTS; col++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.row = row;
      slot.dataset.col = col;
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("drag-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", onDrop);
      slot.addEventListener("click", () => removeAt(row, col));
      rowEl.appendChild(slot);
    }
  }
}

function slotEl(row, col) {
  return document.querySelector(`.slot[data-row="${row}"][data-col="${col}"]`);
}

/* put a two-qubit gate on the board: `row` is where it was dropped (control for CNOT) */
function placePair(type, row, col) {
  const other = row === 0 ? 1 : 0;
  const roles = type === "CNOT" ? ["C", "T"] : type === "CZ" ? ["C", "C"] : ["X", "X"];
  slotState[row][col] = { pair: type, role: roles[0], otherRow: other, slot: col };
  slotState[other][col] = { pair: type, role: roles[1], otherRow: row, slot: col };
  gates.push({ type, control: row, target: other, slot: col });
  renderSlot(row, col);
  renderSlot(other, col);
}

function onDrop(e) {
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove("drag-over");
  const row = Number(slot.dataset.row);
  const col = Number(slot.dataset.col);
  const gateType = e.dataTransfer.getData("text/gate");
  if (!gateType) return;

  if (isTwoQubit(gateType)) {
    const other = row === 0 ? 1 : 0;
    if (slotState[row][col] || slotState[other][col]) return; // occupied
    placePair(gateType, row, col);
    drawConnectors();
  } else {
    if (slotState[row][col]) return;
    slotState[row][col] = gateType;
    gates.push({ type: gateType, qubit: row, slot: col });
    renderSlot(row, col);
  }
}

function removeAt(row, col) {
  const val = slotState[row][col];
  if (!val) return;
  if (typeof val === "object") {
    // two-qubit gate - remove both halves
    const other = val.otherRow;
    gates = gates.filter((g) => !(isTwoQubit(g.type) && g.slot === col));
    slotState[row][col] = null;
    slotState[other][col] = null;
    renderSlot(row, col);
    renderSlot(other, col);
    drawConnectors();
  } else {
    gates = gates.filter((g) => !(g.qubit === row && g.slot === col));
    slotState[row][col] = null;
    renderSlot(row, col);
  }
}

function renderSlot(row, col) {
  const el = slotEl(row, col);
  const val = slotState[row][col];
  el.className = "slot";
  el.innerHTML = "";
  if (!val) return;
  el.classList.add("filled");
  if (typeof val === "string") {
    el.classList.add(`gate-${val}`);
    el.textContent = GATE_LABEL[val] || val;
    return;
  }
  const mark = document.createElement("div");
  if (val.pair === "CNOT" && val.role === "T") {
    el.classList.add("gate-CNOT-T");
    mark.className = "cnot-target";
  } else if (val.pair === "SWAP") {
    el.classList.add("gate-SWAP");
    mark.className = "swap-x";
  } else {
    el.classList.add(val.pair === "CZ" ? "gate-CZ" : "gate-CNOT-C");
    mark.className = "cnot-dot";
  }
  el.appendChild(mark);
}

function drawConnectors() {
  const svg = document.getElementById("wireSvg");
  const board = document.getElementById("board");
  svg.setAttribute("width", board.clientWidth);
  svg.setAttribute("height", board.clientHeight);
  svg.innerHTML = "";
  for (let col = 0; col < N_SLOTS; col++) {
    const c = slotState[0][col];
    const t = slotState[1][col];
    const pair = (c && c.pair) || (t && t.pair);
    if (!pair) continue;
    const r0 = slotEl(0, col).getBoundingClientRect();
    const r1 = slotEl(1, col).getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const x = r0.left - boardRect.left + r0.width / 2;
    const y1 = r0.top - boardRect.top + r0.height / 2;
    const y2 = r1.top - boardRect.top + r1.height / 2;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x); line.setAttribute("y1", y1);
    line.setAttribute("x2", x); line.setAttribute("y2", y2);
    line.setAttribute("class", `link link-${pair}`);   // colour and width live in style.css
    svg.appendChild(line);
  }
}

document.querySelectorAll(".gate-chip").forEach((chip) => {
  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/gate", chip.dataset.gate);
  });
});

document.getElementById("clearBtn").addEventListener("click", () => {
  gates = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < N_SLOTS; col++) { slotState[row][col] = null; renderSlot(row, col); }
  drawConnectors();
});

/* ---------------- Matrix Lab bridge ----------------
   H/X/Z each act on a single qubit's Bloch vector as a fixed 3x3 rotation —
   the exact matrices Matrix Lab already ships as its "Hadamard" / "Pauli-X" /
   "Pauli-Z" presets. Reusing those same numbers here means a qubit's gate
   sequence can be hosted directly in Matrix Lab instead of just described.
   Two-qubit gates (CNOT, CZ, SWAP) are different: once one fires, this
   qubit's own state can become mixed (or be handed to the other wire), and
   that isn't a pure rotation of a Bloch vector — so composition stops there
   rather than inventing a matrix for it. */
const R45 = Math.SQRT1_2;
const BLOCH_GATE_MATRIX = {
  H:   [[0, 0, 1], [0, -1, 0], [1, 0, 0]],
  X:   [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
  Y:   [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  Z:   [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  S:   [[0, -1, 0], [1, 0, 0], [0, 0, 1]],          // quarter turn about z
  Sdg: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],          // ... the other way
  T:   [[R45, -R45, 0], [R45, R45, 0], [0, 0, 1]],  // eighth of a turn about z
  Tdg: [[R45, R45, 0], [-R45, R45, 0], [0, 0, 1]],
  SX:  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],          // quarter turn about x
};
function matMul3(A, B) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j];
    R[i][j] = s;
  }
  return R;
}

let lastBlochVectors = null; // set after a successful run; used by the Matrix Lab bridge

/* Composes the single-qubit rotation `qubit` has been put through, in slot
   order, stopping (and flagging entangled) at the first CNOT that touches it. */
function composeQubitTransform(qubit) {
  const ordered = [...gates].sort((a, b) => a.slot - b.slot);
  let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const labels = [];
  let entangledAtSlot = null;
  let stoppedBy = null;
  for (const g of ordered) {
    if (isTwoQubit(g.type) && (g.control === qubit || g.target === qubit)) {
      labels.push(g.type === "CNOT" ? (g.control === qubit ? "CNOT (control)" : "CNOT (target)") : g.type);
      entangledAtSlot = g.slot;
      stoppedBy = g.type;
      break;
    }
    if (g.qubit === qubit && BLOCH_GATE_MATRIX[g.type]) {
      M = matMul3(BLOCH_GATE_MATRIX[g.type], M);
      labels.push(g.type);
    }
  }
  return { matrix: M, labels, entangledAtSlot, stoppedBy };
}

/* Called by Matrix Lab when its current matrix matches a known gate and the
   person clicks "Add to circuit" — appends that gate to the first empty slot
   on the chosen qubit's wire, then re-runs so everything stays in sync. */
function addGateToQubit(gateType, qubit) {
  for (let col = 0; col < N_SLOTS; col++) {
    if (!slotState[qubit][col]) {
      slotState[qubit][col] = gateType;
      gates.push({ type: gateType, qubit, slot: col });
      renderSlot(qubit, col);
      runCircuit();
      return true;
    }
  }
  statusEl.textContent = `Qubit ${qubit}'s wire is full — clear a slot before adding another gate.`;
  return false;
}

function sendQubitToMatrixLab(qubit) {
  if (window.SimUI) window.SimUI.openLab(true);
  if (!lastBlochVectors) {
    statusEl.textContent = "Run the circuit first, then you can view a qubit's transform in Matrix Lab.";
    return;
  }
  const { matrix, labels, entangledAtSlot, stoppedBy } = composeQubitTransform(qubit);
  window.MatrixLab.loadFromCircuit({
    matrix,
    qubit,
    labels,
    entangled: entangledAtSlot !== null,
    stoppedBy,
    finalBloch: lastBlochVectors[qubit],
  });
}

/* buildRows() and preload() are called once, in order, from nav.js's
   DOMContentLoaded boot sequence — not here — so the board isn't built twice. */

/* preload the classic Bell-state demo: H on qubit0 slot0, CNOT control0->target1 slot1 */
function preload() {
  slotState[0][0] = "H"; gates.push({ type: "H", qubit: 0, slot: 0 }); renderSlot(0, 0);
  placePair("CNOT", 0, 1);
  drawConnectors();
}

/* Replace the whole board with `list` (gates in order, one per column).
   Used by lesson challenges: "load this circuit and go". */
function loadCircuit(list) {
  gates = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < N_SLOTS; c++) { slotState[r][c] = null; renderSlot(r, c); }
  list.slice(0, N_SLOTS).forEach((g, col) => {
    if (isTwoQubit(g.type)) {
      placePair(g.type, g.control, col);
    } else {
      slotState[g.qubit][col] = g.type;
      gates.push({ type: g.type, qubit: g.qubit, slot: col });
      renderSlot(g.qubit, col);
    }
  });
  drawConnectors();
}

/* ---------------- Bloch spheres (three.js) ----------------
   Data coordinates (x,y,z) -> screen: z is UP (|0> north pole), x toward the
   viewer's right, y into the page. The map (x,y,z) -> three(x, z, -y) keeps
   the coordinate system right-handed, so what you see is what the numbers say.
   The sphere does NOT auto-spin any more: a moving sphere makes it impossible
   to read a direction. Drag it to look around. */
const toScene = (x, y, z) => new THREE.Vector3(x, z, -y);

/* Look: the textbook Bloch sphere. A glass shell with a latitude/longitude grid,
   a grey equatorial disc, red Z axis, blue X axis, magenta Y axis, a black state
   arrow with a red head, plus the θ / Φ angle arcs and the grey projection lines.
   Every colour lives in BLOCH_THEME so the whole look can be re-skinned in one place. */
const BLOCH_THEME = {
  panel: "#f7f8fc",                      // canvas background (matches the page's paper)
  ink: "#1f1d18",                        // label text
  shell: [0.66, 0.74, 0.70],             // glass tint (r,g,b 0..1)
  grid: 0xa9b3a8, disc: 0x9aa398, equator: 0x86907f,
  axisZ: 0xb23a2e, axisX: 0x2f4f9d, axisY: 0x8a3f8f,
  arrow: 0x1f1d18, head: 0xb5522b, guide: 0x8f8a7c, angle: 0x1f5c4a,
};
const BLOCH_PX = 250; // CSS size of each sphere canvas
const vec3 = (x, y, z) => new THREE.Vector3(x, y, z);

function makeLabel(text, { bold = false, color = BLOCH_THEME.ink, size = 58 } = {}) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;   // 2x so the text stays sharp
  const g = c.getContext("2d");
  g.font = `${bold ? "bold " : ""}${size}px "Source Sans 3", "Segoe UI", Calibri, Arial, sans-serif`;
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.78, 0.39, 1);
  sp.renderOrder = 10;
  return sp;
}

/* thin solid cylinder from a to b (WebGL lines are always 1px, too thin for axes/guides) */
function bar(a, b, radius, color) {
  const d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), new THREE.MeshBasicMaterial({ color }));
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(vec3(0, 1, 0), d.normalize());
  return m;
}
function tube(pts, radius, color) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, radius, 6, false),
    new THREE.MeshBasicMaterial({ color }));
}

function makeBlochScene(canvasId) {
  const T = BLOCH_THEME;
  const canvas = document.getElementById(canvasId);
  canvas.style.background = T.panel;
  let renderer;
  try {
    if (typeof THREE === "undefined") throw new Error("three.js did not load");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {   // no WebGL / CDN blocked: degrade gracefully instead of breaking the whole page
    console.warn("Bloch sphere disabled:", err);
    const note = document.createElement("div");
    note.textContent = "3D Bloch sphere isn't available on this device (WebGL is off or blocked). The coordinates below still update.";
    note.style.cssText = "max-width:250px;margin:0 auto;padding:1rem;font-size:.8rem;line-height:1.4;opacity:.75;text-align:center";
    canvas.replaceWith(note);
    return { setVector() {} };
  }
  renderer.setPixelRatio(Math.min(2.5, Math.max(2, window.devicePixelRatio || 1)));
  renderer.setSize(BLOCH_PX, BLOCH_PX, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);   // narrow FOV = near-orthographic, like a textbook figure
  camera.position.set(0, 0, 5.6);
  camera.lookAt(0, 0, 0);
  const group = new THREE.Group();
  // yaw so |+> comes toward the lower-left and |+i> toward the lower-right; tilt to look slightly down on the equator
  group.rotation.set(0.25, -0.75 * Math.PI, 0);
  scene.add(group);

  // glass shell: faint fill that gets a little stronger toward the rim
  group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color(...T.shell) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 tint; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(tint, 0.07 + 0.30 * pow(f, 2.6)); }`,
  })), { renderOrder: 1 }));

  // latitude / longitude grid (every 15 degrees)
  const gp = [], N = 72;
  for (let lat = -75; lat <= 75; lat += 15) {
    const a = (lat * Math.PI) / 180, r = Math.cos(a), y = Math.sin(a);
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 * Math.PI, t1 = ((i + 1) / N) * 2 * Math.PI;
      gp.push(vec3(r * Math.cos(t0), y, r * Math.sin(t0)), vec3(r * Math.cos(t1), y, r * Math.sin(t1)));
    }
  }
  for (let lon = 0; lon < 180; lon += 15) {      // each great circle through the poles = two meridians
    const b = (lon * Math.PI) / 180;
    for (let i = 0; i < N; i++) {
      const s0 = (i / N) * 2 * Math.PI, s1 = ((i + 1) / N) * 2 * Math.PI;
      gp.push(vec3(Math.cos(s0) * Math.cos(b), Math.sin(s0), Math.cos(s0) * Math.sin(b)),
              vec3(Math.cos(s1) * Math.cos(b), Math.sin(s1), Math.cos(s1) * Math.sin(b)));
    }
  }
  group.add(Object.assign(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp),
    new THREE.LineBasicMaterial({ color: T.grid, transparent: true, opacity: 0.6, depthWrite: false })), { renderOrder: 2 }));

  // equatorial disc + its rim
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({ color: T.disc, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.renderOrder = 3;
  group.add(disc);
  const rim = []; for (let i = 0; i < 96; i++) { const t = (i / 96) * 2 * Math.PI; rim.push(vec3(Math.cos(t), 0, Math.sin(t))); }
  group.add(Object.assign(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rim),
    new THREE.LineBasicMaterial({ color: T.equator, transparent: true, opacity: 0.8, depthWrite: false })), { renderOrder: 4 }));

  // axes: Z red, X blue, Y magenta (each runs the full diameter)
  const AX = 1.0, AR = 0.011;
  group.add(bar(toScene(0, 0, -AX), toScene(0, 0, AX), AR, T.axisZ));
  group.add(bar(toScene(-AX, 0, 0), toScene(AX, 0, 0), AR, T.axisX));
  group.add(bar(toScene(0, -AX, 0), toScene(0, AX, 0), AR, T.axisY));

  // basis-state labels: poles bold, the four equator states regular
  [[0, 0, 1.17, "|0⟩", true], [0, 0, -1.17, "|1⟩", true],
   [1.22, 0, 0, "|+⟩", false], [-1.22, 0, 0, "|−⟩", false],
   [0, 1.22, 0, "|+i⟩", false], [0, -1.22, 0, "|−i⟩", false],
  ].forEach(([x, y, z, t, bold]) => { const sp = makeLabel(t, { bold }); sp.position.copy(toScene(x, y, z)); group.add(sp); });

  // state arrow: black shaft + red head (shaft geometry points along +y, then rotated onto the vector)
  const arrow = new THREE.Group();
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 12); shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: T.arrow }));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 18), new THREE.MeshBasicMaterial({ color: T.head }));
  arrow.add(shaft, cone);
  group.add(arrow);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: T.arrow })));
  const UP = vec3(0, 1, 0);

  // guides that depend on the current vector: projection lines and the θ / Φ arcs (rebuilt on each setVector)
  const dyn = new THREE.Group(); group.add(dyn);
  const clearDyn = () => { while (dyn.children.length) { const o = dyn.children.pop(); o.geometry.dispose(); o.material.dispose(); } };
  const thetaLbl = makeLabel("θ"), phiLbl = makeLabel("Φ");
  thetaLbl.visible = phiLbl.visible = false;
  group.add(thetaLbl, phiLbl);

  // drag to rotate
  let drag = null;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    group.rotation.y += (e.clientX - drag.x) * 0.01;
    group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
    dirty = true;
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("pointercancel", () => { drag = null; });

  // draw only when something changed (saves battery on phones); survive WebGL context loss when the tab is backgrounded
  let dirty = true;
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  canvas.addEventListener("webglcontextrestored", () => { dirty = true; });
  document.addEventListener("visibilitychange", () => { dirty = true; });
  function render() {
    if (dirty && !document.hidden) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(render);
  }
  render();

  return {
    setVector(x, y, z) {
      dirty = true;
      clearDyn();
      const v = toScene(x, y, z);
      const len = v.length();
      thetaLbl.visible = phiLbl.visible = false;
      if (len < 0.03) { arrow.visible = false; return; }   // fully mixed: just the centre dot
      arrow.visible = true;
      arrow.quaternion.setFromUnitVectors(UP, v.clone().normalize());
      const head = Math.min(0.2, len * 0.5);
      shaft.scale.set(1, Math.max(0.001, len - head), 1);
      cone.scale.set(1, head / 0.2, 1);
      cone.position.y = len - head / 2;

      const rho = Math.hypot(x, y);                        // length of the shadow on the equatorial plane
      const theta = Math.acos(Math.max(-1, Math.min(1, z / len)));
      let phi = Math.atan2(y, x); if (phi < 0) phi += 2 * Math.PI;
      if (rho > 0.04) {
        const foot = toScene(x, y, 0);
        if (Math.abs(z) > 0.03) {
          dyn.add(bar(v, foot, 0.006, T.guide));            // drop line: tip -> equatorial plane
          dyn.add(bar(vec3(0, 0, 0), foot, 0.006, T.guide));  // shadow: centre -> foot
        }
        if (phi > 0.12) {                                   // Φ: from +X round to the shadow
          const pts = []; for (let i = 0; i <= 28; i++) { const t = (phi * i) / 28; pts.push(toScene(0.38 * Math.cos(t), 0.38 * Math.sin(t), 0)); }
          dyn.add(tube(pts, 0.008, T.angle));
          phiLbl.position.copy(toScene(0.56 * Math.cos(phi / 2), 0.56 * Math.sin(phi / 2), 0)); phiLbl.visible = true;
        }
        if (theta > 0.12) {                                 // θ: from +Z down to the arrow
          const c = Math.cos(phi), s = Math.sin(phi);
          const at = (t, r) => toScene(r * Math.sin(t) * c, r * Math.sin(t) * s, r * Math.cos(t));
          const pts = []; for (let i = 0; i <= 28; i++) pts.push(at((theta * i) / 28, 0.3));
          dyn.add(tube(pts, 0.008, T.angle));
          if (theta > 0.35) { thetaLbl.position.copy(at(theta / 2, 0.5)); thetaLbl.visible = true; }
        }
      }
    },
  };
}

const bloch0 = makeBlochScene("sphere0");
const bloch1 = makeBlochScene("sphere1");

/* ---------------- run circuit ---------------- */
const runBtn = document.getElementById("runBtn");
const statusEl = document.getElementById("status");
const barsEl = document.getElementById("bars");
const explanationEl = document.getElementById("explanation");
const coords0El = document.getElementById("coords0");
const coords1El = document.getElementById("coords1");
const fmt = (n) => n.toFixed(2);

function renderBars(probs, counts) {
  // keys are |q0 q1>, qubit 0 on the left (see qmath.js). Bars show the exact
  // probability; the number on the right is what the 200 sampled shots gave.
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  barsEl.innerHTML = QM.LABELS.map((k) => {
    const p = probs[k];
    const shots = counts ? `${counts[k] || 0} shots` : "";
    return `<div class="bar-row"><span>|${k}⟩</span><div class="bar-track"><div class="bar-fill" style="width:${(p * 100).toFixed(1)}%"></div></div><span>${(p * 100).toFixed(1)}%<small> ${shots}</small></span></div>`;
  }).join("");
}

function showResult(psi, counts, gateList) {
  const bv = QM.blochVectors(psi);
  bloch0.setVector(bv[0].x, bv[0].y, bv[0].z);
  bloch1.setVector(bv[1].x, bv[1].y, bv[1].z);
  const line = (b) => `x ${fmt(b.x)} · y ${fmt(b.y)} · z ${fmt(b.z)}<br>length ${fmt(Math.hypot(b.x, b.y, b.z))} · purity ${fmt(QM.purityOf(b))}`;
  coords0El.innerHTML = line(bv[0]);
  coords1El.innerHTML = line(bv[1]);
  renderBars(QM.probabilities(psi), counts);
  // Entanglement tab only exists when the circuit contains a two-qubit gate (CNOT, CZ or SWAP).
  const hasTwoQubit = (gateList || []).some((g) => isTwoQubit(g.type));
  window.SimUI.setEntanglement(hasTwoQubit, QM.concurrence(psi) > 1e-6);
  if (hasTwoQubit && window.renderCorrelation) window.renderCorrelation(psi);
}

/* Built-in explanation, computed in the browser from the same amplitudes.
   It is what you see instantly, and the fallback if the AI tutor is slow,
   down, or returns nothing — the tutor box can never be blank. */
function localExplain(psi, gateList) {
  if (!gateList.length) return "The circuit is empty. Drag a gate onto a wire, then press Run.";
  const bv = QM.blochVectors(psi);
  const dir = (b) => {
    const len = Math.hypot(b.x, b.y, b.z);
    if (len < 0.15) return "at the centre of the sphere: on its own it has no definite direction";
    if (b.z > 0.7) return "pointing toward |0⟩ (north)";
    if (b.z < -0.7) return "pointing toward |1⟩ (south)";
    if (Math.abs(b.z) < 0.3) return "on the equator: an equal superposition of |0⟩ and |1⟩";
    return "tilted between the pole and the equator";
  };
  const out = bv.map((b, i) => `Qubit ${i} is ${dir(b)} (purity ${fmt(QM.purityOf(b))}).`);
  const conc = QM.concurrence(psi);
  const probs = Object.entries(QM.probabilities(psi)).filter(([, p]) => p > 1e-6).sort((a, b) => b[1] - a[1]);
  if (conc > 1e-6) {
    out.push(`The qubits are entangled (det C ≠ 0, entanglement ${fmt(conc)}). Each one alone is mixed: part of its information lives in the pair.`);
    out.push(`Measuring both, you only ever see ${probs.map(([k, p]) => `|${k}⟩ (${(p * 100).toFixed(0)}%)`).join(" or ")}.`);
  } else {
    out.push("The qubits are not entangled (det C = 0): each has its own definite state, so measuring one tells you nothing about the other.");
    out.push(probs.length === 1 ? `The result is certain: always |${probs[0][0]}⟩.` : `Possible results: ${probs.map(([k, p]) => `|${k}⟩ (${(p * 100).toFixed(0)}%)`).join(", ")}.`);
  }
  return out.join(" ");
}

/* AI models like to answer in LaTeX/markdown ("\\(|0\\rangle\\)", "**bold**"). This page shows plain text,
   so convert the common cases to Unicode and strip the rest. */
function cleanTutorText(t) {
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
  const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
  const map = (str, m) => [...str].map((c) => m[c] ?? c).join("");
  const SYM = { rangle: "⟩", langle: "⟨", psi: "ψ", Psi: "Ψ", phi: "φ", varphi: "φ", Phi: "Φ", theta: "θ", alpha: "α", beta: "β", gamma: "γ",
    pi: "π", otimes: "⊗", oplus: "⊕", cdot: "·", times: "×", pm: "±", dagger: "†", to: "→", rightarrow: "→", leftrightarrow: "↔",
    approx: "≈", neq: "≠", leq: "≤", geq: "≥", sqrt: "√", ldots: "…", dots: "…", quad: " ", qquad: " ", mid: "|" };
  let s = String(t);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1").replace(/\\\[([\s\S]*?)\\\]/g, "$1").replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  s = s.replace(/\$([^$\n]{1,80})\$/g, "$1");
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^}]*)\}/g, "$1");
  s = s.replace(/\\sqrt\{([0-9a-zA-Z]+)\}/g, "√$1").replace(/\\sqrt\{([^}]*)\}/g, "√($1)");
  const par = (x) => (/^[\w.√]+(\([^)]*\))?$/.test(x.trim()) ? x.trim() : `(${x.trim()})`);
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (m, n, d) => `${par(n)}/${par(d)}`);
  s = s.replace(/\\([A-Za-z]+)/g, (m, w) => (w in SYM ? SYM[w] : w));
  s = s.replace(/\^\{([0-9+-]+)\}/g, (m, d) => map(d, SUP)).replace(/\^([0-9])/g, (m, d) => map(d, SUP));
  s = s.replace(/_\{([0-9]+)\}/g, (m, d) => map(d, SUB)).replace(/_([0-9])/g, (m, d) => map(d, SUB));
  s = s.replace(/\\[,;:! ]/g, " ").replace(/[{}]/g, "").replace(/\^†/g, "†");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").replace(/^#{1,4}\s+/gm, "");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

function setExplanation(text, source, thinking) {
  text = text ? cleanTutorText(text) : "";
  explanationEl.textContent = text ? text : "Circuit ran, but there was nothing to explain.";
  explanationEl.classList.toggle("thinking", !!thinking);
  document.getElementById("tutorSrc").textContent = source || "";
}

async function runCircuit() {
  runBtn.disabled = true;
  const orderedGates = [...gates].sort((a, b) => a.slot - b.slot).map((g) =>
    isTwoQubit(g.type) ? { type: g.type, control: g.control, target: g.target } : { type: g.type, qubit: g.qubit }
  );
  // 1) Instant: everything visual comes from the local exact simulation.
  const localPsi = QM.simulate(orderedGates);
  lastBlochVectors = QM.blochVectors(localPsi);
  window.lastSimResult = { gates: orderedGates, bloch_vectors: lastBlochVectors }; // context for the AI tutor
  showResult(localPsi, null, orderedGates);
  setExplanation(localExplain(localPsi, orderedGates), "Built-in explanation · asking Qiskit + AI tutor…", true);
  statusEl.classList.remove("bad");
  statusEl.textContent = "Checking against Qiskit…";

  // 2) Then confirm with the backend (with a timeout so nothing hangs).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(`${API_BASE}/api/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gates: orderedGates, shots: 200 }), signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    const data = await res.json();
    lastBlochVectors = data.bloch_vectors;
    window.lastSimResult = data;

    const counts = Object.fromEntries(Object.entries(data.counts).map(([k, v]) => [QM.flipKey(k), v]));
    renderBars(QM.probabilities(localPsi), counts);

    const aiText = (data.explanation || "").trim();
    if (aiText) setExplanation(aiText, data.tutor_mode === "groq" ? "AI tutor (Groq)" : "Built-in explanation");
    else setExplanation(localExplain(localPsi, orderedGates), "Built-in explanation (the tutor sent an empty reply)");

    const check = QM.verifyAgainstBackend(orderedGates, data);
    statusEl.textContent = check.ok
      ? "Verified: Qiskit matches this site's own math (±1e-6)."
      : "Qiskit and the local math disagree: " + check.problems.join("; ");
    statusEl.classList.toggle("bad", !check.ok);
  } catch (err) {
    const why = err.name === "AbortError" ? "took too long" : err.message;
    setExplanation(localExplain(localPsi, orderedGates), "Built-in explanation");
    statusEl.textContent = `Backend not available (${why}). Showing the site's own exact simulation; start uvicorn on port 8000 for the Qiskit check.`;
  } finally {
    clearTimeout(timer);
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", runCircuit);
window.addEventListener("resize", drawConnectors);
document.getElementById("viewMatrix0").addEventListener("click", () => sendQubitToMatrixLab(0));
document.getElementById("viewMatrix1").addEventListener("click", () => sendQubitToMatrixLab(1));

/* ---------------- tabs ---------------- */
