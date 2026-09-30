/*
 * GitHub REST 搜索 API 封装。
 * 未认证：搜索 10 次/分钟；使用 Token：30 次/分钟（代码搜索 10 次/分钟且必须认证）。
 * 每个查询 API 最多返回前 1000 条结果。
 */
(function (global) {
  'use strict';

  const API = 'https://api.github.com/search/';
  const t = (k, p) => global.GHS.t(k, p);
  const MAX_RESULTS = 1000;

  class ApiError extends Error {
    constructor(msg, status, rate) { super(msg); this.status = status; this.rate = rate; }
  }

  function readRate(res) {
    const n = k => { const v = res.headers.get(k); return v == null ? null : Number(v); };
    return { limit: n('x-ratelimit-limit'), remaining: n('x-ratelimit-remaining'), reset: n('x-ratelimit-reset') };
  }

  async function search({ endpoint, q, sort, order, page, perPage, token, signal }) {
    const params = new URLSearchParams({ q, per_page: String(perPage), page: String(page) });
    if (sort) { params.set('sort', sort); params.set('order', order || 'desc'); }
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(API + endpoint + '?' + params, { headers, signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError(t('e.network', { msg: e.message }), 0, null);
    }
    const rate = readRate(res);
    let body = null;
    try { body = await res.json(); } catch (_) { /* 非 JSON 响应 */ }

    if (!res.ok) {
      let msg = (body && body.message) || res.statusText || t('e.failed');
      if (body && Array.isArray(body.errors) && body.errors.length) {
        msg += ': ' + body.errors.map(e => e.message || e.code).join('; ');
      }
      if ((res.status === 403 || res.status === 429) && rate.remaining === 0 && rate.reset) {
        msg = t('e.rate', { time: new Date(rate.reset * 1000).toLocaleTimeString(global.GHS.i18n.lang) }) + (token ? '' : t('e.rateHint'));
      } else if (res.status === 401) {
        msg = t('e.auth');
      }
      throw new ApiError(msg + ' (HTTP ' + res.status + ')', res.status, rate);
    }
    return { total: body.total_count, incomplete: body.incomplete_results, items: body.items || [], rate };
  }

  global.GHS.api = { search, ApiError, MAX_RESULTS };
})(window);
