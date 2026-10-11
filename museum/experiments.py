"""
The five locks of the museum, as circuits.

Every circuit measures all of its qubits once, at the end, so it runs on
the built-in simulator, the IBM noise models and IonQ's simulators alike.
Classical bit i always holds qubit i.

Room I    1801  Young's double slit       one-qubit interferometer, with and
                                          without a which-path detector
Room II   1964  Bell's theorem (CHSH)     an entangled pair measured at the
                                          four CHSH settings
Room III  1985  Deutsch's algorithm       four sealed boxes, asked once
                                          (quantum) or twice (classical)
Room IV   1993  Teleportation             a state moved with one entangled
                                          pair and two classical bits
Room V    1996  Grover's search           one search step finds 1 card in 4
"""

import math

from qiskit import QuantumCircuit

YOUNG_PHASES = [0, 45, 90, 135, 180, 225, 270, 315]

# CHSH settings: measurement directions in the X-Z plane (radians from Z).
# These give E = cos(a - b) on |Phi+> and the largest possible violation.
BELL_ALICE = [0.0, math.pi / 2]
BELL_BOB = [math.pi / 4, -math.pi / 4]

DEUTSCH_BOXES = {
    "c0": {"kind": "constant", "rule": "f(0) = 0, f(1) = 0"},
    "c1": {"kind": "constant", "rule": "f(0) = 1, f(1) = 1"},
    "b0": {"kind": "balanced", "rule": "f(0) = 0, f(1) = 1"},
    "b1": {"kind": "balanced", "rule": "f(0) = 1, f(1) = 0"},
}

TELEPORT_ANGLES = [0, 60, 90, 120, 180]

GROVER_MARKS = ["00", "01", "10", "11"]

# IonQ jobs on Qollab take one circuit of up to 29 qubits on the Forte
# simulators. These experiments fill exactly 29 qubits side by side.
IONQ_PACK = [
    "young_free_0", "young_free_90", "young_free_180", "young_free_270",   # 4
    "bell_00", "bell_01", "bell_10", "bell_11",                           # 8
    "grover_00", "grover_01", "grover_10", "grover_11",                   # 8
    "teleport_60", "teleport_90", "teleport_120",                         # 9
]


def _measure_all(qc):
    qc.measure(list(range(qc.num_qubits)), list(range(qc.num_qubits)))
    return qc


# --------------------------------------------------------------------------
# Room I: Young
# --------------------------------------------------------------------------

def young(phase_deg, watched):
    """
    A photon meets a beam splitter (H), picks up a path difference (phase),
    and meets a second beam splitter (H). Output 0 is the bright port.
    P(0) = cos^2(phase/2): interference.

    With a which-path detector (a second qubit copying the path), the paths
    are no longer indistinguishable and P(0) = 1/2 for every phase.
    """
    n = 2 if watched else 1
    qc = QuantumCircuit(n, n, name=f"young_{'watch' if watched else 'free'}_{phase_deg}")
    qc.h(0)
    if watched:
        qc.cx(0, 1)
    qc.p(math.radians(phase_deg), 0)
    qc.h(0)
    return _measure_all(qc)


# --------------------------------------------------------------------------
# Room II: Bell / CHSH
# --------------------------------------------------------------------------

def bell(a, b):
    """
    Alice (q0) and Bob (q1) share |Phi+> = (|00> + |11>)/sqrt(2).
    Each measures along a direction in the X-Z plane: rotating by -angle
    with RY and then measuring Z measures the spin along that direction.
    """
    qc = QuantumCircuit(2, 2, name=f"bell_{a}{b}")
    qc.h(0)
    qc.cx(0, 1)
    qc.ry(-BELL_ALICE[a], 0)
    qc.ry(-BELL_BOB[b], 1)
    return _measure_all(qc)


# --------------------------------------------------------------------------
# Room III: Deutsch
# --------------------------------------------------------------------------

def _oracle(qc, box, x, y):
    """|x, y> -> |x, y XOR f(x)> for the box's hidden function f."""
    if box == "c1":
        qc.x(y)
    elif box == "b0":
        qc.cx(x, y)
    elif box == "b1":
        qc.cx(x, y)
        qc.x(y)


