# Egreen Quanta — working slice

A restructured, modular build of the prototype, laid out to match the
architecture diagram: **Lessons** and a combined **Simulator** page (Circuit
Builder + Matrix Lab, both visible at once, no tab switch), talking to a
FastAPI backend with a canonical-circuit layer, three swappable simulator
engines, and an AI tutor that can run on OpenAI or fall back to a templated
explanation.

## Layout

```
frontend/
  index.html            top nav (Lessons / Simulator) + both pages' markup
  css/style.css          all styling
  js/api.js               EntangleAPI — the only place that calls the backend
  js/circuit-builder.js   drag/drop board (12 gates), Bloch spheres, Run button
  js/matrix-lab.js         Three.js linear-algebra playground (self-contained)
  js/lessons.js            chapter content + Lessons page rendering
  js/nav.js                page switching + boot order

backend/
  main.py                FastAPI app, routes
  models.py               Gate / CircuitRequest / TutorRequest schemas
  circuit_canon.py        canonical circuit -> OpenQASM 3 (qBraid stand-in)
  engines/
    __init__.py            dispatcher: run_on("qiskit"|"cirq"|"pennylane", ...)
    qiskit_engine.py        exact statevector sim + Bloch vectors + purity
    cirq_engine.py           same gate list, run on Cirq (optional dep)
    pennylane_engine.py      same gate list, run on PennyLane (optional dep)
  ai_tutor.py              OpenAI-grounded tutor, falls back to templated
  lessons.py               chapter list served over the API
  requirements.txt
```

## What changed vs. the single-file prototype

- **One page, both tools together.** The Simulator page mounts the circuit
  builder and Matrix Lab side by side, permanently — Matrix Lab keeps
  animating even when you're focused on the circuit board, matching "one
  canvas" in the diagram.
- **A Lessons page** with eight chapters (states → inner product → unitaries → tensor product →
  entanglement → measurement → Matrix Lab → the extra gates), each ending in a
  predict-then-test challenge that loads a circuit into the Simulator. Content lives as data in
  `js/lessons.js` (and mirrored in `backend/lessons.py` for a future
  instructor dashboard) — add a chapter by adding an entry, no HTML edits.
- **Canonical circuit layer** (`circuit_canon.py`): every request is built
  once in Qiskit and exported to OpenQASM 3 — the actual interchange format
  qBraid's real transpiler uses. Swap in `qbraid.transpile(...)` here later
  without touching anything else.
- **Three engines, one API.** `POST /api/simulate?backend=qiskit|cirq|pennylane`
  runs the *same* gate list on whichever SDK you ask for. Qiskit is the only
  one with Bloch-vector/purity math wired up right now (see "Next steps").
