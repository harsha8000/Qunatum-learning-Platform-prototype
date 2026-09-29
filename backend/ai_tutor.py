"""
Grounded AI tutor.

If GROQ_API_KEY is set in the environment, every explanation and every
free-form question is answered by a Groq-hosted model, but the prompt ONLY
ever contains numbers that actually came out of the simulator (bloch
vectors, purities, measured probabilities) — the model is instructed not to
invent any figure that isn't given to it. This is the "grounded
intelligence" box in the architecture diagram; swap GROQ_MODEL for a RAG
pipeline later by retrieving lesson chunks here and appending them to the
prompt.

Groq's API is OpenAI-compatible, so this still uses the `openai` Python
package — just pointed at Groq's base_url with a Groq API key and model
name instead of OpenAI's. (To go back to real OpenAI, or add it as a
second option, see the comment on `_client` below.)

If no key is set, everything falls back to the original templated
explanation so the app still runs out of the box with zero API cost.
"""
import os
from typing import List, Optional, Dict, Any

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
# Groq deprecated llama-3.3-70b-versatile on 2026-08-16; openai/gpt-oss-120b is
# their recommended replacement (qwen/qwen3.6-27b is the lighter alternative —
# set GROQ_MODEL to switch without touching this file).
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

_client = None
if GROQ_API_KEY:
    try:
        from openai import OpenAI
        # Same client class as OpenAI — only base_url + key differ. If you
        # ever want OpenAI itself again, drop this base_url argument and
        # read OPENAI_API_KEY instead.
        _client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    except ImportError:
        _client = None  # `pip install openai` not done yet — fall back quietly


def mode() -> str:
    return "groq" if _client else "templated"


# ---------------------------------------------------------------- templated
def _describe_direction(v: dict) -> str:
    x, y, z = v["x"], v["y"], v["z"]
    mag = (x * x + y * y + z * z) ** 0.5
    if mag < 0.15:
        return "sitting right at the center of the sphere - no definite direction at all"
    if z > 0.7:
        return "pointing mostly toward |0⟩"
    if z < -0.7:
        return "pointing mostly toward |1⟩"
    return "out along the equator - a superposition of |0⟩ and |1⟩"


def _templated_explanation(gates, bloch_vectors, purities, probabilities) -> str:
    if not gates:
        return "The circuit is empty - drag a gate onto a wire to get started."
    if not bloch_vectors or not purities:
        return "Circuit ran. (Bloch/purity data isn't available for this backend yet.)"

    lines = []
    for i, (v, p) in enumerate(zip(bloch_vectors, purities)):
        lines.append(f"Qubit {i} is {_describe_direction(v)} (purity {p:.2f}).")

    min_purity = min(purities)
    if min_purity < 0.9:
        lines.append(
            "Both qubits are mixed rather than pure - that's the signature of "
            "entanglement. Neither qubit has a well-defined state on its own "
            "anymore; only the pair, taken together, is in a definite state."
        )
        outcomes = sorted(probabilities.items(), key=lambda kv: -kv[1])
        nonzero = [o for o in outcomes if o[1] > 1e-6]
        if len(nonzero) <= 2 and nonzero:
            top = nonzero[0]
            lines.append(
                f"Measure both qubits and you'll only ever see a small set of "
                f"matching outcomes - about {top[1]*100:.0f}% of the time you'll "
                f"see '{top[0]}'. You won't see every possible combination."
            )
    else:
        lines.append(
            "Both qubits are still in pure states - they're not entangled with "
            "each other. Whatever happens to one qubit tells you nothing about "
            "the other."
        )
        outcomes = sorted(probabilities.items(), key=lambda kv: -kv[1])
        if outcomes:
            top = outcomes[0]
            if top[1] > 0.99:
                lines.append(f"This circuit is fully deterministic: it always measures '{top[0]}'.")
            else:
                lines.append(
                    f"Measuring will give '{top[0]}' about {top[1]*100:.0f}% of the time, "
                    f"based purely on each qubit's own superposition - not on any correlation "
                    f"between them."
                )
    return " ".join(lines)


