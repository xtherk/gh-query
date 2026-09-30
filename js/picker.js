/*
 * 通用弹出选择器（毛玻璃下拉）。原生 select 的选项无法混排字体、也无法做毛玻璃，因此自绘。
 *
 *   GHS.picker.open(anchor, {
 *     items: [{ value, label, hint?, tag? }],   // hint 以等宽小字靠右显示（如限定符 language:）
 *     value, onSelect(value), search?: bool, placeholder?, align?: 'start' | 'end',
 *   })
 *
 * 菜单挂在 body 下 fixed 定位：顶栏自身有 backdrop-filter，嵌套在里面的毛玻璃模糊不到页面内容。
 * 关闭条件：选中、Esc、Tab、点外部、窗口滚动/缩放；再次点击同一锚点也会关闭。
 */
(function (global) {
  'use strict';

  const icon = (n, s) => global.GHS.icon(n, s);
  const t = (k, p) => global.GHS.t(k, p);

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let menu, input, list;
  let cur = null; // { anchor, opts, shown: [{item, el}], active }

  function ensure() {
    if (menu) return;
    menu = h('div', 'pop-menu');
    menu.setAttribute('role', 'dialog');
    menu.tabIndex = -1;
    menu.hidden = true;
    input = h('input', 'pop-search');
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    list = h('div', 'pop-list');
    list.setAttribute('role', 'listbox');
    menu.append(input, list);
    document.body.append(menu);

    input.addEventListener('input', () => { render(input.value); position(); reveal(); });
    menu.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', e => {
      if (cur && !menu.contains(e.target) && !cur.anchor.contains(e.target)) close();
    });
    window.addEventListener('resize', () => close());
    window.addEventListener('scroll', () => close(), { passive: true });
  }

  function render(query) {
    const q = (query || '').trim().toLowerCase();
    const { items, value } = cur.opts;
    const match = it => !q || [it.label, it.hint, it.value].some(s => s && String(s).toLowerCase().includes(q));
    cur.shown = [];
    list.replaceChildren();
    for (const it of items.filter(match)) {
      const b = h('button', 'pop-item');
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(it.value === value));
      if (it.lang) b.lang = it.lang;
      b.append(h('span', 'pi-label', it.label));
      if (it.tag) b.append(h('span', 'pi-tag', it.tag));
      if (it.hint) b.append(h('span', 'pi-hint', it.hint));
      const mark = h('span', 'pi-check');
      if (it.value === value) mark.append(icon('check', 14));
      b.append(mark);
      const idx = cur.shown.length;
      b.addEventListener('mousemove', () => setActive(idx, false));
      b.addEventListener('click', () => choose(it.value));
      cur.shown.push({ item: it, el: b });
      list.append(b);
    }
    if (!cur.shown.length) list.append(h('div', 'pop-empty', t('b.noMatch')));
    const sel = cur.shown.findIndex(s => s.item.value === value);
    setActive(q ? 0 : Math.max(0, sel), true);
  }

  function setActive(i, scroll) {
    if (!cur.shown.length) { cur.active = -1; return; }
    cur.active = Math.max(0, Math.min(i, cur.shown.length - 1));
    cur.shown.forEach((s, k) => s.el.classList.toggle('active', k === cur.active));
    if (scroll) reveal();
  }

  /* 让当前项在列表内可见；只滚动列表本身，避免 scrollIntoView 连带滚动页面而触发关闭 */
  function reveal() {
    if (!cur || cur.active < 0 || !cur.shown.length) return;
    const e = cur.shown[cur.active].el;
    const top = e.offsetTop;
    const bottom = top + e.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  function onKey(e) {
    if (!cur) return;
    const n = cur.shown.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (n) setActive((cur.active + 1) % n, true); break;
      case 'ArrowUp': e.preventDefault(); if (n) setActive((cur.active - 1 + n) % n, true); break;
      case 'Home': if (e.target !== input) { e.preventDefault(); setActive(0, true); } break;
      case 'End': if (e.target !== input) { e.preventDefault(); setActive(n - 1, true); } break;
      case 'Enter': e.preventDefault(); if (n && cur.active >= 0) choose(cur.shown[cur.active].item.value); break;
      case 'Escape': e.preventDefault(); close(true); break;
      case 'Tab': close(); break;
    }
  }

  function position() {
    const r = cur.anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    menu.style.minWidth = Math.max(Math.round(r.width), 176) + 'px'; // 行内值会覆盖 CSS 的 min-width，这里取两者较大者
    menu.style.maxHeight = '';
    const mw = menu.offsetWidth;
    let mh = menu.offsetHeight;
    let left = cur.opts.align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, vw - mw - 8));
    const below = vh - r.bottom - 16;
    const above = r.top - 16;
    let top;
    // 优先向下；下方放不下完整列表时只要还有 240px 也向下并限高，空间实在不够且上方更大时才向上
    if (mh <= below || below >= Math.min(mh, 240) || below >= above) {
      if (mh > below) { menu.style.maxHeight = below + 'px'; mh = below; }
      top = r.bottom + 6;
      menu.style.transformOrigin = 'top';
    } else {
      if (mh > above) { menu.style.maxHeight = above + 'px'; mh = above; }
      top = r.top - 6 - mh;
      menu.style.transformOrigin = 'bottom';
    }
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function open(anchor, opts) {
    ensure();
    if (cur && cur.anchor === anchor) { close(true); return; }
    close();
    cur = { anchor, opts, shown: [], active: -1 };
    const searchable = !!opts.search;
    input.hidden = !searchable;
    input.value = '';
    input.placeholder = opts.placeholder || '';
    menu.hidden = false;
    // 重新触发入场动画
    menu.classList.remove('in');
    void menu.offsetWidth;
    menu.classList.add('in');
    render('');
    position();
    reveal();
    anchor.setAttribute('aria-expanded', 'true');
    (searchable ? input : menu).focus({ preventScroll: true });
  }

  function close(restoreFocus) {
    if (!cur) return;
    const { anchor } = cur;
    cur = null;
    menu.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function choose(value) {
    const { opts, anchor } = cur;
    close(true);
    if (value !== opts.value) opts.onSelect(value, anchor);
  }

  global.GHS.picker = { open, close };
})(window);
