/*
 * 内联 SVG 图标（24×24 描边风格）。
 */
(function (global) {
  'use strict';

  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    fork: '<circle cx="12" cy="18" r="2.5"/><circle cx="6" cy="5.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><path d="M6 8v1.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8M12 11.5v4"/>',
    issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
    issueClosed: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a2 2 0 0 0-2-2h-4m2-2.5L11.5 7 14 9.5"/>',
    merge: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8 7.5c1 3 4 4.5 7.5 4.5"/>',
    repo: '<path d="M5 19.5v-14A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5 2.5 2.5 0 0 0 7.5 23H19v-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    commit: '<circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2.5 0-.8 13.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5.5 6"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9M17 6l3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
    monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.7-6.4L3 8.3"/><path d="M3 3v5.3h5.3M12 7.5V12l3 2"/>',
    sparkles: '<path d="M11 3 12.8 8.2 18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    link: '<path d="M10 13.5a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 10.5a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    parse: '<path d="M4 4h16M12 20V9M7 13l5-5 5 5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke-linejoin="round"/>',
    message: '<path d="M21 14.5a2 2 0 0 1-2 2H8l-5 4.5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    scale: '<path d="M12 3v18M7 21h10M4 7h16M6.5 7 3.5 13.5a3 3 0 0 0 6 0zM17.5 7l-3 6.5a3 3 0 0 0 6 0z"/>',
    filter: '<path d="M3 4.5h18l-7 8.5v6l-4 2v-8z"/>',
    sortDown: '<path d="M4 6h10M4 12h7M4 18h4M18 5v14m-3-3 3 3 3-3"/>',
    sortUp: '<path d="M4 6h4M4 12h7M4 18h10M18 19V5m-3 3 3-3 3 3"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/>',
    // GitHub 标志（Octicons mark-github，16×16 放大到 24×24 画布，填充而非描边）
    github: '<g transform="scale(1.5)"><path fill="currentColor" stroke="none" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></g>',
    check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    archive: '<rect x="2.5" y="3.5" width="19" height="5" rx="1"/><path d="M4.5 8.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.5M10 12.5h4"/>',
  };

  function icon(name, size) {
    const wrap = document.createElement('span');
    wrap.className = 'ic';
    const s = size || 16;
    wrap.innerHTML = '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
    return wrap;
  }

  global.GHS = global.GHS || {};
  global.GHS.icon = icon;
})(window);
