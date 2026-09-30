/*
 * 页面装配：类型切换、构建器、查询串（语法高亮）、跳转、本页查询、历史、分享、主题、语言、Token 设置。
 */
(function (global) {
  'use strict';

  const { TYPES, sortLabel } = global.GHS.schema;
  const Q = global.GHS.query;
  const { ResultStore, ResultsView } = global.GHS.results;
  const i18n = global.GHS.i18n;
  const t = global.GHS.t;
  const el = global.GHS.el;
  const icon = global.GHS.icon;
  const $ = s => document.querySelector(s);

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('ghs.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('ghs.' + k, JSON.stringify(v)); } catch (_) { /* 存储不可用 */ } },
    del(k) { try { localStorage.removeItem('ghs.' + k); } catch (_) { /* 存储不可用 */ } },
  };

  const BRANCH_LIMIT = 16;

  const dayOffset = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const EXAMPLES = [
    { label: 'ex.1', type: 'repositories', q: 'language:Rust stars:>10000', sort: 'stars' },
    { label: 'ex.2', type: 'repositories', q: () => '(llm OR agent) created:>=' + dayOffset(365) + ' stars:>200', sort: 'stars' },
    { label: 'ex.3', type: 'repositories', q: '"component library" in:name,description (language:Vue OR language:TypeScript) stars:>500', sort: 'stars' },
    { label: 'ex.4', type: 'repositories', q: 'cli language:Go archived:false NOT awesome stars:100..5000', sort: 'updated' },
    { label: 'ex.5', type: 'issues', q: 'label:"good first issue" is:open no:assignee (language:TypeScript OR language:Python)', sort: 'created' },
    { label: 'ex.6', type: 'pullrequests', q: () => 'is:merged merged:>=' + dayOffset(7) + ' repo:microsoft/vscode', sort: 'updated' },
    { label: 'ex.7', type: 'users', q: 'location:china language:Go followers:>1000', sort: 'followers' },
  ];

  const state = { type: 'repositories', sort: '', order: 'desc', root: null };

  let builder, results, theme;
  let textDirty = false;

  /* ---------- 状态读写 ---------- */

  function encodeState() {
    const json = JSON.stringify({ t: state.type, s: state.sort, o: state.order, q: currentQuery() });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeState(str) {
    try { return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { return null; }
  }

  function applySaved(s) {
    if (!s || !TYPES[s.t]) return false;
    state.type = s.t;
    state.sort = s.s || '';
    state.order = s.o || 'desc';
    state.root = Q.parse(s.q || '', state.type);
    return true;
  }

  function persist() {
    LS.set('state', { t: state.type, s: state.sort, o: state.order, q: currentQuery() });
  }

  /* ---------- 查询串 ---------- */

  const currentQuery = () => Q.toQueryString(state.root, state.type);
  const branches = () => Q.toBranches(state.root, state.type, BRANCH_LIMIT);

  function webUrl(q) {
    const p = new URLSearchParams({ q, type: TYPES[state.type].web });
    if (state.sort) { p.set('s', state.sort); p.set('o', state.order); }
    return 'https://github.com/search?' + p;
  }

  /* 语法高亮：逐字符保留原文，仅包裹 span，保证与 textarea 对齐 */
  function highlight(src) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const span = (cls, s) => '<span class="' + cls + '">' + esc(s) + '</span>';
    const value = v => {
      if (/^".*"?$/.test(v)) return span('hs', v);
      const m = /^(>=|<=|>|<)?(.*?)(?:(\.\.)(.*))?$/.exec(v);
      return (m[1] ? span('hc', m[1]) : '') + span('hv', m[2]) + (m[3] ? span('hc', '..') + span('hv', m[4]) : '');
    };
    let out = '';
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { const m = /^\s+/.exec(src.slice(i))[0]; out += esc(m); i += m.length; continue; }
      if (ch === '(' || ch === ')') { out += span('hp', ch); i++; continue; }
      let j = i;
      while (j < src.length && !/[\s()]/.test(src[j])) {
        if (src[j] === '"') { const e = src.indexOf('"', j + 1); j = e === -1 ? src.length : e + 1; } else j++;
      }
      const tk = src.slice(i, j);
      i = j;
      let m;
      if (tk === 'AND' || tk === 'OR' || tk === 'NOT') out += span('ho', tk);
      else if ((m = /^(-?)([a-zA-Z][\w-]*)(:)([\s\S]*)$/.exec(tk))) out += (m[1] ? span('hn', '-') : '') + span('hk', m[2]) + span('hp', ':') + value(m[4]);
      else if (tk[0] === '"') out += span('hs', tk);
      else if (tk[0] === '-' && tk.length > 1) out += span('hn', tk);
      else out += span('hw', tk);
    }
    return out + '\n';
  }

  function syncEditor() {
    const ta = $('#query');
    $('#q-hl').innerHTML = highlight(ta.value);
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function refreshOutput() {
    const q = currentQuery();
    if (!textDirty) $('#query').value = q;
    syncEditor();
    $('#q-len').textContent = q.length + ' / 256';
    $('#q-len').classList.toggle('over', q.length > 256);

    const warns = Q.lint(q).concat(Q.diagnose(state.root, state.type));
    let bs = [];
    try { bs = branches(); } catch (e) { warns.push(e.message); }

    const box = $('#branches');
    box.hidden = bs.length < 2;
    if (bs.length > 1) {
      renderBranchTitle(bs.length);
      $('#branch-list').replaceChildren(...bs.map((b, i) => el('li', null,
        el('code', { title: b }, b),
        el('button', { type: 'button', class: 'icon-btn xs', title: t('ui.copy'), onclick: () => copy(b, t('t.copiedBranch', { n: i + 1 })) }, icon('copy', 13)),
        el('a', { class: 'icon-btn xs', title: t('ui.openGh'), href: webUrl(b), target: '_blank', rel: 'noopener noreferrer' }, icon('external', 13)))));
    }
    if (bs.length < 2) $('#branches').classList.remove('is-split');
    const split = bs.length > 1 && Q.needsSplit(state.root, state.type);
    $('#btn-open').classList.toggle('split', split);
    $('#btn-open').title = split ? t('t.openBranches') : '';
    if (bs.some(b => Q.lint(b).length)) warns.push(t('w.branchLimit'));
    if (state.type === 'code' && !LS.get('token', '')) warns.push(t('w.codeToken'));

    $('#q-warn').replaceChildren(...warns.map(w => el('div', { class: 'warn' }, icon('alert', 13), w)));
    $('#q-dirty').hidden = !textDirty;
    persist();
  }

  /*
   * 子查询区标题：GitHub 无法一条搜出时，显示一行橙色状态 + “为什么”按钮，完整原因放进气泡，
   * 避免在查询框下堆一大段说明。
   */
  function renderBranchTitle(n) {
    const box = $('#branches');
    const title = $('#branch-title');
    hideTip();
    const split = Q.needsSplit(state.root, state.type);
    box.classList.toggle('is-split', split);
    if (!split) { title.replaceChildren(t('ui.branches', { n })); return; }
    const why = el('button', {
      type: 'button', class: 'why-btn', 'aria-label': t('ui.why'), title: t('ui.why'),
      onclick: e => showTip(e.currentTarget, t('w.qualOr', { type: t('type.' + state.type), n })),
    }, icon('help', 14));
    title.replaceChildren(icon('alert', 13), el('span', null, t('w.qualOrShort', { n })), why);
  }

  /* 轻量说明气泡（毛玻璃）：点外部、Esc、滚动/缩放时关闭；再次点击同一按钮也关闭 */
  let tipEl = null;
  let tipAnchor = null;
  function hideTip() {
    if (!tipEl || tipEl.hidden) return;
    tipEl.hidden = true;
    if (tipAnchor) tipAnchor.setAttribute('aria-expanded', 'false');
    tipAnchor = null;
  }
  function showTip(anchor, text) {
    if (tipAnchor === anchor) return hideTip();
    if (!tipEl) {
      tipEl = el('div', { class: 'tip-pop', role: 'tooltip' });
      tipEl.hidden = true;
      document.body.append(tipEl);
      document.addEventListener('pointerdown', e => { if (tipAnchor && !tipEl.contains(e.target) && !tipAnchor.contains(e.target)) hideTip(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
      window.addEventListener('resize', hideTip);
      window.addEventListener('scroll', hideTip, { passive: true });
    }
    tipEl.textContent = text;
    tipEl.hidden = false;
    tipAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
    const below = r.bottom + 8 + h <= window.innerHeight - 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = (below ? r.bottom + 8 : r.top - 8 - h) + 'px';
  }

  /* ---------- 操作 ---------- */

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(msg || t('t.copied'));
  }

  let toastTimer;
  function toast(msg, isErr) {
    const box = $('#toast');
    box.textContent = msg;
    box.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.className = 'toast'; }, 2200);
  }

  /* 文本框被手工编辑过时，执行前先解析回构建器，保证两边一致 */
  function syncFromText() {
    if (!textDirty) return;
    state.root = Q.parse($('#query').value, state.type);
    builder.setRoot(state.root);
    textDirty = false;
    refreshOutput();
  }

  function addHistory(q) {
    if (!q) return;
    const h = LS.get('history', []).filter(x => !(x.q === q && x.t === state.type));
    h.unshift({ t: state.type, q, s: state.sort, o: state.order, at: Date.now() });
    LS.set('history', h.slice(0, 30));
    renderHistory();
  }

  function renderHistory() {
    const h = LS.get('history', []);
    $('#history-count').textContent = h.length || '';
    const list = $('#history-list');
    if (!h.length) { list.replaceChildren(el('li', { class: 'muted-line' }, t('ui.noHistory'))); return; }
    list.replaceChildren(...h.map(x => el('li', null,
      el('button', { type: 'button', class: 'hist', title: new Date(x.at).toLocaleString(i18n.lang), onclick: () => load(x) },
        icon(TYPES[x.t] ? TYPES[x.t].icon : 'search', 13), el('code', null, x.q)))));
  }

  function renderExamples() {
    $('#examples').replaceChildren(...EXAMPLES.map(ex => el('button', {
      type: 'button', class: 'example',
      onclick: () => load({ t: ex.type, q: typeof ex.q === 'function' ? ex.q() : ex.q, s: ex.sort || '', o: 'desc' }),
    }, icon(TYPES[ex.type].icon, 13), t(ex.label))));
  }

  function load(saved) {
    applySaved(saved);
    syncControls();
    builder.type = state.type;
    builder.setRoot(state.root);
    textDirty = false;
    refreshOutput();
  }

  function openOnGithub() {
    syncFromText();
    const q = currentQuery();
    if (!q) return toast(t('t.empty'), true);
    // GitHub 无法用一条查询正确表达时，不打开必然 0 条/错误结果的页面，改为引导到子查询列表
    if (Q.needsSplit(state.root, state.type)) {
      toast(t('t.openBranches'), true);
      const box = $('#branches');
      box.classList.remove('flash');
      void box.offsetWidth;
      box.classList.add('flash');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    addHistory(q);
    window.open(webUrl(q), '_blank', 'noopener');
  }

  function runHere() {
    syncFromText();
    const q = currentQuery();
    if (!q) return toast(t('t.empty'), true);
    let bs;
    try { bs = branches(); } catch (e) { return toast(e.message, true); }
    const token = LS.get('token', '');
    if (state.type === 'code' && !token) {
      toast(t('w.codeToken'), true);
      return openSettings();
    }
    addHistory(q);
    $('#results-card').hidden = false;
    results.start(new ResultStore({ type: state.type, endpoint: TYPES[state.type].api, branches: bs, sort: state.sort, order: state.order, token }));
    $('#results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTypes() {
    $('#types').replaceChildren(...Object.entries(TYPES).map(([k, ty]) => el('button', {
      type: 'button', role: 'tab', 'data-type': k, title: ty.note ? t(ty.note) : t('type.' + k),
      onclick: () => {
        if (state.type === k) return;
        syncFromText();
        state.type = k;
        builder.setType(k);
        state.root = builder.root;
        syncControls();
        refreshOutput();
      },
    }, icon(ty.icon, 16), t('type.' + k))));
  }

  function syncControls() {
    for (const b of document.querySelectorAll('#types button')) {
      const on = b.dataset.type === state.type;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    }
    const sortSel = $('#sort');
    sortSel.replaceChildren(...TYPES[state.type].sorts.map(v => el('option', { value: v }, sortLabel(v))));
    if (!TYPES[state.type].sorts.includes(state.sort)) state.sort = '';
    sortSel.value = state.sort;
    renderOrder();
  }

  function renderOrder() {
    const b = $('#order');
    b.disabled = !state.sort;
    b.title = state.order === 'desc' ? t('ui.desc') : t('ui.asc');
    b.replaceChildren(icon(state.order === 'desc' ? 'sortDown' : 'sortUp', 16));
  }

  /* ---------- 主题 ---------- */

  const THEMES = ['auto', 'light', 'dark'];
  function applyTheme() {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const b = $('#btn-theme');
    b.replaceChildren(icon(theme === 'auto' ? 'monitor' : theme === 'light' ? 'sun' : 'moon', 16));
    b.title = t({ auto: 'ui.themeAuto', light: 'ui.themeLight', dark: 'ui.themeDark' }[theme]);
  }

  /* ---------- 语言 ---------- */

  /*
   * SEO：按当前语言更新 meta description；canonical 指向当前语言版本（带 ?lang= 时保留该参数，
   * 与 index.html 的 hreflang 对应）。canonical 只在 JS 中设置，静态 HTML 不写，避免两者冲突。
   */
  function applySeo() {
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = t('app.desc');
    if (!/^https?:$/.test(location.protocol)) return;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.append(link); }
    const hasLang = new URLSearchParams(location.search).has('lang');
    link.href = location.origin + location.pathname + (hasLang ? '?lang=' + encodeURIComponent(i18n.lang) : '');
  }

  /* 静态文案：data-i18n 设文本（保留图标），data-i18n-title / -ph / -aria 设属性 */
  function applyStatic() {
    document.documentElement.lang = i18n.lang;
    document.title = t('app.title');
    applySeo();
    for (const e of document.querySelectorAll('[data-i18n]')) {
      for (const n of [...e.childNodes]) if (!(n.nodeType === 1 && n.classList.contains('ic'))) n.remove();
      e.append(t(e.dataset.i18n));
    }
    for (const e of document.querySelectorAll('[data-i18n-title]')) { e.title = t(e.dataset.i18nTitle); e.setAttribute('aria-label', e.title); }
    for (const e of document.querySelectorAll('[data-i18n-ph]')) e.placeholder = t(e.dataset.i18nPh);
    for (const e of document.querySelectorAll('[data-i18n-aria]')) e.setAttribute('aria-label', t(e.dataset.i18nAria));
  }

  /* 语言菜单：复用通用毛玻璃选择器 */
  function initLangMenu() {
    const btn = $('#lang-btn');
    const open = () => global.GHS.picker.open(btn, {
      items: i18n.LANGS.map(([code, name]) => ({ value: code, label: name, lang: code })),
      value: i18n.lang, align: 'end',
      onSelect: code => { i18n.setLang(code); applyLang(); },
    });
    btn.addEventListener('click', open);
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });
  }

  function renderLangMenu() {
    const cur = i18n.LANGS.find(l => l[0] === i18n.lang);
    $('#lang-cur').textContent = cur ? cur[1] : i18n.lang;
  }

  function applyLang() {
    renderLangMenu();
    applyStatic();
    renderTypes();
    syncControls();
    builder.render();
    hideTip();
    refreshOutput();
    renderHistory();
    renderExamples();
    renderTokenState();
    applyTheme();
    results.renderAll(true);
  }

  /* ---------- Token ---------- */

  function openSettings() {
    $('#token').value = LS.get('token', '');
    $('#settings').showModal();
  }

  function renderTokenState() {
    const has = !!LS.get('token', '');
    $('#btn-settings').classList.toggle('ok', has);
    $('#btn-settings').title = has ? t('ui.tokenSet') : t('ui.tokenUnset');
  }

  /* ---------- 初始化 ---------- */

  function init() {
    for (const e of document.querySelectorAll('[data-icon]')) e.prepend(icon(e.dataset.icon, Number(e.dataset.size) || 16));

    initLangMenu();

    const hash = new URLSearchParams(location.hash.slice(1)).get('s');
    if (!(hash && applySaved(decodeState(hash))) && !applySaved(LS.get('state', null))) {
      state.root = Q.newGroup('AND', [Q.newCond('keyword'), Q.newCond('stars', { op: '>=', value: '' })]);
    }
    if (hash) history.replaceState(null, '', location.pathname + location.search);

    builder = new global.GHS.Builder($('#builder'), {
      type: state.type, root: state.root,
      onChange: root => { state.root = root; textDirty = false; refreshOutput(); },
    });
    results = new ResultsView($('#results'));
    theme = LS.get('theme', 'auto');

    $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderOrder(); persist(); });
    $('#order').addEventListener('click', () => { state.order = state.order === 'desc' ? 'asc' : 'desc'; renderOrder(); persist(); });

    const ta = $('#query');
    ta.addEventListener('input', () => { textDirty = true; $('#q-dirty').hidden = false; syncEditor(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runHere(); } });
    window.addEventListener('resize', syncEditor);

    $('#btn-copy').addEventListener('click', () => { syncFromText(); copy(currentQuery(), t('t.copiedQuery')); });
    $('#btn-open').addEventListener('click', openOnGithub);
    $('#btn-run').addEventListener('click', runHere);
    $('#btn-parse').addEventListener('click', () => { textDirty = true; syncFromText(); toast(t('t.synced')); });
    $('#btn-share').addEventListener('click', () => { syncFromText(); copy(location.origin + location.pathname + '#s=' + encodeState(), t('t.shareCopied')); });
    $('#btn-reset').addEventListener('click', () => {
      state.root = Q.newGroup('AND', [Q.newCond('keyword')]);
      textDirty = false;
      builder.setRoot(state.root);
      refreshOutput();
    });
    $('#btn-clear-history').addEventListener('click', () => { LS.del('history'); renderHistory(); });

    $('#btn-theme').addEventListener('click', () => {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      LS.set('theme', theme);
      applyTheme();
    });

    $('#btn-settings').addEventListener('click', openSettings);
    $('#settings-form').addEventListener('submit', e => {
      if (e.submitter && e.submitter.value === 'save') {
        const v = $('#token').value.trim();
        v ? LS.set('token', v) : LS.del('token');
        renderTokenState();
        refreshOutput();
        toast(v ? t('t.tokenSaved') : t('t.tokenCleared'));
      }
    });

    applyLang();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
