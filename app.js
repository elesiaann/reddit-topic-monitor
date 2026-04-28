'use strict';

/* ══════════════════════════════════════════════════════════════
   State
══════════════════════════════════════════════════════════════ */
const state = {
  subreddits: [],
  keywords:   [],
  results:    [],
  timer:      null,
  countdown:  null,
  secsLeft:   0,
};

/* ══════════════════════════════════════════════════════════════
   Persistence (localStorage)
══════════════════════════════════════════════════════════════ */
function save() {
  localStorage.setItem('rtm_subs', JSON.stringify(state.subreddits));
  localStorage.setItem('rtm_kws',  JSON.stringify(state.keywords));
  localStorage.setItem('rtm_ri',   $('refresh-interval').value);
  localStorage.setItem('rtm_pl',   $('post-limit').value);
  localStorage.setItem('rtm_sb',   $('sort-by').value);
  localStorage.setItem('rtm_ma',   $('match-all').checked ? '1' : '0');
  localStorage.setItem('rtm_dark', document.documentElement.dataset.theme === 'dark' ? '1' : '0');
}

function load() {
  const subs = localStorage.getItem('rtm_subs');
  const kws  = localStorage.getItem('rtm_kws');
  if (subs) state.subreddits = JSON.parse(subs);
  if (kws)  state.keywords   = JSON.parse(kws);

  const ri = localStorage.getItem('rtm_ri');
  const pl = localStorage.getItem('rtm_pl');
  const sb = localStorage.getItem('rtm_sb');
  const ma = localStorage.getItem('rtm_ma');
  if (ri) $('refresh-interval').value = ri;
  if (pl) $('post-limit').value       = pl;
  if (sb) $('sort-by').value          = sb;
  if (ma) $('match-all').checked      = ma === '1';

  if (localStorage.getItem('rtm_dark') === '1') applyTheme('dark');
}

/* ══════════════════════════════════════════════════════════════
   DOM helpers
══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const esc = str => str.replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function setStatus(msg, type = '') {
  const el = $('status-msg');
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

function formatScore(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0','') + 'k';
  return String(n);
}

function timeAgo(utc) {
  const secs = Math.floor(Date.now() / 1000) - utc;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

/* ══════════════════════════════════════════════════════════════
   Tag lists
══════════════════════════════════════════════════════════════ */
function renderTags(listId, arr, onRemove) {
  const ul = $(listId);
  ul.innerHTML = '';
  arr.forEach((val, i) => {
    const li = document.createElement('li');
    li.className = 'tag';
    li.innerHTML = `<span>${esc(val)}</span>
      <button aria-label="Remove ${esc(val)}">&times;</button>`;
    li.querySelector('button').addEventListener('click', () => onRemove(i));
    ul.appendChild(li);
  });
}

