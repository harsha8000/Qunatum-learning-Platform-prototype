"""
Egreen Quanta backend — FastAPI app tying together the modules that mirror
the architecture diagram:

  models.py          -> request/response schemas
  circuit_canon.py    -> canonical circuit / OpenQASM3 layer (qBraid stand-in)
  engines/            -> Qiskit / Cirq / PennyLane, one canonical circuit, any backend
  ai_tutor.py          -> grounded intelligence (OpenAI if configured, else templated)
  lessons.py           -> chapter content for the Lessons page

Run it:
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000

Then open ../frontend/index.html in a browser.
"""
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

import models
from models import CircuitRequest, TutorRequest
from circuit_canon import to_canonical_qasm3
from engines import run_on, ENGINES
import ai_tutor
import lessons as lessons_module

app = FastAPI(title="Egreen Quanta — Learning Platform Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before deploying anywhere real
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "ok",
        "ai_tutor_mode": ai_tutor.mode(),
        "available_engines": list(ENGINES.keys()),
        "try": "POST /api/simulate with a gate list",
    }


@app.get("/api/lessons")
def get_lessons():
    return {"lessons": lessons_module.LESSONS}


@app.post("/api/simulate")
def simulate(req: CircuitRequest, backend: str = Query("qiskit", enum=list(ENGINES.keys()) or ["qiskit"])):
    result = run_on(backend, req.gates, req.shots)

    result["canonical_qasm3"] = to_canonical_qasm3(req.gates)
    # Qiskit labels outcomes |q1 q0>; the whole site (and the tutor) uses |q0 q1>.
    probs_q0q1 = {k[::-1]: v for k, v in (result.get("probabilities") or {}).items()}
    result["explanation"] = ai_tutor.generate_explanation(
        req.gates, result.get("bloch_vectors"), result.get("purities"), probs_q0q1
    ) or "Circuit ran successfully."
    result["tutor_mode"] = ai_tutor.mode()
    result["gates"] = [g.dict(exclude_none=True) for g in req.gates]
    return result


@app.post("/api/ask-tutor")
def ask_tutor(req: TutorRequest):
    return {"answer": ai_tutor.answer_question(
        req.question, req.context, history=req.history, page=req.page,
        chapter=req.chapter, progress=req.progress, focus=req.focus,
    )}


@app.post("/api/suggest-questions")
def suggest_questions(req: models.SuggestRequest):
    return {"questions": ai_tutor.suggest_questions(
        req.context, page=req.page, chapter=req.chapter, progress=req.progress,
    )}
