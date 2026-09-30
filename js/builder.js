/*
 * 条件构建器：把表达式树渲染为可编辑的嵌套条件组。
 * 结构变化（增删、切换字段）整体重绘；值输入只更新模型并回调 onChange，保持输入焦点。
 */
(function (global) {
  'use strict';

  const { TYPES, rangeOps, getField, fieldParts, optionLabel } = global.GHS.schema;
  const Q = global.GHS.query;
  const icon = global.GHS.icon;
  const t = (k, p) => global.GHS.t(k, p);

  function datePresets() {
    const rtf = new Intl.RelativeTimeFormat(global.GHS.i18n.lang, { numeric: 'auto' });
    const rtfN = new Intl.RelativeTimeFormat(global.GHS.i18n.lang, { numeric: 'always' });
    return [['', '⋯'], ['0', rtf.format(0, 'day')],
      ...[7, 30, 90, 180].map(n => [String(n), rtfN.format(-n, 'day')]),
      ['365', rtfN.format(-1, 'year')], ['1095', rtfN.format(-3, 'year')]];
  }

  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  }

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else if (k === 'checked') e.checked = !!v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return e;
  }

  function select(options, value, onchange, cls) {
    const s = el('select', { class: cls, onchange: e => onchange(e.target.value) });
    for (const [v, label] of options) s.append(el('option', { value: v }, label));
    s.value = value;
    return s;
  }

  const iconBtn = (name, title, onclick, cls) =>
    el('button', { type: 'button', class: 'icon-btn ' + (cls || ''), title, 'aria-label': title, onclick }, icon(name, 15));

  class Builder {
    constructor(container, opts) {
      this.container = container;
      this.type = opts.type;
      this.root = opts.root || Q.newGroup('AND', [Q.newCond('keyword')]);
      this.onChange = opts.onChange || (() => {});
    }

    setType(type) {
      // 新类型不支持的字段转为原始片段，避免丢失已填写内容
      const oldType = this.type;
      (function walk(n) {
        if (n.type === 'group') return n.children.forEach(walk);
        if (!getField(type, n.field)) {
          const s = Q.isEmptyCond(n, oldType) ? '' : Q.condToString(Object.assign({}, n, { not: false }), oldType);
          Object.assign(n, { field: '__raw', value: s, op: '=', value2: '', exact: false });
        }
      })(this.root);
      this.type = type;
      this.render();
    }

    setRoot(root) {
      this.root = root;
      this.render();
    }

    changed() { this.onChange(this.root); }

    structural() { this.render(); this.changed(); }

    render() {
      this.container.replaceChildren(this.renderGroup(this.root, null, 0));
    }

    renderGroup(g, parent, depth) {
      const isRoot = !parent;
      const op = g.op.toLowerCase();

      const logic = el('button', {
        type: 'button', class: 'logic ' + op, title: t('b.toggleLogic'),
        onclick: () => { g.op = g.op === 'AND' ? 'OR' : 'AND'; this.structural(); },
      }, el('b', null, g.op), el('span', null, g.op === 'AND' ? t('b.all') : t('b.any')));

      const neg = el('button', {
        type: 'button', class: 'neg' + (g.not ? ' on' : ''), title: t('b.negGroup'),
        onclick: () => { g.not = !g.not; this.structural(); },
      }, 'NOT');

      const bar = el('div', { class: 'group-bar' }, logic, neg, el('span', { class: 'grow' }),
        !isRoot && iconBtn('copy', t('b.copyGroup'), () => { parent.children.splice(parent.children.indexOf(g) + 1, 0, Q.clone(g)); this.structural(); }),
        !isRoot && iconBtn('trash', t('b.delGroup'), () => { parent.children.splice(parent.children.indexOf(g), 1); this.structural(); }, 'danger'));

      const items = el('div', { class: 'group-items' });
      g.children.forEach((ch, i) => {
        if (i > 0) items.append(el('div', { class: 'joiner' }, el('span', null, g.op)));
        items.append(ch.type === 'group' ? this.renderGroup(ch, g, depth + 1) : this.renderCond(ch, g));
      });

      const adders = el('div', { class: 'adders' },
        el('button', { type: 'button', class: 'add', onclick: () => { g.children.push(Q.newCond('keyword')); this.structural(); } }, icon('plus', 14), t('b.addCond')),
        el('button', { type: 'button', class: 'add', onclick: () => { g.children.push(Q.newGroup(g.op === 'AND' ? 'OR' : 'AND', [Q.newCond('keyword')])); this.structural(); } }, icon('layers', 14), t('b.addGroup')));

      return el('div', { class: 'group ' + op + (isRoot ? ' root' : '') + (g.not ? ' negated' : '') },
        bar, g.children.length ? items : null, adders);
    }

    renderCond(c, parent) {
      const type = this.type;
      const fields = TYPES[type].fields;
      const f = getField(type, c.field) || getField(type, '__raw');

      // 字段选择：译名 + 等宽的语法关键字分开排版，弹出可搜索的毛玻璃列表
      const parts = fieldParts(type, f);
      const fieldSel = el('button', {
        type: 'button', class: 'field-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'data-cid': c.id,
        title: parts.name + (parts.qual ? '  ' + parts.qual : ''),
        onclick: e => global.GHS.picker.open(e.currentTarget, {
          items: fields.map(x => { const p = fieldParts(type, x); return { value: x.key, label: p.name, hint: p.qual, tag: p.tag }; }),
          value: f.key, search: true, placeholder: t('b.findField'),
          onSelect: v => {
            const nf = getField(type, v);
            Object.assign(c, { field: v, op: '=', value: nf.kind === 'multi' ? [] : (nf.kind === 'enum' ? nf.options[0] : ''), value2: '', exact: false });
            this.structural();
            const again = this.container.querySelector('[data-cid="' + c.id + '"]');
            if (again) again.focus({ preventScroll: true });
          },
        }),
        onkeydown: e => { if (e.key === 'ArrowDown') { e.preventDefault(); e.currentTarget.click(); } },
      }, el('span', { class: 'fl' }, parts.name), parts.qual ? el('span', { class: 'fk' }, parts.qual) : null, icon('chevron', 14));

      const neg = el('button', {
        type: 'button', class: 'neg sm' + (c.not ? ' on' : ''), title: t('b.negCond'),
        onclick: () => { c.not = !c.not; this.structural(); },
      }, 'NOT');

      return el('div', { class: 'cond' + (c.not ? ' negated' : ''), title: f.help ? t(f.help) : null },
        neg, fieldSel, this.renderEditor(c, f),
        el('div', { class: 'cond-actions' },
          iconBtn('copy', t('b.copyCond'), () => { parent.children.splice(parent.children.indexOf(c) + 1, 0, Q.clone(c)); this.structural(); }),
          iconBtn('x', t('b.delCond'), () => { parent.children.splice(parent.children.indexOf(c), 1); this.structural(); }, 'danger')));
    }

    renderEditor(c, f) {
      const type = this.type;
      const upd = (k) => (e) => { c[k] = e.target.value; this.changed(); };
      const ph = f.ph ? t(f.ph) : (f.placeholder || '');
      const wrap = el('div', { class: 'editor' });

      switch (f.kind) {
        case 'keyword':
          wrap.append(
            el('input', { type: 'text', class: 'val', value: c.value, placeholder: ph, oninput: upd('value') }),
            el('button', {
              type: 'button', class: 'toggle-pill' + (c.exact ? ' on' : ''), title: t('b.exact'),
              onclick: e => { c.exact = !c.exact; e.currentTarget.classList.toggle('on', c.exact); this.changed(); },
            }, '" "'));
          break;

        case 'raw':
          wrap.append(el('input', { type: 'text', class: 'val mono', value: c.value, placeholder: ph, oninput: upd('value') }));
          break;

        case 'enum':
          if (!f.options.includes(c.value)) c.value = f.options[0];
          wrap.append(select(f.options.map(v => [v, optionLabel(type, f, v)]), c.value, v => { c.value = v; this.changed(); }, 'val'));
          break;

        case 'multi': {
          if (!Array.isArray(c.value)) c.value = [];
          const box = el('div', { class: 'pills' });
          for (const v of f.options) {
            box.append(el('button', {
              type: 'button', class: 'toggle-pill' + (c.value.includes(v) ? ' on' : ''),
              onclick: e => {
                const set = new Set(c.value);
                set.has(v) ? set.delete(v) : set.add(v);
                c.value = f.options.filter(x => set.has(x));
                e.currentTarget.classList.toggle('on', set.has(v));
                this.changed();
              },
            }, optionLabel(type, f, v, true)));
          }
          // 当前类型不支持的取值（切换类型或粘贴语法带来的），标红并允许点击移除
          for (const v of c.value.filter(x => !f.options.includes(x))) {
            box.append(el('button', {
              type: 'button', class: 'toggle-pill invalid', title: t('b.invalid'),
              onclick: () => { c.value = c.value.filter(x => x !== v); this.structural(); },
            }, v, icon('x', 12)));
          }
          wrap.append(box);
          break;
        }

        case 'number':
        case 'date': {
          const isDate = f.kind === 'date';
          const mkInput = (k) => {
            const inp = el('input', { type: 'text', class: 'val short' + (isDate ? ' date' : ''), value: c[k], placeholder: isDate ? 'YYYY-MM-DD' : '0', inputmode: isDate ? null : 'numeric', oninput: upd(k) });
            if (!isDate) return inp;
            const preset = select(datePresets(), '', v => {
              if (!v) return;
              c[k] = daysAgo(parseInt(v, 10));
              inp.value = c[k];
              preset.value = '';
              this.changed();
            }, 'preset');
            preset.title = t('b.presets');
            return el('span', { class: 'date-wrap' }, inp, preset);
          };
          wrap.append(select(rangeOps(), c.op, v => { c.op = v; this.structural(); }, 'op'));
          wrap.append(mkInput('value'));
          if (c.op === '..') wrap.append(el('span', { class: 'range-sep' }, '→'), mkInput('value2'));
          break;
        }

        default: { // text
          const listId = f.suggest ? 'dl-' + f.key : null;
          wrap.append(el('input', { type: 'text', class: 'val', value: c.value, placeholder: ph, list: listId, oninput: upd('value') }));
          if (listId && !document.getElementById(listId)) {
            document.body.append(el('datalist', { id: listId }, f.suggest.map(s => el('option', { value: s }))));
          }
        }
      }
      return wrap;
    }
  }

  global.GHS.Builder = Builder;
  global.GHS.el = el;
})(window);
