"""
Lesson content, served over the API so an instructor dashboard (or the
'AI insight on progress' box in the architecture diagram) can eventually
read/write it from a real database instead of this hardcoded list.

The frontend currently ships its own copy in frontend/js/lessons.js for
zero-latency first load; point js/nav.js at EntangleAPI.getLessons() once
you're ready to make this the single source of truth (see README).
"""

LESSONS = [
    {"title": "What is a quantum state?", "summary": "Amplitudes, normalization and the Bloch sphere."},
    {"title": "Products between states: the inner product", "summary": "The inner product, and how much two states overlap."},
    {"title": "Unitary operators: what a gate is", "summary": "Every gate is a rotation: unitary matrices, U†U = I."},
    {"title": "Two qubits: the tensor product", "summary": "Independent qubits multiply: a ⊗ b."},
    {"title": "Entanglement and Correlation Space", "summary": "det C, concurrence and the correlation heat-map T."},
    {"title": "Measurement, probabilities and trusting the pictures", "summary": "Probabilities, shots and how the site checks its own pictures."},
    {"title": "Matrix Lab: does the vector move, or does space?", "summary": "Does the vector move, or does space? Every gate as a 3×3 matrix."},
    {"title": "More gates: phases, √X, CZ and SWAP", "summary": "S, T, √X, Y, CZ and SWAP: the rest of the gate palette."},
]