# -------------------------------------------------------------------- LLM
# What each gate name in the request means. Sent along with the facts so the
# model describes S†, √X, CZ ... correctly instead of guessing from the label.
GATE_GLOSSARY = {
    "H": "Hadamard: |0> -> |+>, half turn about the x+z diagonal of the Bloch sphere",
    "X": "NOT: flips 0 and 1, half turn about x",
    "Y": "half turn about y",
    "Z": "flips the sign of |1>, half turn about z",
    "S": "quarter turn about z (phase i on |1>)",
    "Sdg": "S-dagger: quarter turn about z the other way, undoes S",
    "T": "eighth of a turn about z (phase e^(i*pi/4) on |1>)",
    "Tdg": "T-dagger: eighth of a turn about z the other way, undoes T",
    "SX": "square root of X: quarter turn about x, two of them make an X",
    "CNOT": "flips the target qubit when the control is 1; can create entanglement",
    "CZ": "flips the sign of |11>; symmetric in its two qubits; can create entanglement",
    "SWAP": "exchanges the two qubits' states; cannot create entanglement",
}


def _grounded_prompt(facts: Dict[str, Any], question: Optional[str] = None) -> List[dict]:
    system = (
        "You are a friendly quantum computing tutor inside a learning app. "
        "You must explain results using ONLY the numeric facts given to you "
        "in the user message below. Never invent or estimate a number, gate, "
        "or outcome that isn't present in those facts. Keep answers short "
        "(3-6 sentences), plain-language, and Feynman-style: build intuition "
        "before reaching for formalism. Output PLAIN TEXT only: no LaTeX, no markdown, no bullet symbols. "
        "Write kets with Unicode, like |0⟩, |1⟩, |+⟩, |00⟩, and use ψ, α, β, √2, ⊗ directly."
    )
    user = f"Facts from the simulator: {facts}"
    if question:
        user += f"\n\nStudent's question: {question}"
    else:
        user += "\n\nExplain what this circuit does and why, in plain language."
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _ask_llm(messages) -> str:
    """One place that calls the model and guarantees a NON-EMPTY string or raises.

    Why this exists: reasoning models (e.g. openai/gpt-oss-*) spend part of
    max_tokens on hidden "thinking". With a small max_tokens the visible
    `content` can come back None/"" — which the UI showed as a blank tutor box.
    We give it a bigger budget, ask for low reasoning effort, and treat any
    empty answer as a failure so the caller falls back to the built-in text.
    """
    kwargs = dict(model=GROQ_MODEL, messages=messages, temperature=0.4, max_tokens=1500, timeout=20)
    if "gpt-oss" in GROQ_MODEL:
        kwargs["extra_body"] = {"reasoning_effort": "low"}
    resp = _client.chat.completions.create(**kwargs)
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("model returned an empty answer")
    return text


def generate_explanation(gates, bloch_vectors, purities, probabilities) -> str:
    fallback = _templated_explanation(gates, bloch_vectors, purities, probabilities)
    if not _client:
        return fallback

    facts = {
        "note": "outcome labels are |q0 q1>, qubit 0 on the left",
        "gates": [g.dict(exclude_none=True) for g in gates],
        "gate_meanings": {g.type: GATE_GLOSSARY.get(g.type, "") for g in gates},
        "bloch_vectors": bloch_vectors,
        "purities": purities,
        "probabilities": probabilities,
    }
    try:
        return _ask_llm(_grounded_prompt(facts))
    except Exception as e:  # network/quota/empty — never break the simulator over this
        print(f"[ai_tutor] LLM call failed: {e}")
        return fallback + "\n\n(AI tutor unavailable right now, so this is the built-in explanation.)"


