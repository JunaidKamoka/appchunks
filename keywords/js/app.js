/**
 * KeywordsIQ — Main Application
 */

(() => {
  'use strict';

  // ── STATE ────────────────────────────────────────────────────────
  const state = {
    platform: 'ios',
    country:  'us',
    keyword:  '',
    results:  null,
    history:  JSON.parse(localStorage.getItem('kiq_history') || '[]'),
    saved:    JSON.parse(localStorage.getItem('kiq_saved')   || '[]'),
    sortCol:  'volume',
    sortDir:  'desc',
    appSort:  'rank',
    chartRange: '12m',
    volumeChart: null,
  };

  // ── DOM REFS ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  const els = {
    keywordInput:   $('keywordInput'),
    searchBtn:      $('searchBtn'),
    loadingState:   $('loadingState'),
    resultsContainer: $('resultsContainer'),
    emptyState:     $('emptyState'),
    countrySelect:  $('countrySelect'),
    bulkToggle:     $('bulkToggle'),
    bulkInputWrap:  $('bulkInputWrap'),
    bulkInput:      $('bulkInput'),
    bulkSearchBtn:  $('bulkSearchBtn'),
    suggestions:    $('suggestions'),
    saveKeywordBtn: $('saveKeywordBtn'),
    exportBtn:      $('exportBtn'),
    appsSortSelect: $('appsSortSelect'),
    appModal:       $('appModal'),
    modalClose:     $('modalClose'),
    modalContent:   $('modalContent'),
    toastContainer: $('toastContainer'),
    sidebarToggle:  $('sidebarToggle'),
    sidebar:        $('sidebar'),
    relatedTableBody: $('relatedTableBody'),
    appsList:       $('appsList'),
    trendingGrid:   $('trendingGrid'),
    competitorInput:$('competitorInput'),
    competitorSearchBtn: $('competitorSearchBtn'),
    competitorResults: $('competitorResults'),
    historyList:    $('historyList'),
    savedList:      $('savedList'),
    trendingPlatformLabel: $('trendingPlatformLabel'),
    sidebarBackdrop:       $('sidebarBackdrop'),
  };

  // ── INIT ─────────────────────────────────────────────────────────
  function init() {
    try { feather.replace(); } catch(e) { console.warn('Feather icons unavailable', e); }
    bindEvents();
    renderHistoryView();
    renderSavedView();

    // Auto-search if hash keyword
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {
      els.keywordInput.value = hash;
      doSearch(hash);
    }
  }

  // ── EVENTS ───────────────────────────────────────────────────────
  function bindEvents() {
    // Search
    els.searchBtn.addEventListener('click', () => triggerSearch());
    els.keywordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') triggerSearch();
    });
    els.keywordInput.addEventListener('input', onKeywordInput);

    // Platform
    $$('.platform-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.platform-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.platform = btn.dataset.platform;
        if (state.keyword) doSearch(state.keyword);
        updateTrendingPlatformLabel();
        if (currentView() === 'trending') renderTrendingView();
      });
    });

    // Country
    els.countrySelect.addEventListener('change', () => {
      state.country = els.countrySelect.value;
      if (state.keyword) doSearch(state.keyword);
    });

    // Sidebar nav
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.dataset.view;
        switchView(view);
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        if (window.innerWidth <= 900) {
          els.sidebar.classList.remove('open');
          els.sidebarBackdrop.classList.remove('visible');
        }
      });
    });

    // Sidebar toggle (mobile)
    els.sidebarToggle.addEventListener('click', () => {
      const isOpen = els.sidebar.classList.toggle('open');
      els.sidebarBackdrop.classList.toggle('visible', isOpen);
    });
    els.sidebarBackdrop.addEventListener('click', () => {
      els.sidebar.classList.remove('open');
      els.sidebarBackdrop.classList.remove('visible');
    });

    // Bulk toggle
    els.bulkToggle.addEventListener('click', () => {
      els.bulkInputWrap.classList.toggle('hidden');
    });
    els.bulkSearchBtn.addEventListener('click', doBulkSearch);

    // Save keyword
    els.saveKeywordBtn.addEventListener('click', () => {
      if (!state.keyword) return;
      const idx = state.saved.findIndex(s => s.keyword === state.keyword && s.platform === state.platform);
      if (idx >= 0) {
        state.saved.splice(idx, 1);
        els.saveKeywordBtn.classList.remove('saved');
        showToast('Keyword removed from saved list', 'info');
      } else {
        state.saved.unshift({
          keyword:  state.keyword,
          platform: state.platform,
          country:  state.country,
          volume:   state.results?.metrics?.volume || 0,
          date:     new Date().toISOString(),
        });
        els.saveKeywordBtn.classList.add('saved');
        showToast('Keyword saved!', 'success');
      }
      persistSaved();
      renderSavedView();
    });

    // Export CSV
    els.exportBtn.addEventListener('click', exportCSV);

    // Apps sort
    els.appsSortSelect.addEventListener('change', () => {
      state.appSort = els.appsSortSelect.value;
      if (state.results) renderApps(state.results.apps);
    });

    // Table sort
    $$('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          state.sortCol = col;
          state.sortDir = 'desc';
        }
        if (state.results) renderRelatedTable(state.results.related);
      });
    });

    // Chart range tabs
    $$('.chart-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.chart-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.chartRange = tab.dataset.range;
        if (state.results) updateChart(state.results.metrics.history);
      });
    });

    // Modal close
    els.modalClose.addEventListener('click', closeModal);
    els.appModal.addEventListener('click', e => {
      if (e.target === els.appModal) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    // Quick search chips
    $$('.qs-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        els.keywordInput.value = chip.dataset.kw;
        doSearch(chip.dataset.kw);
      });
    });

    // Competitor search
    els.competitorSearchBtn.addEventListener('click', doCompetitorSearch);
    els.competitorInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doCompetitorSearch();
    });
  }

  // ── VIEW SWITCHING ────────────────────────────────────────────────
  function currentView() {
    return document.querySelector('.nav-item.active')?.dataset.view || 'search';
  }

  function switchView(view) {
    const views = ['search','trending','competitors','history','saved'];
    views.forEach(v => {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    if (view === 'trending') renderTrendingView();
    if (view === 'history')  renderHistoryView();
    if (view === 'saved')    renderSavedView();
  }

  function updateTrendingPlatformLabel() {
    const labels = { ios:'iOS', ipad:'iPad', macos:'macOS', android:'Android' };
    els.trendingPlatformLabel.textContent = labels[state.platform] || 'iOS';
  }

  // ── SEARCH ───────────────────────────────────────────────────────
  function triggerSearch() {
    const kw = els.keywordInput.value.trim();
    if (!kw) { showToast('Please enter a keyword', 'error'); return; }
    doSearch(kw);
  }

  async function doSearch(keyword) {
    state.keyword = keyword;
    history.replaceState(null, '', `#${encodeURIComponent(keyword)}`);

    // Switch to search view
    switchView('search');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));

    els.emptyState.classList.add('hidden');
    els.resultsContainer.classList.add('hidden');
    els.loadingState.classList.remove('hidden');
    els.suggestions.innerHTML = '';

    try {
      const data = await API.searchKeyword(keyword, state.platform, state.country);
      state.results = data;

      // Add to history
      addToHistory(keyword);

      // Render
      renderResults(data);
    } catch (err) {
      console.error(err);
      showToast('Search failed. Please try again.', 'error');
      els.emptyState.classList.remove('hidden');
    } finally {
      els.loadingState.classList.add('hidden');
    }
  }

  // ── KEYWORD INPUT SUGGESTIONS ─────────────────────────────────────
  let suggestTimeout;
  function onKeywordInput() {
    clearTimeout(suggestTimeout);
    const val = els.keywordInput.value.trim();
    if (!val) { els.suggestions.innerHTML = ''; return; }

    suggestTimeout = setTimeout(() => {
      const suggestions = generateSuggestions(val);
      els.suggestions.innerHTML = suggestions
        .map(s => `<button class="suggestion-chip">${s}</button>`)
        .join('');
      $$('#suggestions .suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          els.keywordInput.value = chip.textContent;
          els.suggestions.innerHTML = '';
          doSearch(chip.textContent);
        });
      });
    }, 300);
  }

  function generateSuggestions(base) {
    const mods = ['free','pro','best','2025','for beginners','advanced','no ads','offline'];
    return mods.map(m => `${base} ${m}`).slice(0, 6);
  }

  // ── BULK SEARCH ───────────────────────────────────────────────────
  async function doBulkSearch() {
    const raw = els.bulkInput.value.trim();
    if (!raw) { showToast('Enter at least one keyword', 'error'); return; }
    const keywords = raw.split('\n').map(k => k.trim()).filter(Boolean).slice(0, 20);
    if (keywords.length === 0) return;

    showToast(`Analyzing ${keywords.length} keywords…`, 'info');
    els.bulkInputWrap.classList.add('hidden');

    // Search first keyword and show results; queue rest in background
    await doSearch(keywords[0]);
    if (keywords.length > 1) {
      showToast(`Tip: Search each keyword individually for full analysis`, 'info');
    }
  }

  // ── RENDER RESULTS ────────────────────────────────────────────────
  function renderResults(data) {
    const { keyword, metrics, apps, related } = data;

    // Title
    $('resultKeyword').textContent = `"${keyword}"`;

    // Check if saved
    const isSaved = state.saved.some(s => s.keyword === keyword && s.platform === state.platform);
    els.saveKeywordBtn.classList.toggle('saved', isSaved);

    // Metrics
    renderMetrics(metrics);

    // Chart
    renderVolumeChart(metrics.history);

    // Related keywords
    renderRelatedTable(related);

    // Apps
    renderApps(apps);

    // Show results
    try { feather.replace(); } catch(e) {}
    els.resultsContainer.classList.remove('hidden');
  }

  function renderMetrics(m) {
    const diff   = API.difficultyLabel(m.difficulty);
    const chance = API.chanceLabel(m.chance);
    const trend  = API.trendArrow(m.trend);

    $('metricVolumeVal').textContent  = API.formatVolume(m.volume);
    $('metricVolumeSub').innerHTML    = `<span class="text-muted">searches/month</span>`;

    $('metricDiffVal').innerHTML      = `<span class="${diff.cls}">${m.difficulty}</span><span style="font-size:.7rem;color:var(--text-muted)">/100</span>`;
    $('metricDiffSub').innerHTML      = `<span class="${diff.cls}">${diff.label}</span>`;

    $('metricChanceVal').innerHTML    = `<span class="${chance.cls}">${m.chance}</span><span style="font-size:.7rem;color:var(--text-muted)">/100</span>`;
    $('metricChanceSub').innerHTML    = `<span class="${chance.cls}">${chance.label} chance</span>`;

    $('metricAppsVal').textContent    = API.formatNumber(m.competing);
    $('metricAppsSub').textContent    = 'competing apps';

    $('metricCpiVal').textContent     = `$${m.cpi}`;
    $('metricCpiSub').textContent     = 'avg cost per install';

    $('metricTrendVal').innerHTML     = `<span class="${trend.cls === 'trend-up' ? 'text-green' : trend.cls === 'trend-down' ? 'text-red' : 'text-muted'}">${trend.text}</span>`;
    $('metricTrendSub').innerHTML     = `<span class="${trend.cls}" style="font-size:.7rem;padding:1px 5px;border-radius:4px">${trend.icon} vs last month</span>`;
  }

  // ── VOLUME CHART ─────────────────────────────────────────────────
  function renderVolumeChart(history) {
    const ctx = $('volumeChart').getContext('2d');
    if (state.volumeChart) { state.volumeChart.destroy(); }

    const filtered = filterHistory(history, state.chartRange);

    state.volumeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: filtered.map(d => d.month),
        datasets: [{
          label: 'Monthly Volume',
          data:  filtered.map(d => d.volume),
          fill:  true,
          tension: 0.4,
          borderColor: '#ffffff',
          borderWidth: 2,
          pointBackgroundColor: '#ffffff',
          pointRadius: 3,
          pointHoverRadius: 5,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
            g.addColorStop(0,   'rgba(255,255,255,0.15)');
            g.addColorStop(1,   'rgba(255,255,255,0)');
            return g;
          },
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111111',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
            titleColor:      '#f0f2f8',
            bodyColor:       '#8b95b0',
            padding:         10,
            callbacks: {
              label: ctx => ` ${API.formatVolume(ctx.raw)} searches`,
            },
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#525d78', font: { size: 11 } },
          },
          y: {
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#525d78',
              font:  { size: 11 },
              callback: v => API.formatVolume(v),
            },
            beginAtZero: false,
          },
        },
      },
    });
  }

  function updateChart(history) {
    if (!state.volumeChart) return;
    const filtered = filterHistory(history, state.chartRange);
    state.volumeChart.data.labels = filtered.map(d => d.month);
    state.volumeChart.data.datasets[0].data = filtered.map(d => d.volume);
    state.volumeChart.update();
  }

  function filterHistory(history, range) {
    if (range === '3m') return history.slice(-3);
    if (range === '6m') return history.slice(-6);
    return history;
  }

  // ── RELATED TABLE ─────────────────────────────────────────────────
  function renderRelatedTable(related) {
    const sorted = [...related].sort((a, b) => {
      const dir = state.sortDir === 'desc' ? -1 : 1;
      return (a[state.sortCol] - b[state.sortCol]) * dir;
    });

    $('relatedCount').textContent = related.length;
    $('relatedTableBody').innerHTML = sorted.map(item => {
      const diff   = API.difficultyLabel(item.difficulty);
      const chance = API.chanceLabel(item.chance);
      const trend  = API.trendArrow(item.trend);
      const diffBar = item.difficulty > 60 ? 'bar-red' : item.difficulty > 40 ? 'bar-yellow' : 'bar-green';
      const chBar   = item.chance < 40 ? 'bar-red' : item.chance < 70 ? 'bar-yellow' : 'bar-green';
      return `
      <tr>
        <td><span class="kw-link" data-kw="${escHtml(item.keyword)}">${escHtml(item.keyword)}</span></td>
        <td>
          <div class="score-bar-wrap bar-blue">
            <div class="score-bar"><div class="score-bar-fill" style="width:${Math.min(100, item.volume/10000)}%;background:var(--blue)"></div></div>
            <span class="score-num">${API.formatVolume(item.volume)}</span>
          </div>
        </td>
        <td>
          <div class="score-bar-wrap ${diffBar}">
            <div class="score-bar"><div class="score-bar-fill" style="width:${item.difficulty}%"></div></div>
            <span class="score-num ${diff.cls}">${item.difficulty}</span>
          </div>
        </td>
        <td>
          <div class="score-bar-wrap ${chBar}">
            <div class="score-bar"><div class="score-bar-fill" style="width:${item.chance}%"></div></div>
            <span class="score-num ${chance.cls}">${item.chance}</span>
          </div>
        </td>
        <td><span class="trend-badge ${trend.cls}">${trend.icon} ${trend.text}</span></td>
        <td>
          <button class="btn-icon kw-search-btn" data-kw="${escHtml(item.keyword)}" title="Search this keyword">
            <i data-feather="search"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Bind click handlers on newly rendered elements
    $$('#relatedTableBody .kw-link, #relatedTableBody .kw-search-btn').forEach(el => {
      el.addEventListener('click', () => {
        const kw = el.dataset.kw;
        els.keywordInput.value = kw;
        doSearch(kw);
      });
    });

    try { feather.replace(); } catch(e) {}
  }

  // ── APPS LIST ─────────────────────────────────────────────────────
  function renderApps(apps) {
    const sorted = sortApps([...apps]);
    $('appsCount').textContent = apps.length;

    els.appsList.innerHTML = sorted.map((app, idx) => {
      const rank    = app.rank || idx + 1;
      const isTop3  = rank <= 3;
      const rating  = app.rating || 0;
      const reviews = API.formatNumber(app.ratingCount || app.reviews || 0);
      const price   = app.isFree ? 'Free' : `$${app.price.toFixed(2)}`;
      const priceClass = app.isFree ? 'free-price' : '';
      const iapTag  = app.hasIAP ? '<span class="app-tag iap">In-App Purchases</span>' : '';
      const platformTag = `<span class="app-tag">${platformLabel(app.platform || state.platform)}</span>`;
      const catTag = `<span class="app-tag">${escHtml(app.category || 'App')}</span>`;

      const iconHtml = app.icon
        ? `<img class="app-icon" src="${escHtml(app.icon)}" alt="${escHtml(app.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const placeholderHtml = `<div class="app-icon-placeholder" ${app.icon ? 'style="display:none"' : ''}>
        ${appEmoji(app.category)}
      </div>`;

      return `
      <div class="app-row" data-appidx="${idx}">
        <div class="app-rank ${isTop3 ? 'top3' : ''}">#${rank}</div>
        ${iconHtml}
        ${placeholderHtml}
        <div class="app-info">
          <div class="app-name">${escHtml(app.name)}</div>
          <div class="app-dev">${escHtml(app.developer)}</div>
          <div class="app-tags">
            ${platformTag}${catTag}${iapTag}
          </div>
        </div>
        <div class="app-stats">
          <div class="app-rating">
            <span class="stars">${API.renderStars(rating)}</span>
            ${rating > 0 ? rating.toFixed(1) : '—'}
          </div>
          <div class="app-reviews">${reviews} ratings</div>
          <div class="app-price ${priceClass}">${price}</div>
        </div>
      </div>`;
    }).join('');

    // Bind click
    $$('#appsList .app-row').forEach((row, idx) => {
      row.addEventListener('click', () => openAppModal(sorted[idx]));
    });
  }

  function sortApps(apps) {
    if (state.appSort === 'rating')  return apps.sort((a, b) => (b.rating || 0)  - (a.rating || 0));
    if (state.appSort === 'reviews') return apps.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
    return apps.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  // ── APP MODAL ─────────────────────────────────────────────────────
  function openAppModal(app) {
    const rating   = app.rating || 0;
    const reviews  = API.formatNumber(app.ratingCount || 0);
    const price    = app.isFree ? 'Free' : `$${app.price?.toFixed(2) || '0.00'}`;
    const size     = app.size || '—';
    const version  = app.version || '—';
    const minOS    = app.minOS || '—';
    const updated  = app.updateDate ? app.updateDate.slice(0, 10) : '—';
    const desc     = app.description || 'No description available.';

    const iconHtml = app.icon
      ? `<img class="modal-app-icon" src="${escHtml(app.icon)}" alt="${escHtml(app.name)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
      : '';
    const phHtml = `<div class="modal-app-icon-placeholder" ${app.icon ? 'style="display:none"' : ''}>${appEmoji(app.category)}</div>`;

    const relatedKws = generateAppKeywords(app.name, app.category);

    els.modalContent.innerHTML = `
    <div class="modal-body">
      <div class="modal-app-header">
        ${iconHtml}${phHtml}
        <div>
          <div class="modal-app-title">${escHtml(app.name)}</div>
          <div class="modal-app-dev">${escHtml(app.developer)}</div>
          <div class="modal-app-cats">
            <span class="modal-cat">${escHtml(app.category || 'App')}</span>
            <span class="modal-cat">${platformLabel(app.platform || state.platform)}</span>
            ${app.isFree ? '<span class="modal-cat" style="background:var(--green-light);color:var(--green)">Free</span>' : `<span class="modal-cat" style="background:var(--yellow-light);color:var(--yellow)">${price}</span>`}
          </div>
        </div>
      </div>

      <div class="modal-stats-row">
        <div class="modal-stat">
          <div class="modal-stat-label">Rating</div>
          <div class="modal-stat-val text-yellow">${rating > 0 ? rating.toFixed(1) : '—'}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Reviews</div>
          <div class="modal-stat-val">${reviews}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Size</div>
          <div class="modal-stat-val">${size}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Version</div>
          <div class="modal-stat-val font-mono">${version}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Min OS</div>
          <div class="modal-stat-val">${minOS}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Updated</div>
          <div class="modal-stat-val">${updated}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Price</div>
          <div class="modal-stat-val ${app.isFree ? 'text-green' : 'text-yellow'}">${price}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">In-App Purch.</div>
          <div class="modal-stat-val ${app.hasIAP ? 'text-blue' : 'text-muted'}">${app.hasIAP ? 'Yes' : 'No'}</div>
        </div>
      </div>

      <div class="modal-section-title">Description</div>
      <div class="modal-desc">${escHtml(desc)}${desc.length >= 400 ? '…' : ''}</div>

      <div class="modal-section-title">Likely Keywords</div>
      <div class="modal-kw-list">
        ${relatedKws.map(k => `<button class="modal-kw-chip" data-kw="${escHtml(k)}">${escHtml(k)}</button>`).join('')}
      </div>

      ${app.url ? `
      <div style="margin-top:20px">
        <a href="${escHtml(app.url)}" target="_blank" rel="noopener noreferrer"
          style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:.85rem;font-weight:500">
          View in Store ↗
        </a>
      </div>` : ''}
    </div>`;

    $$('.modal-kw-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        closeModal();
        els.keywordInput.value = chip.dataset.kw;
        doSearch(chip.dataset.kw);
      });
    });

    els.appModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    try { feather.replace(); } catch(e) {}
  }

  function closeModal() {
    els.appModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ── TRENDING VIEW ─────────────────────────────────────────────────
  function renderTrendingView() {
    const trending = API.getTrending(state.platform, state.country);
    els.trendingGrid.innerHTML = trending.map(item => {
      const diff = API.difficultyLabel(item.difficulty);
      return `
      <div class="trending-card" data-kw="${escHtml(item.keyword)}">
        <div class="trending-rank">#${item.rank} Trending</div>
        <div class="trending-kw">${escHtml(item.keyword)}</div>
        <div class="trending-meta">
          <div class="trending-stat">
            <span class="trending-stat-label">Volume</span>
            <span class="trending-stat-val">${API.formatVolume(item.volume)}</span>
          </div>
          <div class="trending-stat">
            <span class="trending-stat-label">Difficulty</span>
            <span class="trending-stat-val ${diff.cls}">${item.difficulty}/100</span>
          </div>
          <div class="trending-stat">
            <span class="trending-stat-label">Chance</span>
            <span class="trending-stat-val text-green">${item.chance}/100</span>
          </div>
        </div>
        <div class="trending-spike">▲ +${item.spike}% this week</div>
      </div>`;
    }).join('');

    $$('.trending-card').forEach(card => {
      card.addEventListener('click', () => {
        const kw = card.dataset.kw;
        els.keywordInput.value = kw;
        switchView('search');
        $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));
        doSearch(kw);
      });
    });
  }

  // ── COMPETITOR SEARCH ─────────────────────────────────────────────
  async function doCompetitorSearch() {
    const q = els.competitorInput.value.trim();
    if (!q) { showToast('Enter an app name', 'error'); return; }
    showToast('Analyzing competitor…', 'info');

    try {
      const res = await API.searchKeyword(q, state.platform, state.country);
      if (res.apps.length === 0) { showToast('No results found', 'error'); return; }

      const app = res.apps[0];
      const kws = generateAppKeywords(app.name, app.category);

      els.competitorResults.innerHTML = `
        <div class="section-card" style="max-width:700px">
          <div class="section-header"><h3>Keyword Portfolio — ${escHtml(app.name)}</h3></div>
          <div class="modal-kw-list">
            ${kws.map(k => `<button class="modal-kw-chip" data-kw="${escHtml(k)}">${escHtml(k)}</button>`).join('')}
          </div>
        </div>`;

      $$('.competitor-results .modal-kw-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          els.keywordInput.value = chip.dataset.kw;
          switchView('search');
          $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));
          doSearch(chip.dataset.kw);
        });
      });

      els.competitorResults.classList.remove('hidden');
    } catch (e) {
      showToast('Competitor analysis failed', 'error');
    }
  }

  // ── HISTORY ───────────────────────────────────────────────────────
  function addToHistory(keyword) {
    const existing = state.history.findIndex(h => h.keyword === keyword && h.platform === state.platform);
    if (existing >= 0) state.history.splice(existing, 1);
    state.history.unshift({
      keyword,
      platform: state.platform,
      country:  state.country,
      date:     new Date().toISOString(),
      volume:   state.results?.metrics?.volume || 0,
    });
    state.history = state.history.slice(0, 50);
    localStorage.setItem('kiq_history', JSON.stringify(state.history));
    renderHistoryView();
  }

  function renderHistoryView() {
    if (!state.history.length) {
      els.historyList.innerHTML = '<div class="empty-list">No search history yet. Start searching!</div>';
      return;
    }
    els.historyList.innerHTML = state.history.map((item, i) => `
      <div class="history-row" data-idx="${i}">
        <div class="history-kw">${escHtml(item.keyword)}</div>
        <div class="history-meta">
          <span>${platformLabel(item.platform)}</span>
          <span>${item.country.toUpperCase()}</span>
          ${item.volume ? `<span>${API.formatVolume(item.volume)} vol</span>` : ''}
          <span>${timeAgo(item.date)}</span>
        </div>
        <button class="history-del" data-idx="${i}" title="Delete"><i data-feather="x"></i></button>
      </div>`).join('');

    $$('.history-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.history-del')) return;
        const item = state.history[+row.dataset.idx];
        els.keywordInput.value = item.keyword;
        // Set platform
        $$('.platform-btn').forEach(b => b.classList.toggle('active', b.dataset.platform === item.platform));
        state.platform = item.platform;
        state.country  = item.country;
        els.countrySelect.value = item.country;
        doSearch(item.keyword);
        switchView('search');
        $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));
      });
    });

    $$('.history-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = +btn.dataset.idx;
        state.history.splice(idx, 1);
        localStorage.setItem('kiq_history', JSON.stringify(state.history));
        renderHistoryView();
      });
    });

    try { feather.replace(); } catch(e) {}
  }

  // ── SAVED ─────────────────────────────────────────────────────────
  function persistSaved() {
    localStorage.setItem('kiq_saved', JSON.stringify(state.saved));
  }

  function renderSavedView() {
    if (!state.saved.length) {
      els.savedList.innerHTML = '<div class="empty-list">No saved keywords. Click the bookmark icon when viewing results.</div>';
      return;
    }
    els.savedList.innerHTML = state.saved.map((item, i) => `
      <div class="saved-row" data-idx="${i}">
        <div class="saved-kw">${escHtml(item.keyword)}</div>
        <div class="saved-meta">
          <span>${platformLabel(item.platform)}</span>
          <span>${item.country.toUpperCase()}</span>
          ${item.volume ? `<span>${API.formatVolume(item.volume)} vol</span>` : ''}
        </div>
        <button class="history-del" data-idx="${i}" title="Remove"><i data-feather="x"></i></button>
      </div>`).join('');

    $$('.saved-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.history-del')) return;
        const item = state.saved[+row.dataset.idx];
        els.keywordInput.value = item.keyword;
        $$('.platform-btn').forEach(b => b.classList.toggle('active', b.dataset.platform === item.platform));
        state.platform = item.platform;
        doSearch(item.keyword);
        switchView('search');
        $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));
      });
    });

    $$('.saved-row .history-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        state.saved.splice(+btn.dataset.idx, 1);
        persistSaved();
        renderSavedView();
      });
    });

    try { feather.replace(); } catch(e) {}
  }

  // ── EXPORT CSV ────────────────────────────────────────────────────
  function exportCSV() {
    if (!state.results) return;
    const { keyword, metrics, apps, related } = state.results;

    const rows = [
      ['KeywordsIQ Export'],
      [`Keyword: ${keyword}`, `Platform: ${state.platform}`, `Country: ${state.country}`],
      [],
      ['=== KEYWORD METRICS ==='],
      ['Volume', 'Difficulty', 'Chance', 'Competing Apps', 'CPI ($)', 'Trend (%)'],
      [metrics.volume, metrics.difficulty, metrics.chance, metrics.competing, metrics.cpi, metrics.trend],
      [],
      ['=== RELATED KEYWORDS ==='],
      ['Keyword', 'Volume', 'Difficulty', 'Chance', 'Trend (%)'],
      ...related.map(r => [r.keyword, r.volume, r.difficulty, r.chance, r.trend]),
      [],
      ['=== TOP APPS ==='],
      ['Rank', 'Name', 'Developer', 'Category', 'Rating', 'Reviews', 'Price', 'Has IAP', 'Version'],
      ...apps.map(a => [a.rank, a.name, a.developer, a.category, a.rating, a.ratingCount, a.isFree ? 'Free' : `$${a.price}`, a.hasIAP ? 'Yes' : 'No', a.version]),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `keywordsiq_${keyword.replace(/\s+/g,'_')}_${state.platform}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  }

  // ── TOAST ─────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    const div   = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<i data-feather="${icons[type] || 'info'}"></i> ${escHtml(msg)}`;
    els.toastContainer.appendChild(div);
    try { feather.replace(); } catch(e) {}
    setTimeout(() => div.remove(), 3500);
  }

  // ── HELPERS ───────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function platformLabel(p) {
    return { ios:'iOS', ipad:'iPad', macos:'macOS', android:'Android' }[p] || p;
  }

  function appEmoji(category) {
    const map = {
      'Photo & Video': '📸', 'Photography': '📷', 'Entertainment': '🎬',
      'Music': '🎵', 'Games': '🎮', 'Productivity': '⚡', 'Utilities': '🔧',
      'Finance': '💰', 'Health & Fitness': '💪', 'Education': '📚',
      'Social Networking': '💬', 'Travel': '✈️', 'Food & Drink': '🍔',
      'News': '📰', 'Shopping': '🛍️', 'Weather': '🌤️', 'Sports': '⚽',
      'Navigation': '🗺️', 'Lifestyle': '✨', 'Business': '💼',
      'Medical': '🏥', 'Reference': '📖', 'Developer Tools': '🛠️',
    };
    return map[category] || '📱';
  }

  function generateAppKeywords(name, category) {
    const nameParts = name.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).filter(w => w.length > 2);
    const catKws = {
      'Photo & Video': ['photo editor','video editor','camera filter','selfie app'],
      'Photography':   ['photo editor','camera app','picture editor','photo filter'],
      'Entertainment': ['streaming app','video player','movies app','watch online'],
      'Music':         ['music player','spotify alternative','mp3 player','music app'],
      'Productivity':  ['todo app','task manager','note taking','productivity tools'],
      'Utilities':     ['utility app','tools app','file manager','system tools'],
      'Health & Fitness': ['fitness tracker','workout app','calorie counter','step counter'],
      'Education':     ['learning app','language learning','study app','flashcards'],
      'Finance':       ['budget app','expense tracker','money manager','banking app'],
    };
    const base = catKws[category] || [`${(name||'').toLowerCase().slice(0,20)} app`];
    const extra = nameParts.slice(0, 3).map(w => `${w} app`);
    return [...new Set([...base, ...extra])].slice(0, 10);
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  }

  // ── BOOT ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
