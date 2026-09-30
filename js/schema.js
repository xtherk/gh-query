/*
 * GitHub 搜索限定符定义。
 * 每种搜索类型描述：可用字段（限定符）、排序项、API 端点与网页搜索 type 参数。
 * 显示文案不在此处，统一经 i18n 按 key 取得（见 fieldParts / optionLabel / sortLabel）。
 *
 * 字段 kind：
 *   keyword  自由关键字（可选精确短语）
 *   text     文本值，key:value
 *   number   数值，支持 = > >= < <= 区间
 *   date     日期，支持 = > >= < <= 区间（YYYY-MM-DD 或 ISO 时间）
 *   enum     固定取值
 *   multi    多选，逗号拼接（如 in:name,description）
 *   raw      原样输出的片段（用于未识别语法）
 * side：'api' / 'web' 表示仅 API 或仅网页支持。
 * qualOr: false  旧版搜索引擎只在关键字之间支持 OR，限定符之间用 OR 会返回 0 条（仓库搜索 2026-09 经 API 实测；
 *                用户/提交搜索同属旧版引擎，按同样规则处理）。
 * repeatOr       重复出现即为 OR 的限定符（实测 language:/user:/org: 在仓库搜索中如此；topic: 重复则为 AND）。
 */
(function (global) {
  'use strict';

  const t = (k, p) => global.GHS.t(k, p);

  const LANGS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C', 'C++', 'C#', 'PHP', 'Ruby',
    'Kotlin', 'Swift', 'Dart', 'Scala', 'Shell', 'PowerShell', 'Lua', 'R', 'Julia', 'Haskell', 'Elixir',
    'Erlang', 'Clojure', 'Objective-C', 'Vue', 'Svelte', 'HTML', 'CSS', 'SCSS', 'Jupyter Notebook',
    'Dockerfile', 'Makefile', 'Nix', 'Zig', 'Perl', 'MATLAB', 'Groovy', 'Assembly', 'Solidity', 'WebAssembly'];

  const LICENSES = ['mit', 'apache-2.0', 'gpl-2.0', 'gpl-3.0', 'lgpl-2.1', 'lgpl-3.0', 'agpl-3.0', 'bsd-2-clause',
    'bsd-3-clause', 'bsd-3-clause-clear', 'mpl-2.0', 'epl-1.0', 'epl-2.0', 'unlicense', 'cc0-1.0', 'cc-by-4.0',
    'cc-by-sa-4.0', 'isc', 'wtfpl', 'zlib', 'bsl-1.0', 'artistic-2.0', 'ofl-1.1', 'postgresql', 'ms-pl'];

  const BOOL = ['true', 'false'];

  const kw = { key: 'keyword', kind: 'keyword', ph: 'ph.keyword', help: 'help.keyword' };
  const raw = { key: '__raw', kind: 'raw', ph: 'ph.raw', help: 'help.raw' };
  const txt = (key, extra) => Object.assign({ key, kind: 'text' }, extra);
  const num = (key, extra) => Object.assign({ key, kind: 'number' }, extra);
  const date = (key, extra) => Object.assign({ key, kind: 'date' }, extra);
  const en = (key, options, extra) => Object.assign({ key, kind: 'enum', options }, extra);
  const multi = (key, options, extra) => Object.assign({ key, kind: 'multi', options, help: 'help.in' }, extra);

  const user = txt('user', { placeholder: 'octocat' });
  const org = txt('org', { placeholder: 'github' });
  const repo = txt('repo', { placeholder: 'owner/name' });
  const lang = txt('language', { suggest: LANGS });
  const created = date('created');

  const issueFields = [
    kw,
    multi('in', ['title', 'body', 'comments']),
    en('is', ['open', 'closed', 'merged', 'unmerged', 'draft', 'locked', 'unlocked', 'public', 'private', 'archived', 'issue', 'pr']),
    en('state', ['open', 'closed']),
    en('reason', ['completed', 'not planned']),
    repo, user, org,
    txt('author', { ph: 'ph.author' }),
    txt('assignee'), txt('mentions'), txt('commenter'), txt('involves'),
    txt('team', { placeholder: 'org/team' }),
    txt('review-requested'), txt('reviewed-by'), txt('team-review-requested'),
    en('review', ['none', 'required', 'approved', 'changes_requested']),
    txt('label', { placeholder: 'bug' }), txt('milestone'), txt('project'),
    en('linked', ['pr', 'issue']),
    txt('head'), txt('base'),
    en('status', ['pending', 'success', 'failure']),
    txt('sha'),
    lang,
    num('comments'), num('interactions'), num('reactions'),
    created, date('updated'), date('closed'), date('merged'),
    en('no', ['label', 'milestone', 'assignee', 'project']),
    en('archived', BOOL), en('draft', BOOL),
    raw,
  ];
  const issueSorts = ['', 'comments', 'reactions', 'reactions-+1', 'reactions--1', 'reactions-heart', 'interactions', 'created', 'updated'];

  const TYPES = {
    repositories: {
      icon: 'repo', api: 'repositories', web: 'repositories', qualOr: false, repeatOr: ['language', 'user', 'org'],
      sorts: ['', 'stars', 'forks', 'help-wanted-issues', 'updated'],
      fields: [
        kw,
        multi('in', ['name', 'description', 'readme', 'topics']),
        num('stars'), num('forks'), num('size'), num('followers'), num('topics'),
        num('good-first-issues'), num('help-wanted-issues'),
        lang,
        txt('topic', { placeholder: 'machine-learning' }),
        txt('license', { suggest: LICENSES }),
        user, org, repo,
        created, date('pushed'),
        en('is', ['public', 'private', 'internal', 'sponsorable', 'template', 'mirror', 'archived']),
        en('archived', BOOL),
        en('fork', ['true', 'only']),
        en('mirror', BOOL), en('template', BOOL),
        en('has', ['funding-file']),
        raw,
      ],
    },

    issues: { icon: 'issue', api: 'issues', web: 'issues', group: 'issue', forceIs: 'issue', sorts: issueSorts, fields: issueFields },
    pullrequests: { icon: 'pr', api: 'issues', web: 'pullrequests', group: 'issue', forceIs: 'pr', sorts: issueSorts, fields: issueFields },

    users: {
      icon: 'user', api: 'users', web: 'users', group: 'users', qualOr: false,
      sorts: ['', 'followers', 'repositories', 'joined'],
      fields: [
        kw,
        multi('in', ['login', 'name', 'email']),
        en('type', ['user', 'org']),
        num('repos'), num('followers'),
        txt('location', { placeholder: 'china' }),
        lang, created, user, org,
        en('is', ['sponsorable']),
        raw,
      ],
    },

    code: {
      icon: 'code', api: 'code', web: 'code', group: 'code', note: 'note.code',
      sorts: [''],
      fields: [
        kw,
        multi('in', ['file', 'path'], { side: 'api' }),
        lang, repo, user, org,
        txt('path', { placeholder: 'src/ *.md' }),
        txt('filename', { side: 'api' }),
        txt('extension', { side: 'api', placeholder: 'js' }),
        num('size', { side: 'api' }),
        txt('symbol', { side: 'web' }),
        txt('content', { side: 'web' }),
        en('is', ['archived', 'fork', 'vendored', 'generated'], { side: 'web' }),
        en('fork', ['true'], { side: 'api' }),
        raw,
      ],
    },

    commits: {
      icon: 'commit', api: 'commits', web: 'commits', qualOr: false,
      sorts: ['', 'author-date', 'committer-date'],
      fields: [
        kw, repo, user, org,
        txt('author'), txt('committer'), txt('author-name'), txt('committer-name'), txt('author-email'), txt('committer-email'),
        date('author-date'), date('committer-date'),
        en('merge', BOOL),
        txt('hash'), txt('parent'), txt('tree'),
        en('is', ['public', 'private']),
        raw,
      ],
    },
  };

  // 数值/日期运算符
  const rangeOps = () => [['=', '='], ['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤'], ['..', t('b.range')]];

  const EMOJI_SORTS = { 'reactions-+1': '👍', 'reactions--1': '👎', 'reactions-heart': '❤️' };

  function getField(type, key) {
    return TYPES[type].fields.find(f => f.key === key) || null;
  }

  /* 优先取类型组专属文案（如 f.issue.is），否则取通用文案 */
  function scoped(prefix, type, rest) {
    const g = TYPES[type].group;
    const i18n = global.GHS.i18n;
    if (g && i18n.has(prefix + '.' + g + '.' + rest)) return t(prefix + '.' + g + '.' + rest);
    return i18n.has(prefix + '.' + rest) ? t(prefix + '.' + rest) : null;
  }

  /*
   * 字段显示拆成三部分，由界面分别排版，避免“Language language:”这种同词相连：
   *   name  译名；qual  语法关键字（如 language:，关键字/原始片段没有）；tag  仅 API / 仅网页标记
   */
  function fieldParts(type, f) {
    return {
      name: scoped('f', type, f.key) || f.key,
      qual: f.kind === 'keyword' || f.kind === 'raw' ? '' : f.key + ':',
      tag: f.side ? t('tag.' + f.side).replace(/[（）()\s]/g, '') : '',
    };
  }

  /* pill 为 true 时只返回译名（用于多选按钮），否则返回“译名 · 原值” */
  function optionLabel(type, f, v, pill) {
    const tr = scoped('o', type, f.key + '.' + v);
    if (!tr) return v;
    if (pill || tr.toLowerCase() === v.toLowerCase()) return tr;
    return tr + ' · ' + v;
  }

  function sortLabel(v) {
    if (EMOJI_SORTS[v]) return EMOJI_SORTS[v];
    return t('s.' + (v || 'best'));
  }

  global.GHS = global.GHS || {};
  global.GHS.schema = { TYPES, rangeOps, getField, fieldParts, optionLabel, sortLabel, LANGS, LICENSES };
})(window);