# ------------------------------------------------------------- per-page tutors
# Three independent tutor "personas" — Lessons, Simulator, Progress — each with
# its own system prompt and its own slice of context. Each page's chat also
# already has its own history thread (kept client-side, per page), so nothing
# said or asked on one page leaks into another: a shared style base, but the
# domain, the facts offered, and the focus are all page-specific.
CHAT_SYSTEM_BASE = (
    "You are a friendly quantum computing tutor inside a learning app for a complete beginner. "
    "Use plain, Feynman-style language: intuition first, maths only when needed. Standard textbook facts "
    "(for example H|0> = |+>) are fine, but never invent or estimate a number that isn't given to you in "
    "the facts below. Keep replies to 3-7 sentences. Output PLAIN TEXT only: no LaTeX, no markdown, no "
    "bullet symbols. Write kets with Unicode, like |0⟩, |1⟩, |+⟩, |00⟩, and use ψ, α, β, √2, ⊗ directly."
)

CHAT_SYSTEM_LESSONS = CHAT_SYSTEM_BASE + (
    "\n\nYou are the Lessons tutor. The student is reading one specific chapter right now — stay inside "
    "that chapter's own topic (it's given to you below as 'Current lesson chapter'). Explain its concepts, "
    "give analogies for it, and answer follow-ups about it. Don't bring up their simulator circuit or their "
    "quiz score unless the student explicitly asks about one of those. Every time the chapter changes, treat "
    "it as a fresh topic — do not assume anything carries over from a chapter discussed earlier."
)

CHAT_SYSTEM_SIMULATOR = CHAT_SYSTEM_BASE + (
    "\n\nYou are the Simulator tutor. The student is building and running circuits — stay inside that: "
    "their gates, their Bloch vectors, their purities, their measured probabilities ('Simulator facts' "
    "below). Use ONLY those numbers, never invent or estimate one. If they ask about their circuit and no "
    "facts are given, tell them to press Run in the Simulator first. Don't bring up lesson chapters or quiz "
    "results unless the student explicitly asks about one of those."
)

CHAT_SYSTEM_PROGRESS = CHAT_SYSTEM_BASE + (
    "\n\nYou are the Progress tutor. The student is reviewing their quiz results across the whole course — "
    "stay inside that: which chapters they got right or wrong, and which chapters they haven't tried yet. "
    "If a practice question is provided as 'Practice question being discussed', use its official explanation; "
    "when the student picked a wrong answer, be kind and explain the idea rather than just restating the "
    "right answer. If they ask for a hint, do not reveal the answer. Help them decide what to review or "
    "which lesson to start next. Don't bring up a specific simulator circuit unless the student explicitly "
    "asks about one."
)

_CHAT_SYSTEM_BY_PAGE = {
    "lessons": CHAT_SYSTEM_LESSONS,
    "simulator": CHAT_SYSTEM_SIMULATOR,
    "progress": CHAT_SYSTEM_PROGRESS,
}


def _chat_messages(question, context, history, page, chapter, progress, focus) -> List[dict]:
    system = _CHAT_SYSTEM_BY_PAGE.get(page, CHAT_SYSTEM_BASE)
    ctx = []
    # Each page's tutor is offered the facts that belong to ITS domain first;
    # the others are still included (a student can always ask off-topic), but
    # the system prompt above is what keeps each tutor's own suggestions and
    # default focus from drifting into the other pages' territory.
    if page == "lessons":
        ctx.append(f"Current lesson chapter: {chapter}." if chapter else "No chapter open yet.")
    elif page == "simulator":
        ctx.append(f"Simulator facts (outcome labels are |q0 q1>, qubit 0 on the left): {context}" if context
                   else "Simulator facts: none yet (the student has not run a circuit).")
    elif page == "progress":
        if progress:
            ctx.append(f"Session quiz progress: {progress}")
        if focus:
            ctx.append(f"Practice question being discussed: {focus}")
    else:
        ctx.append(f"Simulator facts (outcome labels are |q0 q1>, qubit 0 on the left): {context}" if context
                   else "Simulator facts: none yet (the student has not run a circuit).")
        if chapter:
            ctx.append(f"Current lesson chapter: {chapter}.")
        if progress:
            ctx.append(f"Session quiz progress: {progress}")
        if focus:
            ctx.append(f"Practice question being discussed: {focus}")
    msgs = [{"role": "system", "content": system + "\n\n" + "\n".join(ctx)}]
    for h in (history or [])[-8:]:
        role, text = h.get("role"), str(h.get("content", ""))[:1500]
        if role in ("user", "assistant") and text:
            msgs.append({"role": role, "content": text})
    msgs.append({"role": "user", "content": question[:1500]})
    return msgs


