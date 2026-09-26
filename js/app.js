'use strict';

(() => {
  const { esc } = Fmt;
  const SESSION_KEY = 'rv.session';
  const BASE_TITLE = document.title;
  const TABS = [['ingredients', 'מרכיבים'], ['steps', 'שלבים'], ['text', 'טקסט מלא']];

  const svg = (inner, fill = false) =>
    `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON = {
    back: svg('<path d="M9 6l6 6-6 6"/>'),
    chevR: svg('<path d="M9 6l6 6-6 6"/>'),
    chevL: svg('<path d="M15 6l-6 6 6 6"/>'),
    play: svg('<path d="M8 5v14l11-7z"/>', true),
    pause: svg('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>', true),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    phone: svg('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    flame: svg('<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>'),
    thermo: svg('<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z"/>'),
    users: svg('<path d="M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1a4 4 0 0 0-3-3.87M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/>'),
    alert: svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    speaker: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15l3 3 3-3"/>'),
  };

  /* ---------- Theme ---------- */

  // An explicit choice is stored in data-theme (set before first paint in index.html);
  // without one, CSS follows the system setting.
  const THEME_KEY = 'rv.theme';
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

  function themeButton() {
    const dark = currentTheme() === 'dark';
    const label = dark ? 'מעבר לרקע בהיר' : 'מעבר לרקע כהה';
    return `<button class="icon-btn" data-act="theme" aria-label="${label}" title="${label}">${dark ? ICON.sun : ICON.moon}</button>`;
  }

  function syncTheme() {
    document.querySelectorAll('[data-act="theme"]').forEach(b => { b.outerHTML = themeButton(); });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    syncTheme();
  }

  darkQuery.addEventListener('change', syncTheme);

  const app = document.getElementById('app');
  let S = null; // { recipe, source, tab, step, checked }

  const saveSession = () => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(S)); } catch {} };
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
  const recipeKey = r => r.id || r.title;
  const onRecipe = () => document.body.dataset.view === 'recipe';

  /* ---------- Loading ---------- */

  async function openUrl(path, opts) {
    let data;
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      return renderHome({ title: 'שגיאה בטעינת המתכון', items: [`${path}: ${e.message}`] });
    }
    openRecipe(data, { type: 'url', path }, opts);
  }

  const driveItems = new Map(); // id → item from the last Drive listing

  async function openDrive(id, opts) {
    const item = driveItems.get(id);
    if (item?.error) return renderHome({ title: 'שגיאה בקובץ מהדרייב', items: [`${item.name}: ${item.error}`] });
    let data = item?.recipe;
    if (!data) {
      try { data = await Drive.get(id); }
      catch (e) { return renderHome({ title: 'שגיאה בטעינת המתכון מהדרייב', items: [e.message] }); }
    }
    openRecipe(data, { type: 'drive', id }, opts);
  }

  function parseAndOpen(text, source) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { return renderHome({ title: 'ה-JSON לא תקין', items: [e.message] }); }
    openRecipe(data, source);
  }

  function openRecipe(recipe, source, { replace = false } = {}) {
    const errors = validateRecipe(recipe);
    if (errors.length) return renderHome({ title: 'המתכון לא תואם למבנה', items: errors });
    recipe = { ...recipe, steps: recipe.steps || [] };

    const prev = loadSession();
    const same = prev?.recipe && recipeKey(prev.recipe) === recipeKey(recipe);
    if (!same && Timers.hasAny() && !confirm('יש טיימרים ממתכון אחר. לבטל אותם ולפתוח את המתכון החדש?')) {
      if (replace) renderHome();
      return;
    }
    if (!same) Timers.clear();

    // Reopening the same recipe keeps progress (step, checked ingredients).
    S = same ? { ...prev, recipe, source } : { recipe, source, tab: 'ingredients', step: 0, checked: {} };
    S.step = Math.max(0, Math.min(S.step, recipe.steps.length - 1));
    if (!recipe.steps.length && S.tab === 'steps') S.tab = 'ingredients';
    saveSession();

    history[replace ? 'replaceState' : 'pushState']({ view: 'recipe', fromHome: !replace }, '', recipeUrl());
    renderRecipe();
    requestWake();
  }

  function recipeUrl() {
    if (S.source?.type === 'url') return `?recipe=${encodeURIComponent(S.source.path)}`;
    if (S.source?.type === 'drive') return `?drive=${encodeURIComponent(S.source.id)}`;
    return location.pathname;
  }

  function resume() {
    S = loadSession();
    if (!S?.recipe) return renderHome();
    history.pushState({ view: 'recipe', fromHome: true }, '', recipeUrl());
    renderRecipe();
    requestWake();
  }

  function goHome() {
    if (history.state?.fromHome) return history.back();
    history.pushState({ view: 'home' }, '', location.pathname);
    renderHome();
  }

  /* ---------- Home ---------- */

  function renderHome(error) {
    document.body.dataset.view = 'home';
    releaseWake();
    stopVoice();
    updateTitle();
    const session = loadSession();
    const n = Timers.list().length;
    app.innerHTML = `
      <header class="header">
        <div class="topbar">
          <span class="brand" aria-hidden="true">${ICON.flame}</span>
          <h1>מתכונים</h1>
          ${themeButton()}
        </div>
      </header>
      <main class="home">
        <div class="home-hero">
          <h2>מה מבשלים היום?</h2>
          <p class="muted">בוחרים מתכון ומבשלים שלב אחרי שלב</p>
        </div>
        ${error ? `<section class="card errors" role="alert"><h2>${ICON.alert}${esc(error.title)}</h2><ul>${error.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>` : ''}
        ${session?.recipe ? `
          <button class="resume" data-act="resume">
            <span class="resume-text">
              <span class="resume-label">להמשיך לבשל${n ? ` · ${n} טיימרים` : ''}</span>
              <strong>${esc(session.recipe.title)}</strong>
              ${session.recipe.steps?.length ? `<span class="resume-step">שלב ${session.step + 1} מתוך ${session.recipe.steps.length}</span>` : ''}
            </span>
            <span class="resume-go">${ICON.chevL}</span>
          </button>` : ''}
        <h3 class="section-label">המתכונים שלי${Drive.enabled ? ' · מגוגל דרייב' : ''}</h3>
        <ul class="recipe-list" id="recipe-list"><li class="muted">טוען…</li></ul>
        <h3 class="section-label">מתכון חדש</h3>
        <section class="card">
          <label class="btn primary block">${ICON.file}בחירת קובץ JSON<input type="file" id="file-input" accept=".json,application/json" hidden></label>
          <details class="paste">
            <summary>או הדבקת JSON</summary>
            <textarea id="paste-input" dir="ltr" rows="8" spellcheck="false" placeholder='{ "title": "...", "ingredients": [], "steps": [] }'></textarea>
            <button class="btn block" data-act="paste">טעינה</button>
          </details>
        </section>
      </main>`;
    syncTheme();
    loadRecipeList();
  }

  const recipeItem = ({ href, act, attr, title, description, error }) => `
    <li><a class="recipe-link${error ? ' broken' : ''}" href="${href}" data-act="${act}" ${attr}>
      <span class="recipe-avatar" aria-hidden="true">${error ? ICON.alert : esc([...title][0] || '?')}</span>
      <span class="recipe-text"><strong>${esc(title)}</strong>${error ? '<span class="muted">הקובץ לא תקין. לחצו לפרטים</span>' : description ? `<span class="muted">${esc(description)}</span>` : ''}</span>
      <span class="recipe-chev">${ICON.chevL}</span>
    </a></li>`;

  function renderRecipeList(items, note = '') {
    const ul = document.getElementById('recipe-list');
    if (!ul?.isConnected) return;
    ul.innerHTML = (items.length ? items.join('') : '<li class="muted">אין מתכונים ברשימה</li>') + (note ? `<li class="list-note">${note}</li>` : '');
  }

  function driveListHtml(items) {
    driveItems.clear();
    items.forEach(it => driveItems.set(it.id, it));
    return items
      .map(it => ({ ...it, title: it.recipe?.title || it.name.replace(/\.json$/i, '') }))
      .sort((a, b) => a.title.localeCompare(b.title, 'he'))
      .map(it => recipeItem({
        href: `?drive=${encodeURIComponent(it.id)}`, act: 'open-drive', attr: `data-id="${esc(it.id)}"`,
        title: it.title, description: it.recipe?.description, error: it.error,
      }));
  }

  async function loadRecipeList() {
    if (Drive.enabled) {
      // Show the cached list at once, then refresh from Drive.
      const cached = Drive.cached();
      if (cached.length) renderRecipeList(driveListHtml(cached));
      try {
        let last = 0;
        const { items, error } = await Drive.list((partial, total) => {
          if (partial.length === total || Date.now() - last < 300) return;
          last = Date.now();
          renderRecipeList(driveListHtml(partial.length > cached.length ? partial : cached), `<span>טוען מתכונים מהדרייב… ${partial.length}/${total}</span>`);
        });
        renderRecipeList(driveListHtml(items.filter(it => !(error && it.error === error))),
          error ? `${ICON.alert}<span>${esc(error)}</span>` : '');
      } catch (e) {
        renderRecipeList(cached.length ? driveListHtml(cached) : [], `${ICON.alert}<span>${esc(e.message)}${cached.length ? ' מוצגת הרשימה השמורה.' : ''}</span>`);
      }
      return;
    }
    // recipes/ holds personal recipes and isn't published; examples/ ships with the site.
    const fetchList = async path => {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error();
      return res.json();
    };
    try {
      const list = await fetchList('recipes/index.json').catch(() => fetchList('examples/index.json'));
      renderRecipeList(list.map(it => recipeItem({
        href: `?recipe=${encodeURIComponent(it.file)}`, act: 'open-url', attr: `data-path="${esc(it.file)}"`,
        title: it.title, description: it.description,
      })));
    } catch {
      renderRecipeList([], 'לא ניתן לטעון את רשימת המתכונים. צריך להריץ את האתר דרך שרת.');
    }
  }


  /* ---------- Recipe shell ---------- */

  function renderRecipe() {
    document.body.dataset.view = 'recipe';
    app.innerHTML = `
      <header class="header">
        <div class="topbar">
          <button class="icon-btn" data-act="home" aria-label="חזרה לרשימה">${ICON.back}</button>
          <h1>${esc(S.recipe.title)}</h1>
          ${Voice.canListen ? `<button class="icon-btn" id="voice-btn" data-act="voice" aria-pressed="${voiceOn}" aria-label="פקודות קוליות" title="פקודות קוליות">${ICON.mic}</button>` : ''}
          <button class="icon-btn" id="wake-btn" data-act="wake" hidden>${ICON.phone}</button>
          ${themeButton()}
        </div>
        <nav class="tabs" role="tablist">
          ${TABS.filter(([id]) => id !== 'steps' || S.recipe.steps.length).map(([id, label]) => `<button role="tab" data-act="tab" data-tab="${id}" aria-selected="${S.tab === id}">${label}</button>`).join('')}
        </nav>
      </header>
      <main id="view" class="view"></main>
      <footer class="bottom" id="bottom"><div id="voicebar"></div><div id="tray"></div><div id="stepnav"></div></footer>
      <dialog class="sheet" id="voice-help">
        <h2>פקודות קוליות</h2>
        <ul>
          <li><b>"הבא"</b>, <b>"הקודם"</b>: מעבר בין שלבים</li>
          <li><b>"שלב 3"</b>: קפיצה לשלב</li>
          <li><b>"שוב"</b>, <b>"תקריא"</b>: הקראה חוזרת של השלב</li>
          <li><b>"מרכיבים"</b>: מה צריך לשלב הזה</li>
          <li><b>"טיימר"</b>: הפעלת הטיימר של השלב</li>
          <li><b>"כמה זמן נשאר"</b>: מצב הטיימרים</li>
          <li><b>"טיפ"</b>: הקראת הטיפים</li>
          <li><b>"עצור"</b>, <b>"שקט"</b>: עצירת הקראה וצלצול</li>
        </ul>
        <form method="dialog"><button class="btn primary block">הבנתי</button></form>
      </dialog>`;
    renderView();
    renderTray();
    renderVoiceBar();
    updateWakeBtn();
    syncTheme();
    observeBottom();
  }

  function renderView() {
    const view = document.getElementById('view');
    view.innerHTML = S.tab === 'steps' ? viewSteps() : S.tab === 'text' ? viewText() : viewIngredients();
    if (S.tab === 'steps') centerPill();
    renderStepNav();
  }

  function setTab(tab) {
    S.tab = tab;
    saveSession();
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    renderView();
    window.scrollTo(0, 0);
  }

  function goStep(k) {
    const n = S.recipe.steps.length;
    S.step = Math.max(0, Math.min(n - 1, k));
    if (S.tab !== 'steps') setTab('steps');
    else {
      saveSession();
      renderView();
      window.scrollTo(0, 0);
    }
    if (voiceOn) speakStep();
  }

  // Keep the fixed bottom bar from covering the end of the page.
  let bottomObserver;
  function observeBottom() {
    bottomObserver?.disconnect();
    const el = document.getElementById('bottom');
    bottomObserver = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--bottom-h', `${el.offsetHeight}px`));
    bottomObserver.observe(el);
  }

  /* ---------- Ingredients tab ---------- */

  const ingById = id => S.recipe.ingredients.find(i => i.id === id);

  // A step's own amount replaces the ingredient's whole range, so an ingredient's maxAmount never leaks into it.
  function amountText(ing, override = {}) {
    const { amount, maxAmount } = override.amount != null ? override : ing;
    const unit = override.unit ?? ing.unit;
    const num = amount == null ? '' : maxAmount != null && maxAmount !== amount
      ? `${Fmt.amount(amount)}-${Fmt.amount(maxAmount)}` : Fmt.amount(amount);
    return [num, unit || ''].join(' ').trim();
  }

  const altText = ing => ing.alternatives?.length ? `או: ${ing.alternatives.join(' / ')}` : '';
  const yieldText = r => r.yield ? `${Fmt.amount(r.yield.amount)} ${r.yield.unit}` : '';

  function totalTime(r) {
    let a = 0, b = 0, any = false;
    for (const s of r.steps) {
      if (!s.time) continue;
      any = true;
      a += s.time.minutes;
      b += s.time.maxMinutes ?? s.time.minutes;
    }
    return any ? Fmt.range(a, b) : '';
  }

  function groupIngredients(list) {
    const groups = [];
    for (const ing of list) {
      const name = ing.group || '';
      let g = groups.find(x => x.name === name);
      if (!g) groups.push(g = { name, items: [] });
      g.items.push(ing);
    }
    return groups;
  }

  function viewIngredients() {
    const r = S.recipe;
    const chips = [];
    if (r.servings) chips.push(`<span class="chip">${ICON.users}${Fmt.amount(r.servings)} מנות</span>`);
    if (r.yield) chips.push(`<span class="chip">${esc(yieldText(r))}</span>`);
    const total = r.totalTime ? Fmt.range(r.totalTime.minutes, r.totalTime.maxMinutes) : totalTime(r);
    if (total) chips.push(`<span class="chip">${ICON.clock}${r.activeTime ? 'סה״כ ' : ''}${esc(total)}</span>`);
    if (r.activeTime) chips.push(`<span class="chip">${ICON.clock}עבודה ${esc(Fmt.range(r.activeTime.minutes, r.activeTime.maxMinutes))}</span>`);
    if (r.difficulty) chips.push(`<span class="chip">רמת קושי: ${esc(r.difficulty)}</span>`);
    if (r.kashrut) chips.push(`<span class="chip">${esc(r.kashrut)}</span>`);
    (r.tags || []).forEach(t => chips.push(`<span class="chip tag">${esc(t)}</span>`));
    const done = r.ingredients.filter(i => S.checked[i.id]).length;
    const all = r.ingredients.length;

    return `
      ${r.image ? `<img class="hero" src="${esc(r.image)}" alt="" onerror="this.remove()">` : ''}
      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
      ${r.author ? `<p class="muted byline">המתכון של ${esc(r.author)}</p>` : ''}
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
      <div class="section-head">
        <h2>מרכיבים</h2>
        ${done ? '<button class="link-btn" data-act="uncheck">ניקוי</button>' : ''}
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${all}" aria-valuenow="${done}">
        <div class="progress-track"><i style="width:${100 * done / all}%"></i></div>
        <span>${done === all ? 'הכל מוכן!' : `${done} מתוך ${all} מוכנים`}</span>
      </div>
      ${groupIngredients(r.ingredients).map(g => `
        <section class="ing-group">
          ${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
          <ul class="ing-list">${g.items.map(ingRow).join('')}</ul>
        </section>`).join('')}
      ${r.equipment?.length ? `
        <section class="ing-group">
          <h3>ציוד</h3>
          <ul class="equip-list">${r.equipment.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
        </section>` : ''}
      ${r.notes?.length ? `<div class="callout tip">${ICON.bulb}<div>${r.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div></div>` : ''}
      ${r.steps.length ? `<button class="btn primary block start-cooking" data-act="tab" data-tab="steps">מתחילים לבשל ${ICON.chevL}</button>` : ''}`;
  }

  function ingRow(i) {
    const c = !!S.checked[i.id];
    return `
      <li><label class="ing ${c ? 'checked' : ''}">
        <input type="checkbox" data-ing="${esc(i.id)}" ${c ? 'checked' : ''}>
        <span class="ing-text">
          <span class="amt">${esc(amountText(i))}</span> <span class="name">${esc(i.name)}</span>
          ${i.optional ? '<span class="badge">רשות</span>' : ''}
          ${i.note ? `<span class="note">${esc(i.note)}</span>` : ''}
          ${altText(i) ? `<span class="note">${esc(altText(i))}</span>` : ''}
        </span>
      </label></li>`;
  }

  /* ---------- Steps tab ---------- */

  function timerDefs(s, i) {
    const fallback = s.title || `שלב ${i + 1}`;
    if (s.timers?.length) return s.timers.map((t, k) => ({ key: `${i}:${k}`, label: t.label || fallback, minutes: t.minutes }));
    if (s.time) return [{ key: `${i}:t`, label: fallback, minutes: s.time.minutes }];
    return [];
  }

  function timerButtons(s, i) {
    const defs = timerDefs(s, i);
    if (!defs.length) return '';
    const named = !!s.timers?.length;
    return `<div class="timer-btns" id="timer-btns">${defs.map(d => {
      const label = named ? `${esc(d.label)} · ` : '';
      const t = Timers.byKey(d.key);
      if (!t) return `
        <button class="btn timer-start" data-act="start-timer" data-key="${d.key}">
          ${ICON.play}<span>${named ? label : 'טיימר '}${esc(Fmt.minutes(d.minutes))}</span>
        </button>`;
      return `
        <button class="btn timer-live ${t.state}" data-act="focus-timer" data-id="${t.id}">
          ${ICON.timer}<span>${label}<span class="mono" data-time-id="${t.id}">${timerText(t)}</span></span>
        </button>`;
    }).join('')}</div>`;
  }

  const hasTimerForStep = k => Timers.list().some(t => t.stepIndex === k);

  function viewSteps() {
    const r = S.recipe, i = S.step, s = r.steps[i];
    const chips = [];
    if (s.time) {
      const type = s.time.type === 'active' ? ' · עבודה' : s.time.type === 'passive' ? ' · המתנה' : '';
      chips.push(`<span class="chip">${ICON.clock}${esc(Fmt.range(s.time.minutes, s.time.maxMinutes))}${type}</span>`);
    }
    if (s.heat) chips.push(`<span class="chip">${ICON.flame}אש ${esc(s.heat)}</span>`);
    if (s.temperature) chips.push(`<span class="chip hot">${ICON.thermo}${esc(Fmt.temp(s.temperature))}</span>`);

    return `
      <div class="pills" id="pills">
        ${r.steps.map((_, k) => `<button class="pill${k === i ? ' current' : ''}${k < i ? ' past' : ''}${hasTimerForStep(k) ? ' has-timer' : ''}" data-act="goto" data-step="${k}" aria-label="שלב ${k + 1}">${k + 1}</button>`).join('')}
      </div>
      <article class="step">
        <div class="step-head">
          <p class="step-count">שלב ${i + 1} מתוך ${r.steps.length}${s.group ? ` · ${esc(s.group)}` : ''}</p>
          ${Voice.canSpeak ? `<button class="icon-btn speak-btn" data-act="speak" aria-label="הקראת השלב" title="הקראת השלב">${ICON.speaker}</button>` : ''}
        </div>
        ${s.title ? `<h2 class="step-title">${esc(s.title)}</h2>` : ''}
        ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        <p class="instruction">${esc(s.instruction)}</p>
        ${s.doneWhen ? `<p class="done-when"><strong>סימן שמוכן:</strong> ${esc(s.doneWhen)}</p>` : ''}
        ${s.warning ? `<div class="callout warn">${ICON.alert}<p>${esc(s.warning)}</p></div>` : ''}
        ${timerButtons(s, i)}
        ${s.ingredients?.length ? `
          <h3 class="sub">מרכיבים לשלב</h3>
          <ul class="step-ings">${s.ingredients.map(ref => {
            const ing = ingById(ref.ref);
            const note = ref.note || ing.note;
            const alt = altText(ing);
            return `<li><span class="amt">${esc(amountText(ing, ref))}</span> ${esc(ing.name)}${note ? `<span class="note">${esc(note)}</span>` : ''}${alt ? `<span class="note">${esc(alt)}</span>` : ''}</li>`;
          }).join('')}</ul>` : ''}
        ${s.tips?.length ? `<div class="callout tip">${ICON.bulb}<div>${s.tips.map(t => `<p>${esc(t)}</p>`).join('')}</div></div>` : ''}
      </article>`;
  }

  function centerPill() {
    const box = document.getElementById('pills');
    const pill = box?.querySelector('.current');
    if (!pill) return;
    const b = box.getBoundingClientRect(), p = pill.getBoundingClientRect();
    box.scrollLeft += (p.left + p.width / 2) - (b.left + b.width / 2);
  }

  function renderStepNav() {
    const el = document.getElementById('stepnav');
    if (S.tab !== 'steps') { el.innerHTML = ''; return; }
    const n = S.recipe.steps.length, i = S.step;
    el.innerHTML = `
      <div class="stepnav">
        <button class="btn" data-act="prev" ${i === 0 ? 'disabled' : ''}>${ICON.chevR}<span>הקודם</span></button>
        <span class="nav-count">${i + 1}/${n}</span>
        <button class="btn primary" data-act="next" ${i === n - 1 ? 'disabled' : ''}><span>הבא</span>${ICON.chevL}</button>
      </div>`;
  }

  function startTimer(key) {
    const d = timerDefs(S.recipe.steps[S.step], S.step).find(x => x.key === key);
    if (d) Timers.start({ key: d.key, label: d.label, stepIndex: S.step, minutes: d.minutes });
  }

  // Timer changes only touch the timer buttons and pill dots, so scroll positions survive.
  function refreshStepTimers() {
    const box = document.getElementById('timer-btns');
    if (box) box.outerHTML = timerButtons(S.recipe.steps[S.step], S.step);
    document.querySelectorAll('.pill').forEach(p => p.classList.toggle('has-timer', hasTimerForStep(+p.dataset.step)));
  }

  /* ---------- Full text tab ---------- */

  function generateText(r) {
    const lines = [r.title];
    if (r.description) lines.push(r.description);
    if (r.author) lines.push(`המתכון של ${r.author}`);
    if (r.servings) lines.push(`${Fmt.amount(r.servings)} מנות`);
    if (r.yield) lines.push(yieldText(r));
    const meta = [
      r.totalTime && `זמן כולל: ${Fmt.range(r.totalTime.minutes, r.totalTime.maxMinutes)}`,
      r.activeTime && `זמן עבודה: ${Fmt.range(r.activeTime.minutes, r.activeTime.maxMinutes)}`,
      r.difficulty && `רמת קושי: ${r.difficulty}`,
      r.kashrut,
    ].filter(Boolean);
    if (meta.length) lines.push(meta.join(' · '));
    lines.push('', 'מרכיבים:');
    for (const g of groupIngredients(r.ingredients)) {
      if (g.name) lines.push('', `${g.name}:`);
      for (const i of g.items) lines.push(`• ${[amountText(i), i.name].filter(Boolean).join(' ')}${[i.note, altText(i), i.optional && 'רשות'].filter(Boolean).map(x => ` (${x})`).join('')}`);
    }
    if (r.equipment?.length) lines.push('', 'ציוד:', ...r.equipment.map(e => `• ${e}`));
    if (r.steps.length) lines.push('', 'אופן ההכנה:');
    r.steps.forEach((s, k) => {
      if (s.group && s.group !== r.steps[k - 1]?.group) lines.push('', `${s.group}:`);
      const extra = [s.time && Fmt.range(s.time.minutes, s.time.maxMinutes), s.temperature && Fmt.temp(s.temperature)].filter(Boolean);
      lines.push(`${k + 1}. ${s.instruction}${extra.length ? ` (${extra.join(', ')})` : ''}${s.doneWhen ? ` סימן שמוכן: ${s.doneWhen}.` : ''}`);
    });
    if (r.notes?.length) lines.push('', 'הערות:', ...r.notes);
    return lines.join('\n');
  }

  function viewText() {
    const r = S.recipe;
    return `
      ${r.fullText ? '' : '<p class="muted gen-note">אין טקסט מקורי בקובץ. הטקסט הבא נוצר מהמרכיבים ומהשלבים.</p>'}
      <div class="card fulltext">${esc(r.fullText || generateText(r))}</div>
      ${r.source ? `<p class="muted source">מקור: ${/^https?:\/\//.test(r.source) ? `<a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ''}`;
  }

  /* ---------- Timer tray ---------- */

  function timerText(t, now = Date.now()) {
    return t.state === 'done' ? `+${Fmt.clock(now - t.doneAt, true)}` : Fmt.clock(Timers.remaining(t, now));
  }

  const elapsedPct = (t, now) => 100 * (1 - Timers.remaining(t, now) / t.durationMs);

  function renderTray() {
    const tray = document.getElementById('tray');
    if (!tray) return;
    const list = Timers.list(), now = Date.now();
    tray.innerHTML = list.length ? `<div class="tray">${list.map(t => `
      <div class="timer-card ${t.state}" data-card="${t.id}">
        <button class="tc-label" data-act="goto" data-step="${t.stepIndex}">
          <span>${esc(t.label)}</span><small>שלב ${t.stepIndex + 1}</small>
        </button>
        <div class="tc-time"><span class="mono" data-time-id="${t.id}">${timerText(t, now)}</span></div>
        <div class="tc-bar"><i data-bar-id="${t.id}" style="width:${elapsedPct(t, now)}%"></i></div>
        <div class="tc-actions">
          ${t.state === 'done'
            ? `<button class="tc-btn stop" data-act="t-remove" data-id="${t.id}">עצירה</button>
               <button class="tc-btn" data-act="t-add" data-id="${t.id}" aria-label="עוד דקה"><span class="mono">+1</span></button>`
            : `<button class="tc-btn" data-act="${t.state === 'running' ? 't-pause' : 't-resume'}" data-id="${t.id}" aria-label="${t.state === 'running' ? 'השהיה' : 'המשך'}">${t.state === 'running' ? ICON.pause : ICON.play}</button>
               <button class="tc-btn" data-act="t-add" data-id="${t.id}" aria-label="עוד דקה"><span class="mono">+1</span></button>
               <button class="tc-btn" data-act="t-remove" data-id="${t.id}" aria-label="ביטול">${ICON.x}</button>`}
        </div>
      </div>`).join('')}</div>` : '';
  }

  function focusTimer(id) {
    const card = document.querySelector(`[data-card="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  }

  function removeTimer(id) {
    const t = Timers.list().find(x => x.id === id);
    if (t && t.state !== 'done' && !confirm(`לבטל את הטיימר "${t.label}"?`)) return;
    Timers.remove(id);
  }

  function updateTitle(now = Date.now()) {
    const list = onRecipe() ? Timers.list() : [];
    let title = BASE_TITLE;
    if (list.some(t => t.state === 'done')) title = '⏰ הזמן נגמר!';
    else {
      const next = list.filter(t => t.state === 'running').sort((a, b) => a.endAt - b.endAt)[0];
      if (next) title = `⏱ ${Fmt.clock(next.endAt - now)} · ${next.label}`;
      else if (S?.recipe && onRecipe()) title = S.recipe.title;
    }
    if (document.title !== title) document.title = title;
  }

  /* ---------- Voice ---------- */

  let voiceOn = false, voiceState = 'listening', voiceError = '', heard = '', heardTimer = 0;

  function stepSpeech(i) {
    const s = S.recipe.steps[i], n = S.recipe.steps.length;
    const parts = [`שלב ${i + 1}${s.title ? `: ${s.title}` : ''}.`, s.instruction];
    if (s.doneWhen) parts.push(`סימן שמוכן: ${s.doneWhen}.`);
    if (s.warning) parts.push(`שימו לב: ${s.warning}`);
    if (s.temperature) parts.push(`טמפרטורה: ${Fmt.temp(s.temperature).replace(' · ', ', ')}.`);
    const idle = timerDefs(s, i).filter(d => !Timers.byKey(d.key));
    if (idle.length === 1) parts.push(`יש טיימר ${forMinutes(idle[0].minutes)}.${voiceOn ? ' אמרו "טיימר" כדי להפעיל.' : ''}`);
    else if (idle.length > 1) parts.push(`יש ${idle.length} טיימרים בשלב הזה.`);
    if (i === n - 1) parts.push('זה השלב האחרון.');
    return parts.join(' ');
  }

  function ingredientsSpeech() {
    const s = S.recipe.steps[S.step];
    if (!s.ingredients?.length) return 'אין מרכיבים בשלב הזה.';
    return s.ingredients.map(ref => {
      const ing = ingById(ref.ref);
      const amount = ref.amount ?? ing.amount;
      return [amount != null ? Voice.say.amount(amount) : '', ref.unit ?? ing.unit ?? '', ing.name].filter(Boolean).join(' ');
    }).join(', ') + '.';
  }

  function say(text) {
    Voice.speak(text, () => setVoiceState(voiceOn ? 'listening' : voiceState));
    if (voiceOn) setVoiceState('speaking');
  }

  const speakStep = () => say(stepSpeech(S.step));

  // "ל-8 דקות" / "לדקה": a prefix glued to a digit trips up speech engines.
  const forMinutes = m => { const t = Voice.say.minutes(m); return /^\d/.test(t) ? `ל-${t}` : `ל${t}`; };

  function runCommand(c) {
    const steps = S.recipe.steps, s = steps[S.step];
    if (S.tab !== 'steps' && ['repeat', 'ingredients', 'timer', 'tip'].includes(c.cmd)) setTab('steps');
    switch (c.cmd) {
      case 'next':
        if (S.step < steps.length - 1) goStep(S.step + 1); else say('זה השלב האחרון.');
        break;
      case 'prev':
        if (S.step > 0) goStep(S.step - 1); else say('זה השלב הראשון.');
        break;
      case 'goto':
        if (c.n >= 1 && c.n <= steps.length) goStep(c.n - 1); else say(`אין שלב ${c.n}. יש ${steps.length} שלבים.`);
        break;
      case 'repeat': speakStep(); break;
      case 'ingredients': say(ingredientsSpeech()); break;
      case 'tip': say(s.tips?.length ? s.tips.join(' ') : 'אין טיפים לשלב הזה.'); break;
      case 'timer': {
        const d = timerDefs(s, S.step).find(x => !Timers.byKey(x.key));
        if (d) {
          startTimer(d.key);
          say(`הפעלתי טיימר${d.label !== s.title ? ` ${d.label}` : ''} ${forMinutes(d.minutes)}.`);
        } else if (timerDefs(s, S.step).length) runCommand({ cmd: 'timeLeft' });
        else say('אין טיימר בשלב הזה.');
        break;
      }
      case 'timeLeft': {
        const running = Timers.list().filter(t => t.state !== 'done');
        say(running.length
          ? running.map(t => `${t.label}: עוד ${Voice.say.remaining(Timers.remaining(t))}${t.state === 'paused' ? ', בהשהיה' : ''}.`).join(' ')
          : 'אין טיימרים פעילים.');
        break;
      }
      case 'stop':
        Voice.stopSpeaking();
        Timers.list().filter(t => t.state === 'done').forEach(t => Timers.remove(t.id));
        setVoiceState('listening');
        break;
    }
  }

  function onHeard(alternatives) {
    const c = Voice.parse(alternatives);
    // Unrecognized phrases are shown too, so it's clear the mic is hearing.
    heard = c ? `שמעתי: "${alternatives[0]}"` : `שמעתי: "${alternatives[0]}" · לא פקודה`;
    clearTimeout(heardTimer);
    heardTimer = setTimeout(() => { heard = ''; renderVoiceBar(); }, 3000);
    if (c) runCommand(c);
    renderVoiceBar();
  }

  function setVoiceState(state, detail = '') {
    voiceState = state;
    voiceError = detail;
    if (state === 'denied') {
      voiceOn = false;
      document.getElementById('voice-btn')?.setAttribute('aria-pressed', 'false');
    }
    renderVoiceBar();
  }

  function renderVoiceBar() {
    const el = document.getElementById('voicebar');
    if (!el) return;
    if (!voiceOn && voiceState !== 'denied') { el.innerHTML = ''; return; }
    const text = voiceState === 'denied' ? 'אין גישה למיקרופון. אפשר לאשר בהגדרות הדפדפן.'
      : voiceState === 'error' ? `שגיאה בזיהוי דיבור (${esc(voiceError)}). מנסה שוב…`
      : heard ? esc(heard)
      : voiceState === 'speaking' ? 'מקריא… אפשר לומר "עצור"'
      : 'מקשיב. נסו "הבא", "שוב" או "טיימר"';
    el.innerHTML = `
      <div class="voicebar ${voiceState}">
        <span class="vb-dot" aria-hidden="true"></span>
        <span class="vb-text" role="status">${text}</span>
        <button class="link-btn" data-act="voice-help">פקודות</button>
      </div>`;
  }

  function toggleVoice() {
    voiceOn = !voiceOn;
    document.getElementById('voice-btn')?.setAttribute('aria-pressed', String(voiceOn));
    if (voiceOn) {
      voiceState = 'listening';
      if (S.tab !== 'steps') setTab('steps');
      // Speak first: the mic starts when speech ends, so a permission prompt isn't cut off.
      say(`מצב קולי פעיל. ${stepSpeech(S.step)}`);
      Voice.listen(onHeard, setVoiceState);
    } else {
      Voice.stopListening();
      Voice.stopSpeaking();
      voiceState = 'listening';
    }
    renderVoiceBar();
  }

  function stopVoice() {
    if (!voiceOn) return Voice.stopSpeaking();
    toggleVoice();
  }

  // Announce finished timers in voice mode.
  let doneIds = new Set(Timers.list().filter(t => t.state === 'done').map(t => t.id));

  Timers.onChange(() => {
    const done = Timers.list().filter(t => t.state === 'done');
    const fresh = done.filter(t => !doneIds.has(t.id));
    doneIds = new Set(done.map(t => t.id));
    if (voiceOn && fresh.length) say(`${fresh.map(t => `הטיימר ${t.label} הסתיים.`).join(' ')} אמרו "עצור" כדי להשתיק.`);
    if (!onRecipe()) return;
    renderTray();
    if (S.tab === 'steps') refreshStepTimers();
  });

  Timers.onTick(now => {
    for (const t of Timers.list()) {
      const txt = timerText(t, now);
      document.querySelectorAll(`[data-time-id="${t.id}"]`).forEach(el => { if (el.textContent !== txt) el.textContent = txt; });
      const bar = document.querySelector(`[data-bar-id="${t.id}"]`);
      if (bar) bar.style.width = `${elapsedPct(t, now)}%`;
    }
    updateTitle(now);
  });

  /* ---------- Keep screen on ---------- */

  let wakeLock = null, wakeWanted = true, wakePending = false;

  async function requestWake() {
    if (!('wakeLock' in navigator) || !wakeWanted || wakeLock || wakePending || document.visibilityState !== 'visible') return updateWakeBtn();
    wakePending = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; updateWakeBtn(); });
    } catch {}
    wakePending = false;
    updateWakeBtn();
  }

  function releaseWake() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function updateWakeBtn() {
    const b = document.getElementById('wake-btn');
    if (!b) return;
    b.hidden = !('wakeLock' in navigator);
    b.setAttribute('aria-pressed', String(!!wakeLock));
    const label = wakeLock ? 'המסך נשאר דלוק (לחיצה לביטול)' : 'השארת המסך דלוק';
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  function toggleWake() {
    if (wakeLock) { wakeWanted = false; releaseWake(); updateWakeBtn(); }
    else { wakeWanted = true; requestWake(); }
  }

  document.addEventListener('visibilitychange', () => { if (onRecipe()) requestWake(); });

  /* ---------- Events ---------- */

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'home': goHome(); break;
      case 'resume': resume(); break;
      case 'open-url': openUrl(el.dataset.path); break;
      case 'open-drive': openDrive(id); break;
      case 'paste': parseAndOpen(document.getElementById('paste-input').value, { type: 'paste' }); break;
      case 'tab': setTab(el.dataset.tab); break;
      case 'goto': goStep(+el.dataset.step); break;
      case 'prev': goStep(S.step - 1); break;
      case 'next': goStep(S.step + 1); break;
      case 'uncheck': S.checked = {}; saveSession(); renderView(); break;
      case 'start-timer': startTimer(el.dataset.key); break;
      case 'focus-timer': focusTimer(id); break;
      case 't-pause': Timers.pause(id); break;
      case 't-resume': Timers.resume(id); break;
      case 't-add': Timers.addMinute(id); break;
      case 't-remove': removeTimer(id); break;
      case 'wake': toggleWake(); break;
      case 'voice': toggleVoice(); break;
      case 'voice-help': document.getElementById('voice-help').showModal(); break;
      case 'speak':
        if (Voice.isSpeaking()) { Voice.stopSpeaking(); setVoiceState('listening'); } else speakStep();
        break;
      case 'theme': toggleTheme(); break;
    }
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'file-input') {
      const f = el.files[0];
      if (f) f.text().then(t => parseAndOpen(t, { type: 'file', name: f.name }));
    } else if (el.dataset.ing) {
      S.checked[el.dataset.ing] = el.checked;
      saveSession();
      renderView();
    }
  });

  // Desktop convenience. In RTL, "next" is to the left.
  document.addEventListener('keydown', e => {
    if (!onRecipe() || S.tab !== 'steps' || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') goStep(S.step + 1);
    else if (e.key === 'ArrowRight') goStep(S.step - 1);
  });

  window.addEventListener('popstate', e => {
    const s = loadSession();
    if (e.state?.view === 'recipe' && s?.recipe) { S = s; renderRecipe(); requestWake(); }
    else renderHome();
  });

  /* ---------- Boot ---------- */

  const params = new URLSearchParams(location.search);
  const path = params.get('recipe'), driveId = params.get('drive');
  const session = loadSession();
  if (driveId) openDrive(driveId, { replace: true });
  else if (path) openUrl(path, { replace: true });
  else if (history.state?.view === 'recipe' && session?.recipe) { S = session; renderRecipe(); requestWake(); }
  else { history.replaceState({ view: 'home' }, '', location.pathname); renderHome(); }
})();
