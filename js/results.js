/*
 * 查询结果：分批加载（多分支合并去重）、本地过滤、本地排序、分页展示与导出。
 * 过滤项与排序项的 label 均为 i18n key，渲染时取文案。
 */
(function (global) {
  'use strict';

  const el = global.GHS.el;
  const icon = global.GHS.icon;
  const api = global.GHS.api;
  const t = (k, p) => global.GHS.t(k, p);
  const L = () => global.GHS.i18n.lang;

  /* ---------- 工具 ---------- */

  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
    C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', PHP: '#4F5D95', Ruby: '#701516', Kotlin: '#A97BFF', Swift: '#F05138',
    Dart: '#00B4AB', Scala: '#c22d40', Shell: '#89e051', PowerShell: '#012456', Lua: '#000080', R: '#198CE7',
    Julia: '#a270ba', Haskell: '#5e5086', Elixir: '#6e4a7e', Erlang: '#B83998', Clojure: '#db5855', 'Objective-C': '#438eff',
    Vue: '#41b883', Svelte: '#ff3e00', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', 'Jupyter Notebook': '#DA5B0B',
    Dockerfile: '#384d54', Makefile: '#427819', Nix: '#7e7eff', Zig: '#ec915c', Perl: '#0298c3', MATLAB: '#e16737',
    Groovy: '#4298b8', Assembly: '#6E4C13', Solidity: '#AA6746', WebAssembly: '#04133b', MDX: '#fcb32c', Astro: '#ff5a03',
  };
  const langColor = l => LANG_COLORS[l] || '#8b949e';
  const NONE = '—';

  const fmtNum = n => n == null ? '-' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  const fmtInt = n => Number(n || 0).toLocaleString(L());
  const fmtDate = s => s ? s.slice(0, 10) : '-';
  const fmtTime = sec => new Date(sec * 1000).toLocaleTimeString(L());

  function relTime(s) {
    if (!s) return '-';
    const rtf = new Intl.RelativeTimeFormat(L(), { numeric: 'auto' });
    const d = (new Date(s).getTime() - Date.now()) / 1000;
    const a = Math.abs(d);
    if (a < 3600) return rtf.format(Math.round(d / 60) || -1, 'minute');
    if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(d / 86400), 'day');
    if (a < 86400 * 365) return rtf.format(Math.round(d / 86400 / 30), 'month');
    return rtf.format(Math.round(d / 86400 / 365), 'year');
  }

  const repoOfUrl = u => (u || '').replace('https://api.github.com/repos/', '');
  const link = (href, kids, cls) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, kids);
  const badge = (text, cls) => el('span', { class: 'badge ' + (cls || '') }, text);
  const stat = (ic, text, title) => el('span', { class: 'stat', title }, icon(ic, 14), text);
  const stats = (...parts) => el('div', { class: 'stats' }, parts.filter(Boolean));
  const langStat = l => l ? el('span', { class: 'stat' }, el('i', { class: 'dot', style: '--c:' + langColor(l) }), l) : null;

  function labelChip(l) {
    return el('span', { class: 'label', style: '--lc:#' + (l.color || '888') }, l.name);
  }

  /*
   * 文本过滤表达式：空格分隔为 AND，a|b 为 OR，-a 为排除，"a b" 为短语。
   */
  function makeTextMatcher(expr) {
    const terms = (expr.match(/-?"[^"]*"|\S+/g) || []).map(tk => {
      const neg = tk.startsWith('-') && tk.length > 1;
      const body = (neg ? tk.slice(1) : tk).replace(/"/g, '').toLowerCase();
      return { neg, any: body.split('|').filter(Boolean) };
    }).filter(x => x.any.length);
    if (!terms.length) return null;
    return text => {
      const s = text.toLowerCase();
      return terms.every(x => x.neg ? !x.any.some(a => s.includes(a)) : x.any.some(a => s.includes(a)));
    };
  }

  /* ---------- 各类型视图定义 ---------- */

  const issueView = {
    key: it => it.id,
    text: it => [it.title, it.body || '', repoOfUrl(it.repository_url), it.user && it.user.login, (it.labels || []).map(l => l.name).join(' ')].join(' '),
    state: it => it.pull_request && it.pull_request.merged_at ? 'merged' : it.state,
    render(it) {
      const st = this.state(it);
      const isPr = !!it.pull_request;
      const ic = st === 'merged' ? 'merge' : isPr ? 'pr' : st === 'closed' ? 'issueClosed' : 'issue';
      const repo = repoOfUrl(it.repository_url);
      return el('article', { class: 'item issue' },
        el('div', { class: 'state-ic st-' + st, title: st }, icon(ic, 18)),
        el('div', { class: 'item-main' },
          el('div', { class: 'item-head' },
            link(it.html_url, it.title, 'title'),
            it.draft && badge('draft', 'muted'),
            (it.labels || []).map(labelChip)),
          stats(
            link('https://github.com/' + repo, repo, 'repo-link'),
            el('span', { class: 'stat' }, '#' + it.number),
            it.user && el('span', { class: 'stat' }, el('img', { class: 'avatar xs', src: it.user.avatar_url + '&s=32', alt: '', loading: 'lazy' }), it.user.login),
            stat('clock', relTime(it.updated_at), t('r.updCreated', { a: fmtDate(it.updated_at), b: fmtDate(it.created_at) })))),
        el('div', { class: 'item-side' },
          it.comments ? stat('message', it.comments, t('r.comments')) : null,
          it.reactions && it.reactions.total_count ? el('span', { class: 'stat', title: t('r.reactions') }, '♥ ' + it.reactions.total_count) : null));
    },
    filters: [
      { key: 'state', label: 'rf.state', kind: 'select', get: it => issueView.state(it) },
      { key: 'repo', label: 'rf.repo', kind: 'select', get: it => repoOfUrl(it.repository_url) },
      { key: 'author', label: 'rf.author', kind: 'select', get: it => it.user && it.user.login },
      { key: 'label', label: 'rf.label', kind: 'text', get: it => (it.labels || []).map(l => l.name).join(' ') },
      { key: 'cmin', label: 'rf.cmin', kind: 'min', get: it => it.comments },
      { key: 'upd', label: 'rf.upd', kind: 'dateMin', get: it => it.updated_at },
    ],
    sorts: [
      ['comments', 'rs.comments', (a, b) => b.comments - a.comments],
      ['reactions', 'rs.reactions', (a, b) => ((b.reactions || {}).total_count || 0) - ((a.reactions || {}).total_count || 0)],
      ['created', 'rs.created', (a, b) => b.created_at.localeCompare(a.created_at)],
      ['updated', 'rs.updated', (a, b) => b.updated_at.localeCompare(a.updated_at)],
    ],
    csv: [['title', it => it.title], ['url', it => it.html_url], ['repo', it => repoOfUrl(it.repository_url)], ['number', it => it.number],
      ['state', it => issueView.state(it)], ['author', it => it.user && it.user.login], ['comments', it => it.comments],
      ['labels', it => (it.labels || []).map(l => l.name).join(';')], ['created_at', it => it.created_at], ['updated_at', it => it.updated_at]],
  };

  const VIEWS = {
    repositories: {
      key: it => it.id,
      text: it => [it.full_name, it.description || '', (it.topics || []).join(' '), it.language || ''].join(' '),
      render(it) {
        const [owner, name] = it.full_name.split('/');
        return el('article', { class: 'item repo' },
          el('img', { class: 'avatar', src: it.owner.avatar_url + '&s=80', alt: '', loading: 'lazy' }),
          el('div', { class: 'item-main' },
            el('div', { class: 'item-head' },
              link(it.html_url, [el('span', { class: 'owner' }, owner + ' / '), el('span', null, name)], 'title'),
              it.archived && badge('archived', 'warn'), it.fork && badge('fork', 'muted'),
              it.is_template && badge('template', 'muted'), it.private && badge('private', 'muted')),
            it.description ? el('p', { class: 'desc' }, it.description) : null,
            (it.topics || []).length ? el('div', { class: 'chips' }, it.topics.slice(0, 8).map(x => el('span', { class: 'topic' }, x)), it.topics.length > 8 ? el('span', { class: 'topic more' }, '+' + (it.topics.length - 8)) : null) : null,
            stats(
              langStat(it.language),
              stat('fork', fmtNum(it.forks_count), fmtInt(it.forks_count) + ' forks'),
              stat('issue', fmtNum(it.open_issues_count), 'open issues'),
              it.license && it.license.spdx_id !== 'NOASSERTION' ? stat('scale', it.license.spdx_id) : null,
              stat('clock', relTime(it.pushed_at), t('r.pushedCreated', { a: fmtDate(it.pushed_at), b: fmtDate(it.created_at) })),
              it.homepage ? link(it.homepage, [icon('link', 14), t('r.homepage')], 'stat') : null)),
          el('div', { class: 'item-side star-box', title: fmtInt(it.stargazers_count) + ' stars' },
            icon('star', 16), el('b', null, fmtNum(it.stargazers_count))));
      },
      filters: [
        { key: 'lang', label: 'rf.lang', kind: 'select', get: it => it.language || NONE },
        { key: 'license', label: 'rf.license', kind: 'select', get: it => it.license ? it.license.spdx_id : NONE },
        { key: 'owner', label: 'rf.owner', kind: 'select', get: it => it.owner.login },
        { key: 'smin', label: 'rf.smin', kind: 'min', get: it => it.stargazers_count },
        { key: 'smax', label: 'rf.smax', kind: 'max', get: it => it.stargazers_count },
        { key: 'fmin', label: 'rf.fmin', kind: 'min', get: it => it.forks_count },
        { key: 'pushed', label: 'rf.pushed', kind: 'dateMin', get: it => it.pushed_at },
        { key: 'noarch', label: 'rf.noarch', kind: 'bool', pred: it => !it.archived },
        { key: 'nofork', label: 'rf.nofork', kind: 'bool', pred: it => !it.fork },
      ],
      sorts: [
        ['stars', 'rs.stars', (a, b) => b.stargazers_count - a.stargazers_count],
        ['forks', 'rs.forks', (a, b) => b.forks_count - a.forks_count],
        ['pushed', 'rs.pushed', (a, b) => (b.pushed_at || '').localeCompare(a.pushed_at || '')],
        ['created', 'rs.created', (a, b) => (b.created_at || '').localeCompare(a.created_at || '')],
        ['issues', 'rs.issues', (a, b) => b.open_issues_count - a.open_issues_count],
        ['name', 'rs.name', (a, b) => a.full_name.localeCompare(b.full_name)],
      ],
      csv: [['full_name', it => it.full_name], ['url', it => it.html_url], ['description', it => it.description], ['language', it => it.language],
        ['stars', it => it.stargazers_count], ['forks', it => it.forks_count], ['open_issues', it => it.open_issues_count],
        ['license', it => it.license && it.license.spdx_id], ['topics', it => (it.topics || []).join(';')], ['archived', it => it.archived],
        ['fork', it => it.fork], ['created_at', it => it.created_at], ['pushed_at', it => it.pushed_at]],
    },

    issues: issueView,
    pullrequests: issueView,

    users: {
      grid: true,
      key: it => it.id,
      text: it => it.login,
      render(it) {
        const isOrg = it.type === 'Organization';
        return link(it.html_url, [
          el('img', { class: 'avatar xl', src: it.avatar_url + '&s=128', alt: '', loading: 'lazy' }),
          el('b', { class: 'login' }, it.login),
          badge(isOrg ? t('r.org') : t('r.user'), isOrg ? 'org' : 'muted'),
        ], 'item user-card');
      },
      filters: [{ key: 'utype', label: 'rf.utype', kind: 'select', get: it => it.type }],
      sorts: [['login', 'rs.login', (a, b) => a.login.localeCompare(b.login)]],
      csv: [['login', it => it.login], ['type', it => it.type], ['url', it => it.html_url]],
    },

    code: {
      key: it => it.repository.full_name + '/' + it.path + '@' + it.sha,
      text: it => it.repository.full_name + ' ' + it.path,
      render(it) {
        const dir = it.path.slice(0, it.path.length - it.name.length);
        return el('article', { class: 'item' },
          el('div', { class: 'state-ic' }, icon('code', 18)),
          el('div', { class: 'item-main' },
            link(it.html_url, [el('span', { class: 'owner' }, dir), it.name], 'title mono'),
            stats(link(it.repository.html_url, it.repository.full_name, 'repo-link'))));
      },
      filters: [
        { key: 'repo', label: 'rf.repo', kind: 'select', get: it => it.repository.full_name },
        { key: 'ext', label: 'rf.ext', kind: 'select', get: it => (/\.([^./]+)$/.exec(it.name) || [, NONE])[1] },
      ],
      sorts: [['repo', 'rs.repo', (a, b) => a.repository.full_name.localeCompare(b.repository.full_name)],
        ['path', 'rs.path', (a, b) => a.path.localeCompare(b.path)]],
      csv: [['repo', it => it.repository.full_name], ['path', it => it.path], ['url', it => it.html_url], ['sha', it => it.sha]],
    },

    commits: {
      key: it => it.sha,
      text: it => it.commit.message + ' ' + it.repository.full_name + ' ' + (it.commit.author || {}).name,
      render(it) {
        const msg = it.commit.message.split('\n')[0];
        const au = it.commit.author || {};
        return el('article', { class: 'item' },
          el('div', { class: 'state-ic' }, icon('commit', 18)),
          el('div', { class: 'item-main' },
            link(it.html_url, msg, 'title'),
            stats(link(it.repository.html_url, it.repository.full_name, 'repo-link'),
              el('span', { class: 'stat' }, au.name), stat('clock', relTime(au.date), fmtDate(au.date)))),
          el('div', { class: 'item-side' }, el('code', { class: 'sha' }, it.sha.slice(0, 7))));
      },
      filters: [
        { key: 'repo', label: 'rf.repo', kind: 'select', get: it => it.repository.full_name },
        { key: 'author', label: 'rf.author', kind: 'select', get: it => (it.commit.author || {}).name },
        { key: 'date', label: 'rf.date', kind: 'dateMin', get: it => (it.commit.author || {}).date },
      ],
      sorts: [['date', 'rs.date', (a, b) => ((b.commit.author || {}).date || '').localeCompare((a.commit.author || {}).date || '')]],
      csv: [['sha', it => it.sha], ['message', it => it.commit.message.split('\n')[0]], ['repo', it => it.repository.full_name],
        ['author', it => (it.commit.author || {}).name], ['date', it => (it.commit.author || {}).date], ['url', it => it.html_url]],
    },
  };

  /* ---------- 结果存储：多分支轮询分页、去重合并 ---------- */

  class ResultStore {
    constructor({ type, endpoint, branches, sort, order, token }) {
      Object.assign(this, { type, endpoint, sort, order, token });
      this.view = VIEWS[type];
      this.perPage = 100;
      this.branches = branches.map(q => ({ q, page: 0, total: null, done: false, incomplete: false, error: null }));
      this.items = [];
      this.keys = new Set();
      this.rate = null;
    }

    get done() { return this.branches.every(b => b.done); }
    get multi() { return this.branches.length > 1; }
    get totalUpper() { return this.branches.reduce((s, b) => s + (b.total || 0), 0); }

    async loadNext(signal) {
      const pending = this.branches.filter(b => !b.done);
      if (!pending.length) return false;
      const b = pending.reduce((m, x) => x.page < m.page ? x : m);
      try {
        const r = await api.search({ endpoint: this.endpoint, q: b.q, sort: this.sort, order: this.order, page: b.page + 1, perPage: this.perPage, token: this.token, signal });
        this.rate = r.rate;
        b.page++;
        b.total = r.total;
        b.incomplete = b.incomplete || r.incomplete;
        for (const it of r.items) {
          const k = this.view.key(it);
          if (this.keys.has(k)) continue;
          this.keys.add(k);
          it.__seq = this.items.length;
          this.items.push(it);
        }
        const cap = Math.min(r.total, api.MAX_RESULTS);
        if (r.items.length < this.perPage || b.page * this.perPage >= cap) b.done = true;
      } catch (e) {
        if (e.name !== 'AbortError') { b.error = e.message; if (e.rate) this.rate = e.rate; }
        throw e;
      }
      return true;
    }
  }

  /* ---------- 结果视图 ---------- */

  class ResultsView {
    constructor(root) {
      this.root = root;
      this.store = null;
      this.filters = {};
      this.sortKey = 'orig';
      this.page = 1;
      this.pageSize = 20;
      this.loading = false;
      this.abort = null;
      this.error = null;
    }

    async start(store) {
      this.stop();
      this.store = store;
      this.filters = {};
      this.sortKey = store.multi && store.view.sorts.some(s => s[0] === store.sort) ? store.sort : 'orig';
      this.page = 1;
      this.error = null;
      this.render();
      await this.load(store.branches.length);
    }

    stop() {
      if (this.abort) this.abort.abort();
      this.abort = null;
      this.loading = false;
      if (this.store) this.renderAll();
    }

    /* 连续加载 pages 页（每页 100 条）；Infinity 表示直到全部取完 */
    async load(pages) {
      if (!this.store || this.loading) return;
      this.loading = true;
      this.error = null;
      const ctl = this.abort = new AbortController();
      this.renderAll();
      try {
        for (let i = 0; i < pages && !this.store.done; i++) {
          await this.store.loadNext(ctl.signal);
          if (ctl.signal.aborted) break;
          this.renderAll();
          const rate = this.store.rate;
          if (rate && rate.remaining === 0 && !this.store.done) {
            this.error = t('r.rateOut', { time: fmtTime(rate.reset) });
            break;
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') this.error = e.message;
      } finally {
        if (this.abort === ctl) { this.abort = null; this.loading = false; }
        this.renderAll();
      }
    }

    /* 每个未取完的子查询各加载一页 */
    loadRound() {
      return this.load(this.store.branches.filter(b => !b.done).length);
    }

    filtered() {
      const s = this.store;
      if (!s) return [];
      const v = s.view;
      const preds = [];
      const tm = this.filters.__text ? makeTextMatcher(this.filters.__text) : null;
      if (tm) preds.push(it => tm(v.text(it)));
      for (const f of v.filters) {
        const val = this.filters[f.key];
        if (val == null || val === '' || val === false) continue;
        if (f.kind === 'select') preds.push(it => String(f.get(it)) === val);
        else if (f.kind === 'text') { const m = makeTextMatcher(val); if (m) preds.push(it => m(f.get(it) || '')); }
        else if (f.kind === 'min') preds.push(it => (f.get(it) || 0) >= Number(val));
        else if (f.kind === 'max') preds.push(it => (f.get(it) || 0) <= Number(val));
        else if (f.kind === 'dateMin') preds.push(it => (f.get(it) || '') >= val);
        else if (f.kind === 'bool') preds.push(f.pred);
      }
      const out = s.items.filter(it => preds.every(p => p(it)));
      const sort = v.sorts.find(x => x[0] === this.sortKey);
      return out.sort(sort ? sort[2] : (a, b) => a.__seq - b.__seq);
    }

    render() {
      this.root.replaceChildren(
        this.headEl = el('div', { class: 'res-head' }),
        this.alertEl = el('div', { class: 'res-alert' }),
        el('div', { class: 'res-body' },
          this.filterEl = el('aside', { class: 'res-side' }),
          el('div', { class: 'res-main' },
            this.listEl = el('div', { class: 'res-list' + (this.store.view.grid ? ' grid' : '') }),
            this.pagerEl = el('nav', { class: 'pager' }))));
      this.renderAll();
    }

    /* force：语言切换时即使焦点在过滤区也重建 */
    renderAll(force) {
      if (!this.store || !this.headEl) return;
      this.renderHead();
      this.renderFilters(force);
      this.renderList();
    }

    renderHead() {
      const s = this.store;
      const loaded = s.items.length;
      const total = s.totalUpper;
      const reachable = s.branches.reduce((n, b) => n + Math.min(b.total || 0, api.MAX_RESULTS), 0);
      const rate = s.rate;
      const started = s.branches.some(b => b.total != null);

      const big = el('div', { class: 'res-count' },
        el('b', null, started ? fmtInt(total) : '—'),
        el('span', null, t('r.results')));

      const chips = el('div', { class: 'res-chips' },
        el('span', { class: 'chip' }, t('r.loaded', { n: fmtInt(loaded) })),
        s.multi ? el('span', { class: 'chip', title: t('r.multiTitle') }, t('r.subqueries', { n: s.branches.length })) : null,
        total > api.MAX_RESULTS ? el('span', { class: 'chip', title: t('r.capTitle') }, t('r.reachable', { n: fmtInt(reachable) })) : null,
        s.branches.some(b => b.incomplete) ? el('span', { class: 'chip warn', title: t('r.incompleteTitle') }, t('r.incomplete')) : null,
        rate && rate.remaining != null ? el('span', { class: 'chip ghost', title: rate.reset ? t('r.resetAt', { time: fmtTime(rate.reset) }) : '' }, 'API ' + rate.remaining + '/' + rate.limit) : null);

      const actions = el('div', { class: 'res-actions' },
        this.loading
          ? el('button', { type: 'button', class: 'btn sm', onclick: () => this.stop() }, el('span', { class: 'spinner' }), t('r.stop'))
          : !s.done ? [
            el('button', { type: 'button', class: 'btn sm', onclick: () => this.loadRound(), title: t('r.moreTitle') }, icon('plus', 14), t('r.more')),
            el('button', { type: 'button', class: 'btn sm', onclick: () => this.load(Infinity), title: t('r.allTitle') }, icon('download', 14), t('r.all')),
          ] : null,
        el('div', { class: 'split' },
          el('button', { type: 'button', class: 'btn sm ghost', onclick: () => this.export('csv'), disabled: !loaded, title: t('r.exportTitle') }, 'CSV'),
          el('button', { type: 'button', class: 'btn sm ghost', onclick: () => this.export('json'), disabled: !loaded, title: t('r.exportTitle') }, 'JSON')));

      this.headEl.replaceChildren(big, chips, el('span', { class: 'grow' }), actions);

      const errs = [this.error, ...s.branches.filter(b => b.error && b.error !== this.error).map(b => b.error)].filter(Boolean);
      this.alertEl.replaceChildren(...(errs.length ? [el('div', { class: 'alert' }, icon('alert', 16), el('span', null, errs.join('\n')))] : []));
    }

    renderFilters(force) {
      if (!force && this.filterEl.contains(document.activeElement)) return; // 保留输入焦点
      const s = this.store;
      const v = s.view;
      const set = (k, val) => { this.filters[k] = val; this.page = 1; this.renderList(); };
      const counts = {};
      for (const f of v.filters) {
        if (f.kind !== 'select') continue;
        const m = new Map();
        for (const it of s.items) { const k = String(f.get(it)); m.set(k, (m.get(k) || 0) + 1); }
        counts[f.key] = [...m.entries()].sort((a, b) => b[1] - a[1]);
      }

      const field = (label, input, cls) => el('label', { class: 'sf ' + (cls || '') }, el('span', null, label), input);
      const controls = [
        el('div', { class: 'side-search', title: t('r.filterHelp') },
          icon('filter', 15),
          el('input', { type: 'search', value: this.filters.__text || '', placeholder: t('r.filterPh'), oninput: e => set('__text', e.target.value) })),
      ];
      const nums = [];
      const bools = [];
      for (const f of v.filters) {
        const cur = this.filters[f.key] == null ? '' : this.filters[f.key];
        const label = t(f.label);
        if (f.kind === 'select') {
          const sel = el('select', { onchange: e => set(f.key, e.target.value) },
            el('option', { value: '' }, t('r.anyOpt')),
            counts[f.key].map(([k, n]) => el('option', { value: k }, k + '  ·  ' + n)));
          sel.value = cur;
          controls.push(field(label, sel));
        } else if (f.kind === 'bool') {
          bools.push(el('label', { class: 'switch' },
            el('input', { type: 'checkbox', checked: !!cur, onchange: e => set(f.key, e.target.checked) }), el('i'), label));
        } else if (f.kind === 'dateMin') {
          controls.push(field(label, el('input', { type: 'date', value: cur, onchange: e => set(f.key, e.target.value) })));
        } else if (f.kind === 'min' || f.kind === 'max') {
          nums.push(field(label, el('input', { type: 'number', min: 0, value: cur, placeholder: '—', oninput: e => set(f.key, e.target.value) }), 'num'));
        } else {
          controls.push(field(label, el('input', { type: 'text', value: cur, oninput: e => set(f.key, e.target.value) })));
        }
      }
      if (nums.length) controls.push(el('div', { class: 'num-grid' }, nums));
      if (bools.length) controls.push(el('div', { class: 'bools' }, bools));

      const sortSel = el('select', { onchange: e => { this.sortKey = e.target.value; this.page = 1; this.renderList(); } },
        el('option', { value: 'orig' }, s.multi ? t('r.orderLoaded') : t('r.orderGithub')),
        v.sorts.map(([k, label]) => el('option', { value: k }, t(label))));
      sortSel.value = this.sortKey;
      const sizeSel = el('select', { onchange: e => { this.pageSize = Number(e.target.value); this.page = 1; this.renderList(); } },
        [10, 20, 50, 100].map(n => el('option', { value: n }, t('r.perPage', { n }))));
      sizeSel.value = String(this.pageSize);

      controls.push(el('div', { class: 'side-sep' }));
      controls.push(el('div', { class: 'num-grid' }, field(t('r.sort'), sortSel), field(t('r.pageSize'), sizeSel)));
      controls.push(el('button', { type: 'button', class: 'link-btn', onclick: () => { this.filters = {}; this.page = 1; this.renderFilters(true); this.renderList(); } }, t('r.resetFilters')));

      this.filterEl.replaceChildren(...controls);
    }

    renderList() {
      const s = this.store;
      const list = this.filtered();
      const pages = Math.max(1, Math.ceil(list.length / this.pageSize));
      if (this.page > pages) this.page = pages;
      const start = (this.page - 1) * this.pageSize;
      const slice = list.slice(start, start + this.pageSize);

      if (!s.items.length && this.loading) {
        this.listEl.replaceChildren(...Array.from({ length: 5 }, () => el('div', { class: 'item skeleton' }, el('i'), el('div', null, el('i'), el('i'), el('i')))));
      } else if (!s.items.length) {
        this.listEl.replaceChildren(this.empty(this.error ? t('r.failed') : t('r.noResults')));
      } else if (!slice.length) {
        this.listEl.replaceChildren(this.empty(t('r.noFiltered')));
      } else {
        this.listEl.replaceChildren(...slice.map(it => s.view.render(it)));
      }
      this.renderPager(list.length, pages);
    }

    empty(text) {
      return el('div', { class: 'empty' }, icon('search', 36), el('p', null, text));
    }

    renderPager(count, pages) {
      const go = p => { this.page = p; this.renderList(); this.root.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      const btn = (p, label, cur) => el('button', { type: 'button', class: 'pg' + (cur ? ' on' : ''), disabled: p < 1 || p > pages || cur, onclick: () => go(p) }, label);
      const P = this.page;
      const want = [...new Set([1, pages, P - 1, P, P + 1].filter(p => p >= 1 && p <= pages))].sort((a, b) => a - b);
      const nums = [];
      let last = 0;
      for (const p of want) {
        if (p - last > 1) nums.push(el('span', { class: 'ellipsis' }, '…'));
        nums.push(btn(p, String(p), p === P));
        last = p;
      }
      const kids = [el('span', { class: 'pg-info' }, count ? t('r.count', { n: fmtInt(count) }) : '')];
      if (pages > 1) kids.push(btn(P - 1, '‹'), ...nums, btn(P + 1, '›'));
      if (!this.store.done && P === pages && !this.loading && this.store.items.length) {
        kids.push(el('button', { type: 'button', class: 'btn sm', onclick: () => this.loadRound() }, t('r.loadMore')));
      }
      this.pagerEl.replaceChildren(...kids);
    }

    export(fmt) {
      const list = this.filtered();
      const v = this.store.view;
      let blob;
      if (fmt === 'json') {
        const clean = list.map(it => { const o = Object.assign({}, it); delete o.__seq; return o; });
        blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      } else {
        const esc = x => { const s = x == null ? '' : String(x); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const rows = [v.csv.map(c => c[0]).join(',')].concat(list.map(it => v.csv.map(c => esc(c[1](it))).join(',')));
        blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      }
      const a = el('a', { href: URL.createObjectURL(blob), download: 'github-' + this.store.type + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.' + fmt });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  }

  global.GHS.results = { ResultStore, ResultsView, VIEWS };
})(window);