SUGGEST_SYSTEM_BASE = (
    "You suggest short follow-up questions a beginner could ask a quantum computing tutor chat. Return "
    "EXACTLY 3 questions, each under 12 words, in the student's own voice (\"Why...\", \"What if...\", "
    "\"How does...\"). Output ONLY the 3 questions, one per line, no numbering, no quotes, no extra text."
)

# Each page gets its own suggestion persona, scoped to its own domain only — the
# Lessons tutor never suggests simulator or quiz questions, the Simulator tutor
# never suggests lesson or quiz questions, and so on. Swapping pages (or chapters,
# or circuits) resets this: the caller invalidates the cached chips on every such
# change (see tutor.js), so a fresh, on-topic set is fetched right after.
SUGGEST_SYSTEM_LESSONS = SUGGEST_SYSTEM_BASE + (
    "\n\nThe student is reading ONE specific lesson chapter (given below). Every question must be about "
    "that chapter's own content only — never about a simulator circuit or a quiz score, even in passing. "
    "Ground the questions in the chapter's title/topic rather than asking something generic."
)

SUGGEST_SYSTEM_SIMULATOR = SUGGEST_SYSTEM_BASE + (
    "\n\nThe student is in the circuit Simulator. Every question must be about THEIR circuit and its real "
    "results (gates, Bloch vectors, purities, measured probabilities), given below — never about a lesson "
    "chapter or a quiz score. If no circuit has been run yet, suggest questions about building or running one."
)


def _suggest_prompt_lessons(chapter) -> str:
    return f"Current lesson chapter: {chapter}." if chapter else "They haven't opened a chapter yet."


def _suggest_prompt_simulator(context) -> str:
    return f"The student's last simulator run: {context}" if context else "They haven't run a circuit yet."


def _fallback_lessons(chapter) -> List[str]:
    if not chapter:
        return ["What should I learn first?", "How does this app work?", "Where do I start?"]
    return [f"Explain \"{chapter}\" more simply", f"Give me an everyday analogy for {chapter}",
            f"What's the key takeaway from \"{chapter}\"?"]


def _fallback_simulator(context) -> List[str]:
    if context and context.get("gates"):
        return ["Why does my circuit give these results?", "Is my circuit entangled?", "What should I try next?"]
    return ["What gate should I start with?", "How do I build a Bell state?", "What does entanglement look like here?"]


def _progress_suggestions(progress) -> List[str]:
    """Rule-based, not left to the model: the Progress tutor's chips must always
    steer toward finishing the lesson plan — reviewing a wrong answer first (if
    any), then starting the next not-yet-attempted lesson (if any) — so this
    priority is enforced directly rather than just hoped for from a prompt."""
    results = (progress or {}).get("results") or []
    wrong = [r["chapter"] for r in results if r.get("answered") and not r.get("correct")]
    unanswered = [r["chapter"] for r in results if not r.get("answered")]
    out = []
    if wrong:
        out.append(f"Can we review \"{wrong[0]}\" — I got it wrong?")
    if unanswered:
        out.append(f"Should I start the lesson on \"{unanswered[0]}\" next?")
    if len(wrong) > 1:
        out.append(f"Can we go over \"{wrong[1]}\" too?")
    elif len(unanswered) > 1:
        out.append(f"What about \"{unanswered[1]}\" after that?")
    elif wrong or unanswered:
        out.append("What should I revisit before moving on?")
    if not out:
        out = ["I've finished everything — what should I review to make it stick?",
               "Which topic is easiest to forget?", "Quiz me on what I've learned so far"]
    return out[:3]


