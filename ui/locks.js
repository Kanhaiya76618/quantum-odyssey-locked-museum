// The five locked doors. Each one can only be opened reliably with a quantum
// resource; the classical alternative is right next to it, with its odds.
import { h, s, replace } from './dom.js';
import { sampleShot, pct, num, shuffle } from './data.js';
import { fringeChart } from './charts.js';

export const DOORS = {
  young: {
    name: 'Young’s door', year: '1801',
    rule: 'Send five photons in a row into the dark port.',
  },
  bell: {
    name: 'Bell’s door', year: '1964',
    rule: 'Win at least 80 of 100 rounds of the CHSH game.',
  },
  deutsch: {
    name: 'Deutsch’s door', year: '1985',
    rule: 'Sort four sealed boxes into constant and balanced, using at most four questions.',
  },
  teleport: {
    name: 'Bennett’s door', year: '1993',
    rule: 'Get the key state across to the other side ten times in a row.',
  },
  grover: {
    name: 'Grover’s door', year: '1996',
    rule: 'Find the key card in one look, three times in a row.',
  },
};

// Circuits a door needs from a data set.
export const NEEDS = {
  young: 'young_free_180',
  bell: 'bell_11',
  deutsch: 'deutsch_q_b1',
  teleport: 'teleport_90',
  grover: 'grover_11',
};

const KEY_ANGLES = [60, 90, 120];

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------