def deutsch_quantum(box):
    """One query. q0 reads 0 if f is constant, 1 if f is balanced."""
    qc = QuantumCircuit(2, 2, name=f"deutsch_q_{box}")
    qc.x(1)
    qc.h([0, 1])
    _oracle(qc, box, 0, 1)
    qc.h(0)
    return _measure_all(qc)


def deutsch_classical(box, x):
    """One classical query: q0 holds the input x, q1 reads f(x)."""
    qc = QuantumCircuit(2, 2, name=f"deutsch_c_{box}_{x}")
    if x:
        qc.x(0)
    _oracle(qc, box, 0, 1)
    return _measure_all(qc)


# --------------------------------------------------------------------------
# Room IV: Teleportation
# --------------------------------------------------------------------------

def teleport(theta_deg):
    """
    q0 holds the message RY(theta)|0>. q1 and q2 share an entangled pair.
    Alice entangles the message with her half and 'measures' q0 and q1.
    Bob's corrections (X if q1, Z if q0) are applied as controlled gates
    (the deferred-measurement principle: same statistics as measuring
    first and sending two classical bits, and it runs on machines without
    mid-circuit measurement). Finally RY(-theta) undoes the message on
    Bob's qubit: q2 reads 0 exactly when the message arrived.
    """
    t = math.radians(theta_deg)
    qc = QuantumCircuit(3, 3, name=f"teleport_{theta_deg}")
    qc.ry(t, 0)
    qc.h(1)
    qc.cx(1, 2)
    qc.cx(0, 1)
    qc.h(0)
    qc.cx(1, 2)
    qc.cz(0, 2)
    qc.ry(-t, 2)
    return _measure_all(qc)


def relay(theta_deg):
    """
    The classical alternative to teleportation: measure the message and
    phone the result (the CNOT copies the Z value onto Bob's qubit, which is
    the deferred-measurement form of 'measure, send one bit, re-prepare').
    RY(-theta) then checks Bob's qubit: q1 reads 0 when the copy matches.
    Success is cos^4(theta/2) + sin^4(theta/2), at best 2/3 on average.
    """
    t = math.radians(theta_deg)
    qc = QuantumCircuit(2, 2, name=f"relay_{theta_deg}")
    qc.ry(t, 0)
    qc.cx(0, 1)
    qc.ry(-t, 1)
    return _measure_all(qc)


# --------------------------------------------------------------------------
# Room V: Grover
# --------------------------------------------------------------------------

def grover(mark):
    """
    Four cards, one marked. One oracle call plus one diffusion step finds
    the marked card with certainty (ideal). mark is 'q0q1'.
    """
    qc = QuantumCircuit(2, 2, name=f"grover_{mark}")
    qc.h([0, 1])
    flips = [q for q, bit in enumerate(mark) if bit == "0"]
    if flips:
        qc.x(flips)
    qc.cz(0, 1)
    if flips:
        qc.x(flips)
    qc.h([0, 1])
    qc.x([0, 1])
    qc.cz(0, 1)
    qc.x([0, 1])
    qc.h([0, 1])
    return _measure_all(qc)


# --------------------------------------------------------------------------
# All circuits
# --------------------------------------------------------------------------

def build_all():
    """Return (circuits, meta); meta[i] describes circuits[i]."""
    circuits, meta = [], []

    def add(qc, **info):
        info["id"] = qc.name
        info["n_qubits"] = qc.num_qubits
        circuits.append(qc)
        meta.append(info)

    for phase in YOUNG_PHASES:
        add(young(phase, False), room="young", phase=phase, watched=False)
    for phase in YOUNG_PHASES:
        add(young(phase, True), room="young", phase=phase, watched=True)
    for a in (0, 1):
        for b in (0, 1):
            add(bell(a, b), room="bell", a=a, b=b)
    for box in DEUTSCH_BOXES:
        add(deutsch_quantum(box), room="deutsch", box=box, mode="quantum")
        for x in (0, 1):
            add(deutsch_classical(box, x), room="deutsch", box=box, mode="classical", x=x)
    for theta in TELEPORT_ANGLES:
        add(teleport(theta), room="teleport", theta=theta)
    for theta in TELEPORT_ANGLES:
        add(relay(theta), room="teleport", theta=theta, mode="relay")
    for mark in GROVER_MARKS:
        add(grover(mark), room="grover", mark=mark)
    return circuits, meta