def suggest_questions(context, page=None, chapter=None, progress=None) -> List[str]:
    """3 short, personalized follow-up questions — generated independently per page,
    each tutor only ever seeing (and only ever suggesting about) its own domain."""
    if page == "progress":
        # Deterministic on purpose: lesson-plan completion is a hard business
        # rule for this tutor, not a stylistic preference to leave to the LLM.
        return _progress_suggestions(progress)

    if page == "simulator":
        system, prompt, fallback = SUGGEST_SYSTEM_SIMULATOR, _suggest_prompt_simulator(context), _fallback_simulator(context)
    elif page == "lessons":
        system, prompt, fallback = SUGGEST_SYSTEM_LESSONS, _suggest_prompt_lessons(chapter), _fallback_lessons(chapter)
    else:
        # Unknown/no page (e.g. a direct API call without one): keep the old
        # generic, everything-goes behavior rather than guessing a domain.
        system = SUGGEST_SYSTEM_BASE + "\n\nPrefer questions grounded in whatever facts are given below."
        parts = []
        if context:
            parts.append(f"The student's last simulator run: {context}")
        if chapter:
            parts.append(f"Current lesson chapter: {chapter}.")
        if progress and progress.get("results"):
            wrong = [r["chapter"] for r in progress["results"] if r.get("answered") and not r.get("correct")]
            if wrong:
                parts.append(f"They got these practice questions wrong: {', '.join(wrong)}.")
        prompt = "\n".join(parts) or "They have just opened the app and haven't done anything yet."
        fallback = ["What should I learn next?", "How is this used in real quantum computers?", "Quiz me on what I've learned so far"]

    if not _client:
        return fallback
    try:
        text = _ask_llm([{"role": "system", "content": system}, {"role": "user", "content": prompt}])
        qs = [q.strip(" -*0123456789.\t") for q in text.splitlines() if q.strip()]
        return qs[:3] if len(qs) >= 2 else fallback
    except Exception as e:
        print(f"[ai_tutor] suggest_questions failed: {e}")
        return fallback


def _offline_answer(focus: Optional[Dict[str, Any]]) -> str:
    if focus and focus.get("explanation"):
        pick, right = focus.get("student_pick"), focus.get("correct_answer")
        head = ""
        if pick and right:
            head = "You picked the right answer. " if pick == right else f"The answer is \"{right}\". "
        return head + focus["explanation"] + (
            "\n\n(Built-in explanation: set GROQ_API_KEY and restart the backend to chat freely with the AI tutor.)")
    return (
        "The AI tutor is running in templated mode (no GROQ_API_KEY set), so it can't answer open-ended "
        "questions yet. Set GROQ_API_KEY and restart the backend to enable chat. Meanwhile, the practice "
        "questions on the Progress tab come with built-in explanations."
    )


def answer_question(question: str, context: Optional[Dict[str, Any]], history=None, page=None,
                    chapter=None, progress=None, focus=None) -> str:
    """Free-form chat, grounded in the last simulate() result, the current chapter and quiz progress."""
    if not _client:
        return _offline_answer(focus)
    try:
        return _ask_llm(_chat_messages(question, context, history, page, chapter, progress, focus))
    except Exception as e:
        print(f"[ai_tutor] LLM call failed: {e}")
        return "Sorry, the AI tutor couldn't answer just now. Please try again in a moment."
