"""
Engine dispatcher — the "one canonical circuit, any backend" fan-out from
the architecture diagram. Add a new engine by dropping a module here with a
run(gates, shots) -> dict function and registering it below.
"""
from . import qiskit_engine

ENGINES = {"qiskit": qiskit_engine}

# Cirq / PennyLane are optional dependencies; register them only if
# installed so the prototype still boots with just requirements.txt.
try:
    from . import cirq_engine
    ENGINES["cirq"] = cirq_engine
except ImportError:
    pass

try:
    from . import pennylane_engine
    ENGINES["pennylane"] = pennylane_engine
except ImportError:
    pass


def run_on(backend: str, gates, shots: int = 200) -> dict:
    engine = ENGINES.get(backend, ENGINES["qiskit"])
    return engine.run(gates, shots)