function addSub() {
  const raw = $('sub-input').value.trim().replace(/^r\//i, '').toLowerCase();
  if (!raw) return;
  if (state.subreddits.includes(raw)) { setStatus(`r/${raw} already added`); return; }
  state.subreddits.push(raw);
  $('sub-input').value = '';
  renderTags('sub-list', state.subreddits, i => {
    state.subreddits.splice(i, 1);
    renderTags('sub-list', state.subreddits, arguments.callee);
    save();
  });
  save();
  setStatus('');
}

function addKw() {
  const raw = $('kw-input').value.trim();
  if (!raw) return;
  const kws = raw.split(',').map(s => s.trim()).filter(Boolean);
  kws.forEach(kw => {
    if (!state.keywords.includes(kw)) state.keywords.push(kw);
  });
  $('kw-input').value = '';
  renderTags('kw-list', state.keywords, i => {
    state.keywords.splice(i, 1);
    renderTags('kw-list', state.keywords, arguments.callee);
    save();
  });
  save();
  setStatus('');
}

function rebindTagRemovers() {
  renderTags('sub-list', state.subreddits, i => {
    state.subreddits.splice(i, 1);
    rebindTagRemovers();
    save();
  });
  renderTags('kw-list', state.keywords, i => {
    state.keywords.splice(i, 1);
    rebindTagRemovers();
    save();
  });
}

/* ══════════════════════════════════════════════════════════════
   Reddit API fetch
══════════════════════════════════════════════════════════════ */
async function fetchSubreddit(sub, sort, limit) {
  const timeParam = sort === 'top' ? '?t=day&limit=' + limit : '?limit=' + limit;
  const sortPath  = sort === 'top' ? 'top' : sort;
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sortPath}.json${timeParam}`;
  const res  = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`r/${sub} returned ${res.status}`);
  const json = await res.json();
  return json.data.children.map(c => c.data);
}

function postMatchesKeywords(post, keywords, matchAll) {
  const text = [post.title, post.selftext, post.author, post.subreddit].join(' ').toLowerCase();
  const matched = keywords.filter(kw => text.includes(kw.toLowerCase()));
  if (matchAll) return matched.length === keywords.length ? matched : null;
  return matched.length > 0 ? matched : null;
}

/* ══════════════════════════════════════════════════════════════
   Search
══════════════════════════════════════════════════════════════ */
async function runSearch() {
  if (state.subreddits.length === 0) { setStatus('Add at least one subreddit.', 'error'); return; }
  if (state.keywords.length === 0)   { setStatus('Add at least one keyword.', 'error'); return; }

  const btn   = $('btn-search');
  const limit = +$('post-limit').value;
  const sort  = $('sort-by').value;
  const matchAll = $('match-all').checked;

  btn.disabled = true;
  $('results-list').innerHTML = '<div class="state-msg"><div class="spinner"></div>Fetching posts…</div>';
  $('results-header').style.display = 'none';
  setStatus('Fetching…');

  const allPosts = [];
  const errors   = [];

  await Promise.allSettled(
    state.subreddits.map(sub =>
      fetchSubreddit(sub, sort, limit)
        .then(posts => allPosts.push(...posts))
        .catch(e => errors.push(`r/${sub}: ${e.message}`))
    )
  );

  const kws = state.keywords;
  state.results = allPosts
    .map(p => ({ post: p, matched: postMatchesKeywords(p, kws, matchAll) }))
    .filter(r => r.matched !== null);

  btn.disabled = false;
  renderResults();
  save();

  if (errors.length) setStatus('Errors: ' + errors.join('; '), 'error');
  else setStatus(`Done — ${new Date().toLocaleTimeString()}`, 'success');
}

/* ══════════════════════════════════════════════════════════════
   Highlight helper
══════════════════════════════════════════════════════════════ */
function highlight(text, keywords) {
  if (!text) return '';
  let safe = esc(text);
  keywords.forEach(kw => {
    const re = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    safe = safe.replace(re, '<mark>$1</mark>');
  });
  return safe;
}

/* ══════════════════════════════════════════════════════════════
   Render results
══════════════════════════════════════════════════════════════ */
function renderResults() {
  const container  = $('results-list');
  const header     = $('results-header');
  const filterText = $('filter-input').value.toLowerCase();
  const sortMode   = $('result-sort').value;

  let items = state.results.filter(r => {
    if (!filterText) return true;
    return (r.post.title + r.post.selftext + r.post.author + r.post.subreddit)
      .toLowerCase().includes(filterText);
  });

  if (sortMode === 'score')    items.sort((a,b) => b.post.score - a.post.score);
  else if (sortMode === 'comments') items.sort((a,b) => b.post.num_comments - a.post.num_comments);
  else items.sort((a,b) => b.post.created_utc - a.post.created_utc);

  $('results-count').textContent = items.length;
  header.style.display = state.results.length > 0 ? 'flex' : 'none';

  if (items.length === 0) {
    container.innerHTML = `<div class="state-msg">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p>No matching posts found.</p>
    </div>`;
    return;
  }

  const kws = state.keywords;
  container.innerHTML = items.map(({ post: p, matched }) => {
    const excerpt = p.selftext ? p.selftext.slice(0, 280) + (p.selftext.length > 280 ? '…' : '') : '';
    const postUrl = `https://reddit.com${p.permalink}`;
    const kwPills = matched.map(k => `<span class="kw-pill">${esc(k)}</span>`).join('');
    return `
    <article class="post-card">
      <div class="post-score">
        <span class="score-arrow">&#9650;</span>
        <span class="score-num">${esc(formatScore(p.score))}</span>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <a class="sub-link" href="https://reddit.com/r/${esc(p.subreddit)}" target="_blank" rel="noopener">r/${esc(p.subreddit)}</a>
          <span>&bull; by <a class="author-link" href="https://reddit.com/u/${esc(p.author)}" target="_blank" rel="noopener">u/${esc(p.author)}</a></span>
          <span>&bull; ${timeAgo(p.created_utc)}</span>
          ${p.link_flair_text ? `<span>&bull; <em>${esc(p.link_flair_text)}</em></span>` : ''}
        </div>
        <a class="post-title" href="${esc(postUrl)}" target="_blank" rel="noopener">
          ${highlight(p.title, kws)}
        </a>
        ${excerpt ? `<p class="post-excerpt">${highlight(excerpt, kws)}</p>` : ''}
        <div class="matched-kws">${kwPills}</div>
        <div class="post-footer">
          <a href="${esc(postUrl)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${p.num_comments} comments
          </a>
          ${p.url && !p.url.includes('reddit.com') ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open link
          </a>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   Auto-refresh
══════════════════════════════════════════════════════════════ */
function startAutoRefresh() {
  clearInterval(state.timer);
  clearInterval(state.countdown);
  $('refresh-countdown').textContent = '';

  const secs = +$('refresh-interval').value;
  if (secs === 0) return;

  state.secsLeft = secs;
  state.countdown = setInterval(() => {
    state.secsLeft--;
    const m = Math.floor(state.secsLeft / 60);
    const s = state.secsLeft % 60;
    $('refresh-countdown').textContent =
      `Next refresh in ${m > 0 ? m + 'm ' : ''}${s}s`;
    if (state.secsLeft <= 0) {
      state.secsLeft = secs;
      runSearch();
    }
  }, 1000);
}

/* ══════════════════════════════════════════════════════════════
   Theme
══════════════════════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('icon-moon').style.display = theme === 'dark' ? 'none' : 'block';
  $('icon-sun').style.display  = theme === 'dark' ? 'block' : 'none';
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  applyTheme(isDark ? '' : 'dark');
  save();
}

/* ══════════════════════════════════════════════════════════════
   Boot
══════════════════════════════════════════════════════════════ */
function boot() {
  load();
  rebindTagRemovers();

  // Add subreddit
  $('sub-add').addEventListener('click', addSub);
  $('sub-input').addEventListener('keydown', e => { if (e.key === 'Enter') addSub(); });

  // Add keyword
  $('kw-add').addEventListener('click', addKw);
  $('kw-input').addEventListener('keydown', e => { if (e.key === 'Enter') addKw(); });

  // Search
  $('btn-search').addEventListener('click', () => { runSearch().then(startAutoRefresh); });
  $('btn-clear').addEventListener('click', () => {
    state.results = [];
    $('results-list').innerHTML = '';
    $('results-header').style.display = 'none';
    clearInterval(state.timer);
    clearInterval(state.countdown);
    $('refresh-countdown').textContent = '';
    setStatus('');
  });

  // Filter / sort live update
  $('filter-input').addEventListener('input', renderResults);
  $('result-sort').addEventListener('change', renderResults);

  // Settings change → persist
  ['refresh-interval', 'post-limit', 'sort-by', 'match-all'].forEach(id => {
    $(id).addEventListener('change', () => {
      save();
      startAutoRefresh();
    });
  });

  // Theme
  $('theme-toggle').addEventListener('click', toggleTheme);

  // Initial empty state
  $('results-list').innerHTML = `<div class="state-msg">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <p>Add subreddits &amp; keywords, then click <strong>Search Now</strong>.</p>
  </div>`;
}

document.addEventListener('DOMContentLoaded', boot);