function binomTail(n, p, k) {
  if (p >= 1) return 1;
  if (p <= 0) return k <= 0 ? 1 : 0;
  const lf = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  let sum = 0;
  for (let x = k; x <= n; x++) sum += Math.exp(lf[n] - lf[x] - lf[n - x] + x * Math.log(p) + (n - x) * Math.log(1 - p));
  return Math.min(1, sum);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** { classical, quantum, classicalLabel, quantumLabel } for one door and one run summary. */
export function odds(key, sum) {
  if (key === 'young' && sum.young && sum.young.free['180'] !== undefined) {
    return { classical: 0.5 ** 5, quantum: (1 - sum.young.free['180']) ** 5, classicalLabel: 'a particle through a random slit', quantumLabel: 'interference at 180°' };
  }
  if (key === 'bell' && sum.bell) {
    return { classical: binomTail(100, 0.75, 80), quantum: binomTail(100, sum.bell.win, 80), classicalLabel: 'hidden instructions', quantumLabel: 'an entangled pair' };
  }
  if (key === 'deutsch' && sum.deutsch) {
    const q = Object.values(sum.deutsch.quantum).reduce((a, b) => a * b, 1);
    return { classical: 0.25, quantum: q, classicalLabel: 'two boxes asked twice, two guessed', quantumLabel: 'one quantum question per box' };
  }
  if (key === 'teleport' && sum.teleport) {
    const angles = KEY_ANGLES.filter((a) => sum.teleport.fidelity[String(a)] !== undefined);
    const relay = (a) => (sum.teleport.relay && sum.teleport.relay[String(a)] !== undefined
      ? sum.teleport.relay[String(a)]
      : Math.cos((a * Math.PI) / 360) ** 4 + Math.sin((a * Math.PI) / 360) ** 4);
    return {
      classical: mean(angles.map((a) => relay(a) ** 10)),
      quantum: mean(angles.map((a) => sum.teleport.fidelity[String(a)] ** 10)),
      classicalLabel: 'measure and resend', quantumLabel: 'teleportation',
    };
  }
  if (key === 'grover' && sum.grover) {
    return { classical: 0.25 ** 3, quantum: mean(Object.values(sum.grover.found).map((p) => p ** 3)), classicalLabel: 'turning one card', quantumLabel: 'one Grover search' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function pips(n, filled) {
  return h('div', { class: 'pips', role: 'img', 'aria-label': `${filled} of ${n}` },
    Array.from({ length: n }, (_, i) => h('span', { class: `pip ${i < filled ? 'on' : ''}` })));
}

function segmented(label, options, current, onPick) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([value, text, disabled]) => h('button', {
      type: 'button',
      disabled: Boolean(disabled),
      'aria-pressed': value === current ? 'true' : 'false',
      onclick: () => onPick(value),
    }, text)));
}

function oddsLine(o) {
  if (!o) return null;
  return h('p', { class: 'odds' },
    h('span', { class: 'odds-classical' }, `Classical odds (${o.classicalLabel}): ${pct(o.classical, 1)}`),
    h('span', { class: 'odds-quantum' }, `Quantum odds (${o.quantumLabel}, measured): ${pct(o.quantum, 1)}`),
  );
}

function circuitBox(ctx) {
  const pre = h('pre', { class: 'circuit-text', tabindex: '0' });
  const cap = h('p', { class: 'circuit-caption' });
  return {
    el: h('details', { class: 'circuit' }, h('summary', null, 'The circuit behind this door'), cap, pre),
    show(id, caption) {
      pre.textContent = (ctx.drawings && ctx.drawings[id]) || 'Drawing not available.';
      pre.setAttribute('aria-label', `Circuit diagram: ${caption}`);
      cap.textContent = caption;
    },
  };
}

function openedBanner(ctx, key) {
  return ctx.isOpen(key)
    ? h('div', { class: 'opened' },
      h('p', { class: 'verdict good' }, 'The door is open.'),
      h('button', { type: 'button', class: 'btn-primary', onclick: () => ctx.climb(key) }, ctx.nextLabel(key)))
    : null;
}

// ---------------------------------------------------------------------------
// Young: interference
// ---------------------------------------------------------------------------

function lockYoung(box, ctx, use) {
  const { run } = use;
  const sum = run.summary.young;
  const phases = Object.keys(sum.free).map(Number).sort((a, b) => a - b);
  const hasWatch = Object.keys(sum.watch).length > 0;
  const st = { i: 0, watch: false, streak: 0, last: null };
  const circ = circuitBox(ctx);
  const label = h('label', { for: 'lock-phase', class: 'control-label' });
  const slider = h('input', {
    type: 'range', id: 'lock-phase', min: 0, max: phases.length - 1, step: 1, value: 0,
    oninput: (e) => { st.i = Number(e.target.value); st.streak = 0; st.last = null; update(); },
  });
  const toggle = h('button', {
    type: 'button', class: 'btn-toggle', disabled: !hasWatch,
    onclick: () => { st.watch = !st.watch; st.streak = 0; st.last = null; update(); },
  });
  const chart = h('div', { class: 'chart-box' });
  const info = h('p', { class: 'readout' });
  const status = h('div', { class: 'lock-status', 'aria-live': 'polite' });

  const id = () => `young_${st.watch ? 'watch' : 'free'}_${phases[st.i]}`;

  function fire() {
    const dark = sampleShot(run.counts[id()])[0] === '1';
    st.streak = dark ? st.streak + 1 : 0;
    st.last = dark ? 'dark' : 'bright';
    if (st.streak >= 5) ctx.open('young');
    update();
  }

  function update() {
    const phase = phases[st.i];
    label.textContent = `Path difference: ${phase}°`;
    slider.setAttribute('aria-valuetext', `${phase} degrees`);
    toggle.setAttribute('aria-pressed', st.watch ? 'true' : 'false');
    toggle.textContent = hasWatch ? (st.watch ? 'Which-path detector: on' : 'Which-path detector: off') : 'Which-path detector: not in this data set';
    replace(chart, fringeChart({ free: sum.free, watch: sum.watch, current: phase, showWatch: st.watch }));
    const pDark = 1 - (st.watch ? sum.watch : sum.free)[String(phase)];
    info.textContent = `At this setting the dark port fired on ${pct(pDark)} of measured shots, so five in a row happens ${pct(pDark ** 5)} of the time.`;
    replace(status,
      pips(5, st.streak),
      h('p', null, st.last === null ? 'Dark-port streak: 0 of 5.' : `That photon reached the ${st.last} port. Streak: ${st.streak} of 5.`),
      openedBanner(ctx, 'young'),
    );
    circ.show(id(), `${st.watch ? 'With' : 'Without'} the which-path detector, path difference ${phase}°`);
  }

  replace(box,
    h('p', { class: 'lock-story' }, 'The chart shows how often the photon reaches the bright port. A particle picking one slit at random would land in the dark port half the time; a wave can be steered there every time.'),
    h('div', { class: 'controls' }, label, slider, toggle),
    chart,
    info,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn-primary', onclick: fire }, 'Send a photon')),
    status,
    oddsLine(odds('young', run.summary)),
    circ.el,
  );
  update();
}

// ---------------------------------------------------------------------------
// Bell: the CHSH game
// ---------------------------------------------------------------------------

function lockBell(box, ctx, use) {
  const { run } = use;
  const sum = run.summary.bell;
  const st = { mode: 'quantum', result: null };
  const circ = circuitBox(ctx);
  const modeBox = h('div', { class: 'controls' });
  const status = h('div', { class: 'lock-status', 'aria-live': 'polite' });

  function play() {
    let wins = 0;
    const tally = { '00': 0, '01': 0, '10': 0, '11': 0 };
    for (let r = 0; r < 100; r++) {
      const x = Math.round(Math.random());
      const y = Math.round(Math.random());
      tally[`${x}${y}`] += 1;
      let a = 0;
      let b = 0;
      if (st.mode === 'quantum') {
        const shot = sampleShot(run.counts[`bell_${x}${y}`]);
        a = Number(shot[0]);
        b = Number(shot[1]);
      }
      if ((a ^ b) === (x & y)) wins += 1;
    }
    st.result = { wins, tally };
    if (wins >= 80) ctx.open('bell');
    update();
  }

  function update() {
    replace(modeBox, segmented('Alice and Bob’s strategy', [['classical', 'Hidden instructions'], ['quantum', 'Entangled pair']], st.mode, (v) => { st.mode = v; st.result = null; update(); }));
    const R = st.result;
    replace(status,
      h('p', null, st.mode === 'quantum'
        ? 'Each round, Alice and Bob measure their halves of an entangled pair along the angle their question picks. Every answer is a measured shot.'
        : 'The best hidden instructions: both always answer 0. They lose only when both are asked 1.'),
      R ? h('p', { class: `verdict ${R.wins >= 80 ? 'good' : 'bad'}` }, `Won ${R.wins} of 100 rounds${R.wins >= 80 ? '.' : '. Not enough.'}`) : null,
      R ? h('div', { class: 'meter', role: 'img', 'aria-label': `${R.wins} wins out of 100; 80 needed; classical limit 75` },
        h('span', { class: 'meter-fill', style: `width:${R.wins}%` }),
        h('span', { class: 'meter-mark classical', style: 'left:75%' }),
        h('span', { class: 'meter-mark need', style: 'left:80%' })) : null,
      R ? h('p', { class: 'aside' }, 'Dashed marks: 75 (the most any hidden instructions can win on average) and 80 (the lock).') : null,
      openedBanner(ctx, 'bell'),
    );
  }

  replace(box,
    h('p', { class: 'lock-story' }, 'Einstein thought entangled particles carry hidden instructions. Bell found the game that exposes them: Alice and Bob each get a random question, 0 or 1, and must give matching answers, unless both are asked 1. No instruction set wins more than 75%.'),
    modeBox,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn-primary', onclick: play }, 'Play 100 rounds')),
    status,
    h('p', { class: 'readout' }, `This data set measured S = ${num(sum.S)} (classical limit 2), a win rate of ${pct(sum.win)}.`),
    oddsLine(odds('bell', run.summary)),
    circ.el,
  );
  circ.show('bell_11', 'Alice and Bob both asked 1: the entangled pair measured at 90° and −45°');
  update();
}

// ---------------------------------------------------------------------------
// Deutsch: four boxes, four questions
// ---------------------------------------------------------------------------

const BOXES = {
  c0: { kind: 'constant', rule: 'always answers 0' },
  c1: { kind: 'constant', rule: 'always answers 1' },
  b0: { kind: 'balanced', rule: 'answers with its input' },
  b1: { kind: 'balanced', rule: 'answers the opposite of its input' },
};

function lockDeutsch(box, ctx, use) {
  const { run } = use;
  const hasClassical = Object.keys(BOXES).every((b) => run.counts[`deutsch_c_${b}_0`] && run.counts[`deutsch_c_${b}_1`]);
  const fresh = () => ({ order: shuffle(Object.keys(BOXES)), sel: 0, used: 0, verdict: {}, how: {}, checked: false });
  let st = fresh();
  const circ = circuitBox(ctx);
  const boxesEl = h('div', { class: 'boxes', role: 'group', 'aria-label': 'Sealed boxes' });
  const actions = h('div', { class: 'actions' });
  const status = h('div', { class: 'lock-status', 'aria-live': 'polite' });

  function ask(how) {
    const b = st.order[st.sel];
    if (st.verdict[st.sel]) return;
    if (how === 'quantum') {
      const shot = sampleShot(run.counts[`deutsch_q_${b}`]);
      st.verdict[st.sel] = shot[0] === '0' ? 'constant' : 'balanced';
      st.used += 1;
      circ.show(`deutsch_q_${b}`, 'One quantum question');
    } else if (how === 'classical') {
      const f0 = sampleShot(run.counts[`deutsch_c_${b}_0`])[1];
      const f1 = sampleShot(run.counts[`deutsch_c_${b}_1`])[1];
      st.verdict[st.sel] = f0 === f1 ? 'constant' : 'balanced';
      st.used += 2;
      circ.show(`deutsch_c_${b}_1`, 'A classical question with input 1');
    } else {
      st.verdict[st.sel] = Math.random() < 0.5 ? 'constant' : 'balanced';
    }
    st.how[st.sel] = how;
    const next = [0, 1, 2, 3].find((i) => !st.verdict[i]);
    if (next !== undefined) st.sel = next;
    if (Object.keys(st.verdict).length === 4) {
      st.checked = true;
      const allRight = st.order.every((bx, i) => st.verdict[i] === BOXES[bx].kind);
      if (allRight && st.used <= 4) ctx.open('deutsch');
    }
    update();
  }

  function update() {
    replace(boxesEl, st.order.map((b, i) => h('button', {
      type: 'button',
      class: `box-card ${st.checked ? (st.verdict[i] === BOXES[b].kind ? 'is-right' : 'is-wrong') : ''}`,
      'aria-pressed': i === st.sel ? 'true' : 'false',
      onclick: () => { st.sel = i; update(); },
    },
      h('span', { class: 'box-name' }, `Box ${'ABCD'[i]}`),
      h('span', { class: 'box-rule' }, st.checked ? `${BOXES[b].kind}: ${BOXES[b].rule}` : st.verdict[i] ? `you said ${st.verdict[i]} (${st.how[i]})` : 'sealed'),
    )));
    const left = 4 - st.used;
    const done = Boolean(st.verdict[st.sel]);
    replace(actions,
      h('button', { type: 'button', class: 'btn-primary', disabled: done || left < 1 || st.checked, onclick: () => ask('quantum') }, 'Quantum question (costs 1)'),
      hasClassical ? h('button', { type: 'button', class: 'btn-quiet', disabled: done || left < 2 || st.checked, onclick: () => ask('classical') }, 'Two classical questions (costs 2)') : null,
      h('button', { type: 'button', class: 'btn-quiet', disabled: done || st.checked, onclick: () => ask('guess') }, 'Guess (free)'),
      st.checked ? h('button', { type: 'button', class: 'btn-quiet', onclick: () => { st = fresh(); update(); } }, 'Shuffle and try again') : null,
    );
    const right = st.checked ? st.order.filter((b, i) => st.verdict[i] === BOXES[b].kind).length : 0;
    replace(status,
      pips(4, st.used),
      h('p', null, `Questions used: ${st.used} of 4. Box ${'ABCD'[st.sel]} is selected.`),
      st.checked ? h('p', { class: `verdict ${right === 4 && st.used <= 4 ? 'good' : 'bad'}` }, right === 4 ? 'All four sorted.' : `${right} of 4 sorted correctly.`) : null,
      openedBanner(ctx, 'deutsch'),
    );
  }

  replace(box,
    h('p', { class: 'lock-story' }, 'Each box turns one bit into one bit. Constant boxes give the same answer for 0 and 1; balanced boxes give different answers. Classically you must ask a box twice to know. Deutsch’s circuit asks once, about both inputs at the same time.'),
    boxesEl,
    actions,
    status,
    oddsLine(odds('deutsch', run.summary)),
    circ.el,
  );
  circ.show(`deutsch_q_${st.order[0]}`, 'One quantum question');
  update();
}

// ---------------------------------------------------------------------------
// Bennett: teleportation
// ---------------------------------------------------------------------------

function dial(theta) {
  const r = 42;
  const a = (theta * Math.PI) / 180;
  return s('svg', { viewBox: '0 0 110 110', class: 'dial', role: 'img', 'aria-label': `Key state tilted ${theta} degrees from zero` },
    s('circle', { cx: 55, cy: 55, r, class: 'dial-ring' }),
    s('text', { x: 55, y: 9, class: 'dial-label', 'text-anchor': 'middle' }, '|0⟩'),
    s('text', { x: 55, y: 108, class: 'dial-label', 'text-anchor': 'middle' }, '|1⟩'),
    s('line', { x1: 55, y1: 55, x2: 55 + r * Math.sin(a), y2: 55 - r * Math.cos(a), class: 'dial-hand' }),
    s('circle', { cx: 55 + r * Math.sin(a), cy: 55 - r * Math.cos(a), r: 5, class: 'dial-tip' }),
  );
}

function lockTeleport(box, ctx, use) {
  const { run } = use;
  const angles = KEY_ANGLES.filter((a) => run.counts[`teleport_${a}`]);
  const hasRelay = angles.every((a) => run.counts[`relay_${a}`]);
  const st = { mode: 'teleport', theta: angles[Math.floor(Math.random() * angles.length)], streak: 0, last: null };
  const circ = circuitBox(ctx);
  const modeBox = h('div', { class: 'controls' });
  const keyBox = h('div', { class: 'dial-box' });
  const status = h('div', { class: 'lock-status', 'aria-live': 'polite' });

  function send() {
    const id = st.mode === 'teleport' ? `teleport_${st.theta}` : `relay_${st.theta}`;
    const shot = sampleShot(run.counts[id]);
    const ok = st.mode === 'teleport' ? shot[2] === '0' : shot[1] === '0';
    st.streak = ok ? st.streak + 1 : 0;
    st.last = { ok, bits: st.mode === 'teleport' ? shot.slice(0, 2) : shot[0] };
    if (st.streak >= 10) ctx.open('teleport');
    update();
  }

  function update() {
    replace(modeBox, segmented('How to send the key', [['relay', 'Measure and resend', !hasRelay], ['teleport', 'Teleport']], st.mode, (v) => { st.mode = v; st.streak = 0; st.last = null; update(); }));
    replace(keyBox, dial(st.theta), h('p', null, `The key is a qubit tilted ${st.theta}° from |0⟩. The lock on the far side checks it with the inverse rotation: it opens only for the exact state.`));
    const L = st.last;
    replace(status,
      pips(10, st.streak),
      h('p', null, L === null ? 'Streak: 0 of 10.'
        : st.mode === 'teleport'
          ? `Alice’s bits ${L.bits[0]} ${L.bits[1]} were sent; Bob corrected his qubit. ${L.ok ? 'The key fitted.' : 'The key did not fit.'} Streak: ${st.streak} of 10.`
          : `Alice measured ${L.bits} and Bob rebuilt that basis state. ${L.ok ? 'The key fitted.' : 'The key did not fit.'} Streak: ${st.streak} of 10.`),
      openedBanner(ctx, 'teleport'),
    );
    circ.show(st.mode === 'teleport' ? `teleport_${st.theta}` : `relay_${st.theta}`, st.mode === 'teleport' ? `Teleporting the ${st.theta}° key` : `Measuring and resending the ${st.theta}° key`);
  }

  replace(box,
    h('p', { class: 'lock-story' }, 'An unknown quantum state cannot be copied, and measuring it destroys it. Measure-and-resend loses the tilt. Teleportation sends the state itself, using one entangled pair and two ordinary bits.'),
    modeBox,
    keyBox,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn-primary', onclick: send }, 'Send the key'),
      h('button', { type: 'button', class: 'btn-quiet', onclick: () => { st.theta = angles[Math.floor(Math.random() * angles.length)]; st.streak = 0; st.last = null; update(); } }, 'New key'),
    ),
    status,
    oddsLine(odds('teleport', run.summary)),
    circ.el,
  );
  update();
}