- **Real AI tutor hookup.** `ai_tutor.py` calls Groq's chat completions API
  (OpenAI-compatible, via the `openai` package pointed at Groq's base URL)
  with a prompt that only contains numbers your simulator actually
  produced, and refuses nothing else — the model can't invent a result that
  wasn't computed. No key configured → it automatically falls back to the
  original templated explanation, so the app always runs.
- **`POST /api/ask-tutor`** — a free-form Q&A endpoint the frontend doesn't
  call yet (see "Next steps") for open-ended student questions grounded in
  the last simulation.

## Run it

```bash
cd backend
pip install -r requirements.txt      # fastapi, uvicorn, qiskit, numpy, pydantic
uvicorn main:app --reload --port 8000
```

Then open `frontend/index.html` directly in a browser (or serve it: `python
-m http.server` from inside `frontend/`). The top-right of the nav bar shows
whether the AI tutor is running templated or via OpenAI.

## Turning on the real AI tutor (Groq)

Get a free key at [console.groq.com](https://console.groq.com), then:

```bash
pip install openai        # Groq's API is OpenAI-compatible — same package
export GROQ_API_KEY="gsk_..."          # macOS/Linux
setx GROQ_API_KEY "gsk_..."            # Windows (new shell after)
uvicorn main:app --reload --port 8000
```

That's it — `ai_tutor.py` detects the key at startup and switches modes
automatically; nothing else changes. Default model is
`llama-3.3-70b-versatile`; set `GROQ_MODEL` to use a different one (check
Groq's console for current model names/limits — free-tier rate limits are
generous but not unlimited).

## Turning on Cirq / PennyLane as extra engines

```bash
pip install cirq        # and/or
pip install pennylane
```

Restart the backend — `engines/__init__.py` registers each one only if it
imports successfully, so nothing else needs to change. Note the Bloch
vector / purity fields come back `null` for Cirq and PennyLane right now
(see below).

## Where to go from here

1. **Fill in Bloch vectors for Cirq/PennyLane.** Right now only the Qiskit
   engine computes per-qubit Bloch vectors + purity (`bloch_vectors`/
   `purities` come back `null` for the other two). Add the equivalent
   partial-trace math in `cirq_engine.py` / `pennylane_engine.py` — the
   frontend already ignores `null` gracefully.
2. **Wire the frontend to `?backend=`.** `EntangleAPI.simulate()` already
   accepts a `backend` argument — add a small selector next to "Run
   Circuit" in `index.html` and pass the chosen engine through, so users can
   compare Qiskit vs. Cirq vs. PennyLane on the same circuit live.
3. **Hook up `/api/ask-tutor` in the UI.** Add a text input under the "AI
   Tutor" card; on submit, call `EntangleAPI.askTutor(question, lastResult)`
   where `lastResult` is whatever `/api/simulate` last returned, and render
   the answer. This gives students a real "why?" box, still grounded.
4. **Real RAG.** Once you have lesson content in a vector store (Qdrant, as
   in the original proposal), retrieve the relevant chunk(s) for the current
   circuit/question inside `ai_tutor.py`'s `_grounded_prompt()` and append
   them to the facts dict before calling OpenAI.
5. **Swap qBraid in for real.** `circuit_canon.py` currently uses Qiskit's
   own OpenQASM 3 exporter as a stand-in. `pip install qbraid` and replace
   `to_canonical_qasm3()` with `qbraid.transpile(qc, "qasm3")` (or whatever
   qBraid's current API calls it) once you're ready — nothing downstream
   needs to change since it's already isolated in one file.
6. **N qubits.** The board, `build_qiskit_circuit`, and the engines are all
   fixed at 2 wires. Generalizing the board's `N_SLOTS`/rows and each
   engine's partial-trace loop to N qubits is the main change needed for a
   real multi-qubit playground.
7. **Progress tracking / instructor dashboard.** `backend/lessons.py` is
   already a separate module specifically so you can back it with a real
   database (SQLite/Postgres) and add a `POST /api/progress` endpoint that
   records which chapters/quizzes a learner has completed — the "Analytics
   page" and "AI insight on progress" boxes in the architecture diagram.
8. **Deploy.** Any free-tier container host (Render, Fly.io, Railway) works
   for the FastAPI backend; the frontend is fully static and can go on
   GitHub Pages / Vercel / Netlify — just update `API_BASE` in
   `frontend/js/api.js` to the deployed backend URL.

## Teaching + accuracy update

- `frontend/js/qmath.js` — tiny reference simulator (complex amplitudes, Bloch vectors, purity,
  coefficient matrix, concurrence, correlation matrix). Convention: outcomes are |q0 q1>, qubit 0 on the left.
- After every run the site compares Qiskit's Bloch vectors + probabilities with `qmath.js` (tolerance 1e-6)
  and shows "Verified" or a mismatch. If the backend is down, the local math drives all pictures.
- Bloch spheres: z-up, labelled poles (|0>,|1>,|+>,|->,|+i>,|-i>), no auto-spin, drag to rotate.
- Probability bars show exact probability plus sampled shots; Qiskit's |q1 q0> keys are flipped to |q0 q1>.
- `frontend/js/correlation.js` — Correlation Space panel (2x2 coefficient matrix + 3x3 <σi⊗σj> heat-map).
- Matrix Lab: "Vector moves / Space moves" toggle (default: axes fixed, only Mv moves).
- `lessons.js`: 7 chapters with live widgets (states, inner product, unitaries, tensor product,
  entanglement, measurement, matrix lab).

## v3: robustness + compact UI
- **Blank tutor fixed.** Reasoning models (gpt-oss) burned the 300-token budget on hidden thinking and returned empty text.
  `ai_tutor.py` now gives 1500 tokens + low reasoning effort, treats empty as failure, and the browser also has its own
  built-in explanation (`localExplain`) so the box is never empty. 25 s timeout; results/bars/spheres render instantly
  from `qmath.js`, then the Qiskit check + AI text arrive.
- **Predict, then test.** Every lesson ends with a challenge (`js/missions.js`): commit to a prediction, one click loads the
  circuit into the Simulator, runs it, opens the right panel and shows a MISSION bar with "Show answer".
- **Compact Simulator.** Two-column layout (board + both spheres | probabilities + Explain/Entanglement tabs).
  Matrix Lab is closed until you open it (also opens from "Open in Matrix Lab"); its Vector / Display / Camera / Result
  sections are folded.

## v4
- AI replies are converted from LaTeX/markdown to plain Unicode in the browser (`cleanTutorText`), and the prompt now asks for plain text.
- Bloch spheres: no wireframe; soft shell + 3 great circles, thick arrow, 2-3x supersampled, sharper labels, 220px.
- Entanglement tab only appears when the circuit contains a CNOT (● badge when actually entangled); otherwise the tab bar is hidden.

## v5: more gates + a new look

**Gate set** — the board, backend and lessons now share one list:

| One qubit | Bloch-sphere action | Two qubits | Notes |
|---|---|---|---|
| `H` | half turn about x+z | `CNOT` | flips target when control is 1 |
| `X`, `Y`, `Z` | half turns about x, y, z | `CZ` | flips the sign of \|11⟩, symmetric |
| `S`, `Sdg` (S†) | ±quarter turn about z | `SWAP` | exchanges the qubits, never entangles |
| `T`, `Tdg` (T†) | ±eighth of a turn about z | | |
| `SX` (√X) | quarter turn about x | | |

Everything that knew about H/X/Z/CNOT was extended:

- `backend/models.py` — `Gate.type` accepts the new names (`SINGLE_QUBIT_GATES` / `TWO_QUBIT_GATES`).
  Two-qubit gates always travel as `{type, control, target}`, even the symmetric CZ and SWAP.
- `backend/circuit_canon.py`, `engines/{qiskit,cirq,pennylane}_engine.py` — each maps the new names to its SDK's gates.
- `frontend/js/qmath.js` — complex matrices for Sdg/T/Tdg/SX plus `applyCZ` / `applySWAP`, so the browser's own
  simulation (and the "Verified against Qiskit" check) covers every gate.
- `frontend/js/circuit-builder.js` — palette + board handle any two-qubit gate (`placePair`), the board has 8 columns,
  the Entanglement tab appears for any two-qubit gate, and the per-qubit Matrix Lab transform knows the new 3×3 rotations.
- `frontend/js/matrix-lab.js` — new presets (S†, T†, √X) and gate recognition, so "Add to circuit" works for all one-qubit gates.
- `frontend/js/lessons.js` / `missions.js` — the unitary checker lists the new gates, and chapter 8 ("More gates") adds a
  gate-composer widget (S·S = Z, T·T = S, √X·√X = X ...) and a SWAP challenge. `backend/lessons.py` mirrors the 8 titles.
- `backend/ai_tutor.py` — the grounded prompt now includes a one-line meaning for every gate used in the circuit.

**Restyle** — `css/style.css` was rewritten (class names unchanged, so no JS depends on the look): warm paper background,
ink text, one green accent, flat colour, serif for titles and lesson text, mono for numbers, wire drawn behind the circuit
slots, and the Matrix Lab as a dark panel that reuses the same components through CSS variables. Gate colours are
`--g` on `.gate-chip.<Gate>` / `.slot.gate-<Gate>`; the palette of the whole site is the `:root` block at the top of the file.
Emoji were removed from the header, the Matrix Lab button and the challenge card.

Adding another gate later: add it to `SINGLE_QUBIT_GATES` and `Gate.type` (models.py), one line in each of
`build_qiskit_circuit` / the Cirq and PennyLane dictionaries, a matrix in `qmath.js` `GATES`, an entry in
`GATE_LABEL` and `BLOCH_GATE_MATRIX` (circuit-builder.js), a chip in `index.html`, and a `--g` colour in `style.css`.
