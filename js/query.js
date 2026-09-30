/*
 * 查询表达式树：构建、规范化、序列化、解析、析取范式展开。
 *
 * 节点结构：
 *   group: { type: 'group', id, op: 'AND' | 'OR', not: bool, children: [] }
 *   cond:  { type: 'cond',  id, field, op, value, value2, exact, not: bool }
 *
 * 取反在规范化阶段按德摩根律下推到叶子，输出时只使用 GitHub 兼容性最好的
 * `-qualifier:value` 与 `NOT keyword` 两种取反形式。
 */
(function (global) {
  'use strict';

  const { TYPES, getField } = global.GHS.schema;
  const t = (k, p) => global.GHS.t(k, p);

  let seq = 0;
  const uid = () => 'n' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

  function newCond(field, extra) {
    return Object.assign({ type: 'cond', id: uid(), field: field || 'keyword', op: '=', value: '', value2: '', exact: false, not: false }, extra || {});
  }

  function newGroup(op, children) {
    return { type: 'group', id: uid(), op: op || 'AND', not: false, children: children || [] };
  }

  function clone(node) {
    const copy = JSON.parse(JSON.stringify(node));
    (function reid(n) { n.id = uid(); if (n.children) n.children.forEach(reid); })(copy);
    return copy;
  }

  /* ---------- 值处理 ---------- */

  const needsQuote = v => /[\s"():]/.test(v) || v === '';

  function quote(v) {
    v = String(v);
    if (/^".*"$/.test(v)) return v;
    return needsQuote(v) ? '"' + v.replace(/"/g, '') + '"' : v;
  }

  function unquote(v) {
    return /^".*"$/.test(v) ? v.slice(1, -1) : v;
  }

  function isEmptyCond(c, type) {
    const f = getField(type, c.field);
    if (!f) return !String(c.value || '').trim();
    if (f.kind === 'multi') return !Array.isArray(c.value) || c.value.length === 0;
    if ((f.kind === 'number' || f.kind === 'date') && c.op === '..') {
      return !String(c.value || '').trim() && !String(c.value2 || '').trim();
    }
    return !String(c.value || '').trim();
  }

  /* 单个条件 → 片段字符串（neg 为最终是否取反） */
  function condToString(c, type) {
    const f = getField(type, c.field);
    const neg = !!c.not;
    const val = typeof c.value === 'string' ? c.value.trim() : c.value;

    if (!f || f.kind === 'raw') {
      if (!neg) return val;
      if (/^[a-zA-Z][\w-]*:\S+$/.test(val)) return '-' + val;
      return /\s/.test(val) ? 'NOT (' + val + ')' : 'NOT ' + val;
    }

    if (f.kind === 'keyword') {
      const text = c.exact ? '"' + val.replace(/"/g, '') + '"' : val;
      return neg ? 'NOT ' + text : text;
    }

    let body;
    if (f.kind === 'multi') {
      body = c.value.join(',');
    } else if (f.kind === 'number' || f.kind === 'date') {
      const a = String(c.value || '').trim();
      const b = String(c.value2 || '').trim();
      switch (c.op) {
        case '..': body = (a || '*') + '..' + (b || '*'); break;
        case '=': body = quote(a); break;
        default: body = c.op + a;
      }
    } else {
      body = quote(val);
    }
    return (neg ? '-' : '') + f.key + ':' + body;
  }

  /* ---------- 规范化 ---------- */

  /*
   * 返回新树：去掉空条件、取反下推、同类组扁平化、单子节点组折叠。
   * 非精确的多词关键字拆为 AND 组，保证取反与展开语义正确。
   */
  function normalize(node, type, neg) {
    neg = !!neg;
    if (node.type === 'cond') {
      if (isEmptyCond(node, type)) return null;
      const f = getField(type, node.field);
      if (f && f.kind === 'keyword' && !node.exact) {
        const words = node.value.trim().split(/\s+/);
        if (words.length > 1) {
          const g = newGroup('AND', words.map(w => newCond('keyword', { value: w })));
          return normalize(g, type, neg !== !!node.not);
        }
      }
      return Object.assign({}, node, { not: neg !== !!node.not });
    }

    const effNeg = neg !== !!node.not;
    const op = effNeg ? (node.op === 'AND' ? 'OR' : 'AND') : node.op;
    const kids = [];
    for (const ch of node.children) {
      const n = normalize(ch, type, effNeg);
      if (!n) continue;
      if (n.type === 'group' && n.op === op) kids.push(...n.children);
      else kids.push(n);
    }
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    return { type: 'group', id: node.id, op, not: false, children: kids };
  }

  function serializeNorm(n, type, nested) {
    if (!n) return '';
    if (n.type === 'cond') return condToString(n, type);
    const parts = n.children.map(ch => serializeNorm(ch, type, true));
    const s = parts.join(n.op === 'OR' ? ' OR ' : ' ');
    return nested ? '(' + s + ')' : s;
  }

  /* 在查询中补上 is:issue / is:pr（议题与 PR 共用同一 API，需要显式区分） */
  function withForcedIs(q, type, topIsOr) {
    const force = TYPES[type].forceIs;
    if (!force) return q;
    if (/(^|[\s(])-?(is:(issue|pr|pull-request)|type:(issue|pr))\b/i.test(q)) return q;
    const qualifier = 'is:' + force;
    if (!q) return qualifier;
    return topIsOr ? qualifier + ' (' + q + ')' : q + ' ' + qualifier;
  }

  /*
   * in: 是全局限定符（决定整条查询中关键字的匹配范围），GitHub 不接受它出现在 OR 分组内，
   * 否则整条查询返回 0 条。这里把所有 in: 条件摘出、取并集，统一放到最外层。
   * 取反的 in: 没有意义，直接丢弃。
   */
  function hoistIn(norm, type) {
    const vals = new Set();
    function strip(n) {
      if (!n) return null;
      if (n.type === 'cond') {
        if (n.field !== 'in') return n;
        if (!n.not) n.value.forEach(v => vals.add(v));
        return null;
      }
      const kids = [];
      for (const ch of n.children) {
        const s = strip(ch);
        if (!s) continue;
        if (s.type === 'group' && s.op === n.op) kids.push(...s.children);
        else kids.push(s);
      }
      if (kids.length === 0) return null;
      if (kids.length === 1) return kids[0];
      return Object.assign({}, n, { children: kids });
    }
    const tree = strip(norm);
    const f = getField(type, 'in');
    const order = f ? f.options : [];
    const rank = v => { const i = order.indexOf(v); return i === -1 ? order.length : i; };
    const ins = [...vals].sort((a, b) => rank(a) - rank(b));
    return { tree, inStr: ins.length ? 'in:' + ins.join(',') : '' };
  }

  /*
   * 旧版搜索引擎（仓库/用户/提交）只在关键字之间支持 OR，限定符之间的 OR 会让整条查询返回 0 条。
   * 但部分限定符“重复出现即为 OR”（如仓库搜索的 language:，实测 language:go language:rust = 两者之和），
   * 对这类字段，把“同一字段、全部正向、且该字段只出现在这一组里”的 OR 组改写成重复限定符。
   */
  function collapseRepeat(norm, type) {
    const rep = TYPES[type].repeatOr;
    if (!rep || !norm) return norm;
    const count = {};
    (function tally(n) {
      if (n.type === 'cond') count[n.field] = (count[n.field] || 0) + 1;
      else n.children.forEach(tally);
    })(norm);
    return (function walk(n) {
      if (n.type === 'cond') return n;
      const kids = n.children.map(walk);
      const f = kids[0].field;
      if (n.op === 'OR' && rep.includes(f) && count[f] === kids.length &&
          kids.every(k => k.type === 'cond' && !k.not && k.field === f)) {
        return { type: 'group', id: n.id, op: 'AND', not: false, children: kids };
      }
      const flat = [];
      for (const k of kids) {
        if (k.type === 'group' && k.op === n.op) flat.push(...k.children);
        else flat.push(k);
      }
      return Object.assign({}, n, { children: flat });
    })(norm);
  }

  /* 规范化 → 合并重复限定符 → 提升 in: */
  function prepare(root, type) {
    return hoistIn(collapseRepeat(normalize(root, type, false), type), type);
  }

  /*
   * 该查询在 GitHub 上是否无法用一条查询正确表达（仅对 schema 中 qualOr: false 的旧版引擎类型）。
   * 2026-09 对仓库搜索 API 实测：
   *   - 限定符之间的 OR：(topic:llm OR topic:ai-agent) … → 0 条；topic:llm OR topic:ai-agent → 校验报错
   *   - OR 与 in: 同用：(llm OR agent) in:name / in:topics → 0 条；(a b OR a_b) in:name,description,readme 结果虚高
   *   - 仅关键字之间的 OR、且没有 in:：(llm OR agent) created:… stars:… → 正常
   * 因此：改写后若仍有含限定符的 OR 组，或有 OR 且带 in:，就需要拆成子查询。
   */
  function needsSplit(root, type) {
    if (TYPES[type].qualOr !== false) return false;
    const { tree, inStr } = prepare(root, type);
    const isQual = c => c.field !== 'keyword' && !(c.field === '__raw' && !/[\w-]+:/.test(c.value));
    const leaves = n => (n.type === 'cond' ? [n] : n.children.flatMap(leaves));
    let hasOr = false;
    const bad = (function walk(n) {
      if (!n || n.type === 'cond') return false;
      if (n.op === 'OR') {
        hasOr = true;
        if (leaves(n).some(isQual)) return true;
      }
      return n.children.some(walk);
    })(tree);
    return bad || (hasOr && !!inStr);
  }

  function toQueryString(root, type) {
    const { tree, inStr } = prepare(root, type);
    const topIsOr = !!tree && tree.type === 'group' && tree.op === 'OR';
    const body = serializeNorm(tree, type, false);
    const s = withForcedIs(body, type, topIsOr);
    if (!inStr) return s;
    // 顶层为 OR 时加括号，避免 in: 看起来只挂在最后一个分支上；补 is: 时已经加过括号
    const wrap = topIsOr && s === body;
    return (s ? (wrap ? '(' + s + ')' : s) + ' ' : '') + inStr;
  }

  /* 诊断：给出与 GitHub 语义相关、但不影响生成的提示 */
  function diagnose(root, type) {
    const out = [];
    const f = getField(type, 'in');
    const ok = f ? f.options : [];
    const bad = new Set();
    let used = false;
    (function walk(n) {
      if (!n) return;
      if (n.type === 'group') return n.children.forEach(walk);
      if (n.field !== 'in') return;
      used = true;
      (n.value || []).forEach(v => { if (!ok.includes(v)) bad.add(v); });
    })(normalize(root, type, false));
    if (bad.size) out.push(t('w.badIn', { v: [...bad].join(','), opts: ok.join(', ') || '-' }));
    if (type === 'code' && used && !bad.size) out.push(t('w.codeIn'));
    return out;
  }

  /* ---------- 析取范式（OR 展开） ---------- */

  function dnf(n, limit) {
    if (!n) return [[]];
    if (n.type === 'cond') return [[n]];
    if (n.op === 'OR') {
      const out = [];
      for (const ch of n.children) {
        out.push(...dnf(ch, limit));
        if (out.length > limit) throw new Error(t('w.branches', { n: limit }));
      }
      return out;
    }
    let acc = [[]];
    for (const ch of n.children) {
      const sub = dnf(ch, limit);
      const next = [];
      for (const a of acc) for (const b of sub) next.push(a.concat(b));
      if (next.length > limit) throw new Error(t('w.branches', { n: limit }));
      acc = next;
    }
    return acc;
  }

  /* 返回展开后的每个分支查询串（仅含 AND 连接的扁平条件） */
  function toBranches(root, type, limit) {
    const { tree, inStr } = prepare(root, type);
    const branches = dnf(tree, limit || 16);
    const seen = new Set();
    const out = [];
    for (const conj of branches) {
      const q = (withForcedIs(conj.map(c => condToString(c, type)).join(' '), type) + ' ' + inStr).trim();
      if (!seen.has(q)) { seen.add(q); out.push(q); }
    }
    return out;
  }

  /* ---------- 解析 ---------- */

  function tokenize(str) {
    const toks = [];
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '(' || ch === ')') { toks.push({ t: ch }); i++; continue; }
      let j = i;
      let text = '';
      while (j < str.length && !/[\s()]/.test(str[j])) {
        if (str[j] === '"') {
          const end = str.indexOf('"', j + 1);
          const stop = end === -1 ? str.length : end + 1;
          text += str.slice(j, stop);
          j = stop;
        } else {
          text += str[j++];
        }
      }
      i = j;
      if (text === 'AND' || text === 'OR' || text === 'NOT') toks.push({ t: text });
      else toks.push({ t: 'TERM', v: text });
    }
    return toks;
  }

  function parseRangeValue(v) {
    let m;
    if ((m = /^(.*)\.\.(.*)$/.exec(v))) {
      const a = m[1] === '*' ? '' : m[1];
      const b = m[2] === '*' ? '' : m[2];
      if (a && !b) return { op: '>=', value: a, value2: '' };
      if (!a && b) return { op: '<=', value: b, value2: '' };
      return { op: '..', value: a, value2: b };
    }
    if ((m = /^(>=|<=|>|<)(.*)$/.exec(v))) return { op: m[1], value: m[2], value2: '' };
    return { op: '=', value: v, value2: '' };
  }

  function termToCond(text, type) {
    let neg = false;
    let body = text;
    const m = /^(-?)([a-zA-Z][\w-]*):(.+)$/.exec(text);
    if (m) {
      const f = getField(type, m[2].toLowerCase());
      if (!f || f.kind === 'keyword' || f.kind === 'raw') return newCond('__raw', { value: text });
      neg = m[1] === '-';
      const v = unquote(m[3]);
      if (f.kind === 'multi') return newCond(f.key, { value: v.split(',').filter(Boolean), not: neg });
      if (f.kind === 'number' || f.kind === 'date') return newCond(f.key, Object.assign(parseRangeValue(v), { not: neg }));
      return newCond(f.key, { value: v, not: neg });
    }
    if (body.length > 1 && body[0] === '-') { neg = true; body = body.slice(1); }
    const exact = /^".*"$/.test(body);
    return newCond('keyword', { value: unquote(body), exact, not: neg });
  }

  function parse(str, type) {
    const toks = tokenize(str || '');
    let p = 0;
    const peek = () => toks[p];

    function parseOr() {
      const items = [parseAnd()];
      while (peek() && peek().t === 'OR') { p++; items.push(parseAnd()); }
      const kept = items.filter(Boolean);
      if (kept.length === 0) return null;
      return kept.length === 1 ? kept[0] : newGroup('OR', kept);
    }

    function parseAnd() {
      const items = [];
      while (peek() && peek().t !== ')' && peek().t !== 'OR') {
        if (peek().t === 'AND') { p++; continue; }
        const n = parseUnary();
        if (n) items.push(n);
      }
      if (items.length === 0) return null;
      return items.length === 1 ? items[0] : newGroup('AND', items);
    }

    function parseUnary() {
      if (peek() && peek().t === 'NOT') {
        p++;
        const n = parseUnary();
        if (n) n.not = !n.not;
        return n;
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const tk = peek();
      if (!tk) return null;
      if (tk.t === '(') {
        p++;
        const n = parseOr();
        if (peek() && peek().t === ')') p++;
        return n;
      }
      p++;
      if (tk.t === 'TERM') return termToCond(tk.v, type);
      return null;
    }

    const parts = [];
    while (p < toks.length) {
      const n = parseOr();
      if (n) parts.push(n);
      if (peek() && peek().t === ')') p++; // 忽略多余的右括号
    }
    let root;
    if (parts.length === 0) root = newGroup('AND', []);
    else if (parts.length === 1) root = parts[0];
    else root = newGroup('AND', parts);
    if (root.type === 'cond') root = newGroup('AND', [root]);
    return root;
  }

  /* API 限制检查：长度 256、AND/OR/NOT 运算符不超过 5 个 */
  function lint(q) {
    const warns = [];
    if (q.length > 256) warns.push(t('w.len', { n: q.length }));
    const ops = (q.match(/(^|\s)(AND|OR|NOT)(?=\s)/g) || []).length;
    if (ops > 5) warns.push(t('w.ops', { n: ops }));
    return warns;
  }

  global.GHS.query = { newCond, newGroup, clone, normalize, toQueryString, toBranches, needsSplit, parse, lint, diagnose, condToString, isEmptyCond };
})(window);
