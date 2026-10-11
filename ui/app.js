// App shell: data sets, the one-job runner, the tower and the floors.
import { h, replace } from './dom.js';
import { runLabel, pct } from './data.js';
import { createTower } from './tower.js';
import { DOORS, NEEDS, mountLock, odds } from './locks.js';

const FLOORS = [
  { acts: [1, 2], range: '1621–1900', title: 'Light, and the cracks in the classical world', door: 'young' },
  { acts: [3, 4], range: '1900–1949', title: 'The quantum is born', door: 'bell' },
  { acts: [5], range: '1950–1979', title: 'Entanglement gets real', door: 'deutsch' },
  { acts: [6], years: [1980, 1993], range: '1980–1993', title: 'Information becomes physical', door: 'teleport' },
  { acts: [6], years: [1994, 2100], range: '1994–today', title: 'Algorithms and machines', door: 'grover' },
];
const ROOF = FLOORS.length;
const DOOR_ORDER = FLOORS.map((f) => f.door);

/**
 * bridge = { backendName, isHardware, oneJob, autoScope, defaultShots, autoSave,
 *            run(scope, shots), recorded(), drawings(), timeline(), save(run) }
 */
export async function start(root, bridge) {
  const state = {
    runs: [], current: -1, shots: bridge.defaultShots || 1000, busy: false, status: '', usedJob: false,
    drawings: {}, acts: [], floors: [], unlocked: 1, floor: 0, read: new Set(), opened: new Set(), openRead: null,
  };

  const announcer = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const runSelect = h('select', { id: 'run-select', onchange: (e) => { state.current = Number(e.target.value); renderAll(); } });
  const runner = h('section', { class: 'runner', 'aria-labelledby': 'runner-title' });
  const towerBox = h('div', { class: 'tower-canvas' });
  const floorNav = h('nav', { class: 'floor-nav', 'aria-label': 'Floors of the museum' });
  const progress = h('div', { class: 'progress' });
  const floorView = h('main', { class: 'floor-view', tabindex: '-1' });

  replace(root,
    h('header', { class: 'masthead' },
      h('div', { class: 'brand' },
        h('p', { class: 'brand-name' }, 'Quantum Odyssey'),
        h('h1', null, 'The Locked Museum'),
        h('p', { class: 'lede' }, 'Climb five floors of quantum history, 71 milestones from 1621 to today. Every staircase is locked by a puzzle that a classical strategy almost never solves, and every lock runs on real quantum circuits.'),
      ),
      h('div', { class: 'picker' }, h('label', { for: 'run-select' }, 'Data set'), runSelect),
    ),
    runner,
    h('div', { class: 'museum' },
      h('section', { class: 'tower-col', 'aria-label': 'The building' }, towerBox, progress, floorNav),
      floorView,
    ),
    h('footer', { class: 'colophon' },
      h('p', { class: 'support' }, 'This effort is supported by Qollab & IonQ.'),
      h('p', null, 'Open source under the MIT license. The 71 milestones and the Paper & Ink style come from the author’s earlier project Quantum Odyssey; the game, the locks and the circuits are new.'),
    ),
    announcer,
  );

  let tower = null;

  const run = () => state.runs[state.current];

  const ctx = {
    get drawings() { return state.drawings; },
    runFor(key) {
      const need = NEEDS[key];
      const cur = run();
      if (cur && cur.counts[need]) return { run: cur, borrowed: false };
      const alt = state.runs.find((r) => r.counts[need]);
      return alt ? { run: alt, borrowed: true, label: runLabel(alt) } : null;
    },
    isOpen: (key) => state.opened.has(DOOR_ORDER.indexOf(key)),
    open(key) {
      const i = DOOR_ORDER.indexOf(key);
      if (state.opened.has(i)) return;
      state.opened.add(i);
      state.unlocked = Math.max(state.unlocked, i + 2);
      announce(`${DOORS[key].name} is open. ${i + 1 === ROOF ? 'The observatory on the roof' : `Floor ${i + 2}`} is unlocked.`);
      renderTowerAndNav();
    },
    climb(key) { goTo(DOOR_ORDER.indexOf(key) + 1); },
    nextLabel(key) {
      const i = DOOR_ORDER.indexOf(key);
      return i + 1 === ROOF ? 'Climb to the observatory' : `Climb to floor ${i + 2}`;
    },
  };

  function announce(text) {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = text; }, 30);
  }

  function goTo(i) {
    if (i >= state.unlocked) return;
    state.floor = i;
    renderAll();
    floorView.focus({ preventScroll: true });
    floorView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- runner -------------------------------------------------------------
  function renderRunner() {
    const kids = [
      h('h2', { id: 'runner-title' }, 'Run the experiments'),
      h('p', null, bridge.oneJob
        ? `IonQ takes one job of one circuit per run, so the circuits behind four doors (Young, Bell, Bennett and Grover) run side by side in a single 29-qubit circuit on ${bridge.backendName}, in IonQ’s native gates. Deutsch’s door uses a recorded data set.`
        : `All 46 circuits behind the five doors go into one job on ${bridge.backendName}.`),
    ];
    if (bridge.isHardware) kids.push(h('p', { class: 'warning' }, 'This is real IonQ hardware, and a run spends credits. The museum plays just as well on a simulator.'));
    kids.push(h('div', { class: 'run-controls' },
      h('label', null, 'Shots per circuit ',
        h('select', { disabled: state.busy, onchange: (e) => { state.shots = Number(e.target.value); } },
          [100, 200, 500, 1000].map((n) => h('option', { value: n, selected: n === state.shots }, String(n))))),
      h('button', { type: 'button', class: 'btn-primary', disabled: state.busy || state.usedJob, onclick: runNow },
        state.busy ? 'Running…' : (bridge.oneJob ? 'Run the 29-qubit circuit' : 'Run all 46 circuits as one job')),
    ));
    if (state.usedJob && !state.busy) kids.push(h('p', { class: 'aside' }, 'IonQ takes one job per run. To send another, press Stop and then Run in Qollab.'));
    if (state.status) kids.push(h('p', { class: 'status', role: 'status' }, state.status));
    const live = run();
    if (live && live.source === 'live') kids.push(h('button', { type: 'button', class: 'btn-quiet', onclick: saveNow }, 'Save this run as a file'));
    replace(runner, kids);
  }

  // ---- tower and navigation -----------------------------------------------
  function renderTowerAndNav() {
    if (tower) tower.update({ unlocked: state.unlocked, current: state.floor, read: state.read, opened: state.opened });
    const total = state.floors.reduce((n, f) => n + f.events.length, 0);
    replace(progress,
      h('p', null, h('strong', null, `${state.opened.size} of 5`), ' doors opened'),
      h('p', null, h('strong', null, `${state.read.size} of ${total}`), ' milestones read'),
      state.unlocked <= ROOF
        ? h('button', { type: 'button', class: 'btn-link', onclick: () => { state.unlocked = ROOF + 1; renderAll(); announce('Every floor is unlocked.'); } }, 'Visitor’s pass: unlock every floor')
        : null,
    );
    const items = [{ i: ROOF, name: 'Roof', label: 'The observatory' }, ...state.floors.map((f, i) => ({ i, name: `Floor ${i + 1}`, label: f.range })).reverse()];
    replace(floorNav, h('ol', null, items.map((it) => {
      const locked = it.i >= state.unlocked;
      return h('li', null, h('button', {
        type: 'button',
        disabled: locked,
        'aria-current': it.i === state.floor ? 'page' : null,
        onclick: () => goTo(it.i),
      },
        h('span', { class: 'nav-name' }, it.name),
        h('span', { class: 'nav-label' }, it.label),
        h('span', { class: 'nav-state' }, locked ? 'locked' : it.i < ROOF && state.opened.has(it.i) ? 'door open' : ''),
      ));
    })));
  }

  // ---- floors ---------------------------------------------------------------
  function plaque(ev) {
    const isOpen = state.openRead === ev.id;
    const read = state.read.has(ev.id);
    return h('li', { class: `ms-card ${read ? 'is-read' : ''}` },
      h('button', {
        type: 'button', class: 'ms-head', 'aria-expanded': isOpen ? 'true' : 'false',
        onclick: () => {
          state.openRead = isOpen ? null : ev.id;
          if (!isOpen) state.read.add(ev.id);
          renderPlaques();
          renderTowerAndNav();
        },
      }, h('span', { class: 'ms-year' }, String(ev.year)), h('span', { class: 'ms-title' }, ev.title), h('span', { class: 'ms-mark', 'aria-hidden': 'true' }, read ? '✓' : '+')),
      isOpen ? h('div', { class: 'ms-body' },
        h('p', { class: 'ms-people' }, ev.people.join(', ')),
        h('p', null, h('strong', null, 'Discovery. '), ev.discovery),
        h('p', null, h('strong', null, 'Evidence. '), ev.evidence),
        h('p', null, h('strong', null, 'Why it matters. '), ev.significance),
      ) : null,
    );
  }

  const plaqueList = h('ul', { class: 'ms-list' });

  function renderPlaques() {
    if (state.floor === ROOF) return;
    replace(plaqueList, state.floors[state.floor].events.map(plaque));
  }

  function renderRoof() {
    const rows = DOOR_ORDER.map((key) => {
      const use = ctx.runFor(key);
      const o = use ? odds(key, use.run.summary) : null;
      return h('tr', null,
        h('th', { scope: 'row' }, `${DOORS[key].name}, ${DOORS[key].year}`),
        h('td', null, DOORS[key].rule),
        h('td', { class: 'num classical' }, o ? pct(o.classical, 1) : '—'),
        h('td', { class: 'num quantum' }, o ? pct(o.quantum, 1) : '—'));
    });
    replace(floorView,
      h('section', { class: 'floor', 'aria-labelledby': 'roof-title' },
        h('p', { class: 'floor-range' }, 'Roof'),
        h('h2', { id: 'roof-title' }, 'The observatory'),
        h('p', { class: 'floor-theme' }, 'From up here the whole climb is visible. Each door asked for something a classical world almost never delivers. The table compares the chance of opening it on the first try with the best classical strategy against the chance measured on this data set’s quantum circuits.'),
        h('table', { class: 'numbers odds-table' },
          h('caption', null, run() ? `Odds of opening each door on the first try, from ${run().backend}` : 'Odds of opening each door on the first try'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Door'), h('th', { scope: 'col' }, 'Lock'), h('th', { scope: 'col' }, 'Classical'), h('th', { scope: 'col' }, 'Quantum, measured'))),
          h('tbody', null, rows)),
        h('p', { class: 'aside' }, 'Classical odds: a particle through a random slit (0.5⁵), hidden instructions winning 80 of 100 CHSH rounds, two boxes asked twice and two guessed, measure-and-resend ten times in a row, one card turned three times in a row. Quantum odds come from the measured shots of each door’s circuits.'),
      ),
    );
  }

  function renderFloor() {
    if (state.floor === ROOF) { renderRoof(); return; }
    const f = state.floors[state.floor];
    const door = DOORS[f.door];
    const themes = f.acts.map((a) => state.acts.find((x) => x.id === a)).filter(Boolean);
    const lockBox = h('div', { class: 'lock' });
    replace(plaqueList, f.events.map(plaque));
    replace(floorView,
      h('section', { class: 'floor', 'aria-labelledby': 'floor-title' },
        h('p', { class: 'floor-range' }, `Floor ${state.floor + 1}, ${f.range}`),
        h('h2', { id: 'floor-title' }, f.title),
        themes.map((a) => h('p', { class: 'floor-theme' }, a.theme)),
        h('section', { class: 'lock-card', 'aria-labelledby': 'lock-title' },
          h('p', { class: 'lock-year' }, door.year),
          h('h3', { id: 'lock-title' }, `${door.name}: the stairs to ${state.floor + 1 === ROOF ? 'the roof' : `floor ${state.floor + 2}`}`),
          h('p', { class: 'lock-rule' }, door.rule),
          lockBox,
        ),
        h('section', { class: 'milestones', 'aria-labelledby': 'ms-title' },
          h('h3', { id: 'ms-title' }, `Milestones on this floor (${f.events.length})`),
          h('p', { class: 'aside' }, 'Open a plaque to read it. Read plaques turn blue on the tower.'),
          plaqueList,
        ),
      ),
    );
    try { mountLock(f.door, lockBox, ctx); } catch (err) {
      console.error(err);
      replace(lockBox, h('p', { class: 'warning' }, `This lock could not be drawn: ${err.message}`));
    }
  }

  function renderAll() {
    replace(runSelect, state.runs.map((r, i) => h('option', { value: i, selected: i === state.current }, runLabel(r))));
    runSelect.disabled = state.runs.length === 0;
    renderRunner();
    renderTowerAndNav();
    renderFloor();
  }

  // ---- running --------------------------------------------------------------
  async function runNow() {
    state.busy = true;
    state.status = bridge.oneJob
      ? `Running on ${bridge.backendName}… IonQ’s noise model simulates every shot separately, so 200 shots take a few minutes.`
      : `Running on ${bridge.backendName}…`;
    renderRunner();
    const t0 = performance.now();
    try {
      const r = await bridge.run(bridge.oneJob ? 'ionq' : 'all', state.shots);
      state.runs.unshift(r);
      state.current = 0;
      state.status = `Done: ${r.n_circuits} circuits on ${r.backend} in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      if (bridge.oneJob) state.usedJob = true;
      if (bridge.autoSave) {
        try {
          if ((await bridge.save(r)) === 'sent') state.status += ' The run is saved as locked_museum_run.json in the console below.';
        } catch (e) { console.error(e); }
      }
      announce(state.status);
    } catch (err) {
      console.error(err);
      const msg = String(err.message || err).trim().split('\n').filter(Boolean).pop() || 'unknown error';
      state.status = `The job could not be sent (${msg.slice(0, 160)}). Press Stop, then Run again in Qollab.`;
    }
    state.busy = false;
    renderAll();
  }

  async function saveNow() {
    const how = await bridge.save(run());
    state.status = how === 'sent' ? 'Saved: download locked_museum_run.json from the console below.' : 'The run is printed in the console below as JSON.';
    renderRunner();
  }

  // ---- start ----------------------------------------------------------------
  try {
    const tl = await bridge.timeline();
    state.acts = tl.acts || [];
    const events = (tl.events || []).slice().sort((a, b) => a.year - b.year);
    state.floors = FLOORS.map((f) => ({
      ...f,
      events: events.filter((e) => f.acts.includes(e.act) && (!f.years || (e.year >= f.years[0] && e.year <= f.years[1]))),
    }));
  } catch (e) {
    console.error(e);
    state.floors = FLOORS.map((f) => ({ ...f, events: [] }));
  }
  try { state.drawings = await bridge.drawings(); } catch (e) { console.error(e); }
  try { state.runs = await bridge.recorded(); } catch (e) { console.error(e); state.runs = []; }
  state.current = state.runs.length ? 0 : -1;
  try {
    tower = createTower(towerBox, state.floors, { onPick: (i) => goTo(i) });
  } catch (e) {
    console.error(e);
    tower = null;
  }
  if (!tower) towerBox.remove();
  renderAll();
  if (bridge.autoScope) await runNow();
}