// ---------------------------------------------------------------------------
// Grover: one look
// ---------------------------------------------------------------------------

function lockGrover(box, ctx, use) {
  const { run } = use;
  const marks = ['00', '01', '10', '11'].filter((m) => run.counts[`grover_${m}`]);
  const newKey = () => marks[Math.floor(Math.random() * marks.length)];
  const st = { mode: 'grover', key: newKey(), streak: 0, pick: null, revealed: false };
  const circ = circuitBox(ctx);
  const modeBox = h('div', { class: 'controls' });
  const cards = h('div', { class: 'cards', role: 'group', 'aria-label': 'Four face-down cards' });
  const actions = h('div', { class: 'actions' });
  const status = h('div', { class: 'lock-status', 'aria-live': 'polite' });

  function settle(m) {
    st.pick = m;
    st.revealed = true;
    st.streak = m === st.key ? st.streak + 1 : 0;
    if (st.streak >= 3) ctx.open('grover');
    update();
  }

  function update() {
    replace(modeBox, segmented('How to look', [['look', 'Turn one card'], ['grover', 'One Grover search']], st.mode, (v) => {
      Object.assign(st, { mode: v, streak: 0, pick: null, revealed: false, key: newKey() });
      update();
    }));
    replace(cards, ['00', '01', '10', '11'].map((m) => h('button', {
      type: 'button',
      class: `card ${st.revealed ? 'is-turned' : ''} ${st.revealed && m === st.key ? 'is-queen' : ''} ${m === st.pick ? 'is-pointed' : ''}`,
      disabled: st.mode !== 'look' || st.revealed,
      onclick: () => settle(m),
      'aria-label': `Card ${m}${st.revealed ? (m === st.key ? ', the key' : ', blank') : ', face down'}${m === st.pick ? ', chosen' : ''}`,
    }, h('span', { class: 'card-face' }, st.revealed ? (m === st.key ? '⚿' : '·') : '?'), h('span', { class: 'card-name' }, m))));
    replace(actions,
      st.mode === 'grover' && !st.revealed
        ? h('button', { type: 'button', class: 'btn-primary', onclick: () => settle(sampleShot(run.counts[`grover_${st.key}`])) }, 'Run one Grover search')
        : null,
      st.revealed ? h('button', { type: 'button', class: 'btn-quiet', onclick: () => { Object.assign(st, { key: newKey(), pick: null, revealed: false }); update(); } }, 'Hide the key again') : null,
    );
    replace(status,
      pips(3, st.streak),
      h('p', null, !st.revealed
        ? (st.mode === 'look' ? 'The key is under one card. Turn over one.' : 'The key is under one card. Run one search.')
        : st.pick === st.key ? `Found it. Streak: ${st.streak} of 3.` : `Missed: the key was under ${st.key}. The streak resets.`),
      openedBanner(ctx, 'grover'),
    );
    circ.show(`grover_${st.key}`, `One Grover search with the key under card ${st.key}`);
  }

  replace(box,
    h('p', { class: 'lock-story' }, 'One look at an unsorted pile finds the key a quarter of the time. Grover’s search asks the lock about all four cards at once, then uses interference to pile the probability onto the right one.'),
    modeBox,
    cards,
    actions,
    status,
    oddsLine(odds('grover', run.summary)),
    circ.el,
  );
  update();
}

const MOUNTS = { young: lockYoung, bell: lockBell, deutsch: lockDeutsch, teleport: lockTeleport, grover: lockGrover };

/** Draw a door's lock into box. ctx: { runFor, open, isOpen, climb, nextLabel, drawings } */
export function mountLock(key, box, ctx) {
  const use = ctx.runFor(key);
  if (!use) {
    replace(box, h('p', { class: 'missing' }, 'No data set includes this door yet. Run the experiments above.'));
    return;
  }
  const inner = h('div', { class: 'lock-body' });
  replace(box,
    use.borrowed ? h('p', { class: 'aside borrowed' }, `The selected data set has no circuits for this door, so it uses: ${use.label}.`) : null,
    inner,
  );
  MOUNTS[key](inner, ctx, use);
}
