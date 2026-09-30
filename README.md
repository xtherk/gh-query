# gh-query

**English** | [简体中文](README_CN.md)

A web tool for building GitHub search queries visually. Combine conditions with AND / OR / NOT, get a query string you can paste straight into GitHub's search box, or run the search in the page and filter, sort and export the results.

It's a static site: no backend, no build step.

**Demo:** https://xtherk.github.io/gh-query/

![gh-query screenshot](docs/screenshot.png)

## Features

- **Condition builder**: covers all six search types (repositories, issues, pull requests, users, code, commits), each with its full list of qualifiers. Groups can be nested, switched between AND and OR, and any condition or group can be negated.
- **Two-way editing**: the query string updates as you edit conditions, with syntax highlighting. You can also edit it by hand or paste an existing query and parse it back into conditions.
- **Queries GitHub can actually run**: GitHub's search syntax has a number of quirks, and gh-query handles them for you. It pushes negations down to single conditions, moves `in:` to the top level, and rewrites same-field ORs into a form GitHub accepts. When a query can't be expressed as a single GitHub search, it's split into sub-queries and the page explains why.
- **In-page search**: fetches results through the GitHub API and merges and de-duplicates results from multiple sub-queries. Filter by language, license, star range, last update and more, then sort, paginate, and export to CSV or JSON.
- **Sharing and history**: turn the current query into a shareable link; recent queries are saved locally.
- **Languages and themes**: the interface is available in six languages, with light and dark themes that can follow your system. See [Languages](#languages).

## Getting started

Open the demo site and start building. To run it locally:

```bash
git clone https://github.com/xtherk/gh-query.git
cd gh-query
# Open index.html directly, or serve the folder:
python -m http.server 8080
```

### Deploying to GitHub Pages

1. Fork this repository, or push it to your own account.
2. Go to **Settings → Pages**, set Source to **Deploy from a branch**, and pick the `main` branch with the `/ (root)` folder.
3. After a minute or so the site will be live at `https://<username>.github.io/gh-query/`.

Any other static host (Nginx, object storage, Vercel, Netlify, …) works the same way: serve the folder as static files. All assets use relative paths, so hosting under a sub-path needs no changes.

## Usage

### Running a query

| Action | What it does |
|---|---|
| Search | Runs the query through the GitHub API and shows the results below. `Ctrl + Enter` in the query box does the same |
| GitHub | Opens GitHub's own search results in a new tab, with your sort order applied |
| Copy | Copies the query string so you can paste it into GitHub's search box |
| Sync to conditions | Parses a hand-edited query string back into conditions |

### Filtering results

The filter box above the result list supports a small syntax and works on the results already loaded:

| Input | Matches |
|---|---|
| `react hooks` | both words |
| `vue\|react` | either word |
| `-deprecated` | excludes the word |
| `"design system"` | the exact phrase |

### GitHub token (optional)

gh-query works without a token, but API rate limits are lower. Code search through the API requires a token.

| | Without token | With token |
|---|---|---|
| Repository / issue / user / commit search | 10 requests/min | 30 requests/min |
| Code search | not available | 10 requests/min |

A [fine-grained token](https://github.com/settings/personal-access-tokens/new) with read-only access to public repositories is enough. The token is stored only in your browser's localStorage and is only ever sent to `api.github.com`.

## Languages

The interface is available in:

| Language | Code |
|---|---|
| 简体中文 (Simplified Chinese) | `zh-CN` |
| 繁體中文 (Traditional Chinese) | `zh-TW` |
| English | `en` |
| 日本語 (Japanese) | `ja` |
| Français (French) | `fr` |
| Русский (Russian) | `ru` |

- On your first visit, the language is picked from your browser settings, falling back to English.
- Switch at any time from the language menu in the top-right corner. Your choice is remembered, and switching keeps your conditions and loaded results.
- Everything on screen is translated, including qualifier names, options, sort orders, result filters and error messages. Relative times ("3 days ago") and numbers follow the selected language.
- The query string itself is GitHub syntax and doesn't change with the language.

## GitHub search limitations

These are how GitHub's search behaves, not limitations of gh-query. The tool works around them where it can; knowing them helps explain why it sometimes suggests splitting a query.

- **Each query returns at most 1,000 results.** This is a GitHub API limit. To see more, narrow the query, for example by splitting it into creation-date ranges.
- **`in:` applies to the whole query.** It controls which fields all keywords are matched against and can't be scoped to a single group.
- **Repository, user and commit search only support OR between keywords.** OR between qualifiers (e.g. `topic:llm OR topic:ai-agent`) returns no results, and combining OR with `in:` returns no results or wrong ones.
  - Repeating `language:`, `user:` or `org:` means OR, so `(language:Vue OR language:TypeScript)` can be written as `language:Vue language:TypeScript`. gh-query does this rewrite automatically.
  - Repeating `topic:` or `repo:` means AND, so no such rewrite exists. These queries are split into sub-queries: in-page search merges the results for you, and on GitHub you open each sub-query separately.
- **Issue, pull request and web code search** support OR between qualifiers and parentheses, so the limitation above doesn't apply to them.
- **Code search uses different syntax in the API and on the web.** The API uses the legacy syntax; the web uses the newer code search syntax. Qualifiers marked "API" or "web" in the field list only work on that side.

## Browser support

Chrome / Edge 111+, Firefox 113+, Safari 16.2+.

## Project structure

```
index.html          entry page
css/style.css       styles, including light and dark themes
js/i18n.js          interface text in six languages
js/schema.js        qualifiers and sort options for each search type
js/query.js         query expressions: parsing, normalization, serialization, splitting
js/builder.js       condition builder
js/picker.js        dropdown picker
js/api.js           GitHub search API requests
js/results.js       loading, filtering, sorting, pagination, export
js/app.js           page logic
js/icons.js         SVG icons
```

There are no third-party dependencies. Scripts are loaded as plain `<script>` tags, so opening `index.html` from disk works too.

## Contributing

Issues and pull requests are welcome.

- **Fixing or improving translations**: edit `js/i18n.js`. Every language must have the same set of keys.
- **Adding a language**: copy an existing language's entries in `js/i18n.js`, translate them, and add the language code and name to the `LANGS` list.
- **Adding a qualifier**: add the field under the matching search type in `js/schema.js`, then add its name for each language in `js/i18n.js`.
- **Reporting unexpected results**: please include the generated query string and what GitHub itself returns for it. That makes it easier to tell a gh-query bug from a limitation of GitHub's search syntax.

## License

gh-query is released under the [GNU Affero General Public License v3.0](LICENSE).
