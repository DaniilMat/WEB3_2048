(function () {
  'use strict';

  const SIZE = 4;
  const STATE_KEY = 'game2048_state';
  const LEADERS_KEY = 'game2048_leaders';
  const MAX_HISTORY = 50;
  const GAP = 3;                       // % отступ между плитками
  const STEP = (100 - GAP * (SIZE + 1)) / SIZE + GAP;

  const $ = (id) => document.getElementById(id);
  const gridEl = $('grid');
  const tilesEl = $('tiles');
  const scoreEl = $('score');
  const undoBtn = $('undo-btn');
  const overlay = $('gameover');
  const overMsg = $('gameover-msg');
  const nameInput = $('name-input');
  const saveBtn = $('save-btn');
  const modal = $('leaders-modal');

  let tiles = [];      // { id, v, r, c, merged, isNew }
  let score = 0;
  let over = false;
  let saved = false;   // рекорд текущей игры уже сохранён
  let history = [];    // [{ tiles: [{id,v,r,c}], score }]
  let nextId = 1;
  const els = new Map();

  /* ---------- Построение сетки ---------- */
  function buildGrid() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.left = pos(c) + '%';
        cell.style.top = pos(r) + '%';
        gridEl.appendChild(cell);
      }
    }
  }
  const pos = (i) => GAP + i * STEP;

  /* ---------- Состояние ---------- */
  function emptyCells() {
    const taken = new Set(tiles.map((t) => t.r * SIZE + t.c));
    const res = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!taken.has(i)) res.push([Math.floor(i / SIZE), i % SIZE]);
    }
    return res;
  }

  function spawn(count) {
    for (let k = 0; k < count; k++) {
      const free = emptyCells();
      if (!free.length) return;
      const [r, c] = free[Math.floor(Math.random() * free.length)];
      tiles.push({ id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, merged: false, isNew: true });
    }
  }

  function newGame() {
    tiles = [];
    score = 0;
    over = false;
    saved = false;
    history = [];
    clearDom();
    spawn(1 + Math.floor(Math.random() * 3)); // 1–3 стартовые плитки
    render();
    updateUi();
    save();
  }

  function snapshot() {
    return {
      tiles: tiles.map((t) => ({ id: t.id, v: t.v, r: t.r, c: t.c })),
      score: score,
    };
  }

  /* ---------- Ход ---------- */
  function lineCoords(dir, i) {
    const idx = [0, 1, 2, 3];
    switch (dir) {
      case 'left':  return idx.map((k) => [i, k]);
      case 'right': return idx.map((k) => [i, SIZE - 1 - k]);
      case 'up':    return idx.map((k) => [k, i]);
      default:      return idx.map((k) => [SIZE - 1 - k, i]);
    }
  }

  function move(dir) {
    if (over) return;
    const before = snapshot();
    const dying = [];
    let gained = 0;
    let changed = false;

    for (let i = 0; i < SIZE; i++) {
      const coords = lineCoords(dir, i);
      const line = coords
        .map(([r, c]) => tiles.find((t) => t.r === r && t.c === c))
        .filter(Boolean);
      let target = 0;
      for (let j = 0; j < line.length; j++) {
        const a = line[j];
        const [tr, tc] = coords[target];
        if (j + 1 < line.length && line[j + 1].v === a.v) {
          const b = line[j + 1];
          a.v *= 2;
          a.merged = true;
          gained += a.v;
          if (a.r !== tr || a.c !== tc) changed = true;
          a.r = tr; a.c = tc;
          b.r = tr; b.c = tc;
          dying.push(b);
          changed = true;
          j++;
        } else {
          if (a.r !== tr || a.c !== tc) changed = true;
          a.r = tr; a.c = tc;
        }
        target++;
      }
    }

    if (!changed) {
      // откатываем флаги (позиции не менялись)
      tiles.forEach((t) => (t.merged = false));
      return;
    }

    history.push(before);
    if (history.length > MAX_HISTORY) history.shift();

    // поглощённые плитки доезжают до места слияния и исчезают
    dying.forEach((b) => {
      tiles.splice(tiles.indexOf(b), 1);
      const el = els.get(b.id);
      if (el) {
        el.style.left = pos(b.c) + '%';
        el.style.top = pos(b.r) + '%';
        els.delete(b.id);
        setTimeout(() => el.remove(), 130);
      }
    });

    score += gained;
    spawn(Math.random() < 0.5 ? 1 : 2);
    render();
    tiles.forEach((t) => { t.merged = false; t.isNew = false; });

    if (!canMove()) {
      over = true;
      saved = false;
      setTimeout(updateUi, 350);
    }
    updateUi();
    save();
  }

  function canMove() {
    if (tiles.length < SIZE * SIZE) return true;
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    tiles.forEach((t) => (g[t.r][t.c] = t.v));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && g[r][c] === g[r][c + 1]) return true;
        if (r + 1 < SIZE && g[r][c] === g[r + 1][c]) return true;
      }
    }
    return false;
  }

  function undo() {
    if (over || !history.length) return;
    const prev = history.pop();
    tiles = prev.tiles.map((t) => ({ ...t, merged: false, isNew: false }));
    score = prev.score;
    clearDom();
    render();
    updateUi();
    save();
  }

  /* ---------- Отрисовка ---------- */
  function clearDom() {
    tilesEl.innerHTML = '';
    els.clear();
  }

  function render() {
    tiles.forEach((t) => {
      let el = els.get(t.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tile' + (t.isNew ? ' new' : '');
        el.style.left = pos(t.c) + '%';
        el.style.top = pos(t.r) + '%';
        tilesEl.appendChild(el);
        els.set(t.id, el);
      }
      el.dataset.v = t.v;
      el.dataset.len = String(t.v).length;
      el.textContent = t.v;
      el.style.left = pos(t.c) + '%';
      el.style.top = pos(t.r) + '%';
      if (t.merged) {
        el.classList.remove('merge');
        void el.offsetWidth;
        el.classList.add('merge');
      }
    });
  }

  function updateUi() {
    scoreEl.textContent = score;
    undoBtn.disabled = over || history.length === 0;
    overlay.classList.toggle('hidden', !over);
    if (over) {
      if (saved) {
        overMsg.textContent = 'Ваш рекорд сохранен';
        nameInput.classList.add('hidden');
        saveBtn.classList.add('hidden');
      } else {
        overMsg.textContent = 'Игра окончена! Ваш счёт: ' + score;
        nameInput.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
      }
    }
    syncControls();
  }

  function syncControls() {
    const hidden = over || !modal.classList.contains('hidden');
    document.body.classList.toggle('no-controls', hidden);
  }

  /* ---------- localStorage ---------- */
  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        tiles: tiles.map((t) => ({ id: t.id, v: t.v, r: t.r, c: t.c })),
        score, over, saved, history, nextId,
      }));
    } catch (e) { /* хранилище недоступно */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      if (!s || !Array.isArray(s.tiles) || !s.tiles.length) return false;
      tiles = s.tiles.map((t) => ({ ...t, merged: false, isNew: false }));
      score = s.score || 0;
      over = !!s.over;
      saved = !!s.saved;
      history = Array.isArray(s.history) ? s.history : [];
      nextId = s.nextId || tiles.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      return true;
    } catch (e) {
      return false;
    }
  }

  function getLeaders() {
    try {
      const list = JSON.parse(localStorage.getItem(LEADERS_KEY));
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecord() {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const list = getLeaders();
    list.push({ name, score, date: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem(LEADERS_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (e) { /* ignore */ }
    saved = true;
    nameInput.value = '';
    updateUi();
    save();
  }

  /* ---------- Лидерборд ---------- */
  function openLeaders() {
    const body = $('leaders-body');
    body.innerHTML = '';
    const list = getLeaders().slice(0, 10);
    $('leaders-empty').classList.toggle('hidden', list.length > 0);
    list.forEach((item, i) => {
      const tr = document.createElement('tr');
      const date = new Date(item.date).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      [i + 1, item.name, item.score, date].forEach((val) => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    modal.classList.remove('hidden');
    syncControls();
  }

  function closeLeaders() {
    modal.classList.add('hidden');
    syncControls();
  }

  /* ---------- Управление ---------- */
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  document.addEventListener('keydown', (e) => {
    const dir = KEYS[e.key];
    if (!dir) return;
    if (document.activeElement === nameInput) return;
    e.preventDefault();
    if (!modal.classList.contains('hidden')) return;
    move(dir);
  });

  document.querySelectorAll('#controls button').forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset.dir));
  });

  let startX = 0, startY = 0;
  const boardEl = $('board');
  boardEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  boardEl.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  undoBtn.addEventListener('click', undo);
  $('restart-btn').addEventListener('click', newGame);
  $('gameover-restart').addEventListener('click', newGame);
  $('leaders-btn').addEventListener('click', openLeaders);
  $('leaders-close').addEventListener('click', closeLeaders);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeLeaders(); });
  saveBtn.addEventListener('click', saveRecord);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRecord(); });

  /* ---------- Старт ---------- */
  buildGrid();
  if (load()) {
    render();
    updateUi();
  } else {
    newGame();
  }
})();
