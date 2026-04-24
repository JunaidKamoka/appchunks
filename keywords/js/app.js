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
    topChartsList:  $('topChartsList'),
    competitorInput:$('competitorInput'),
    competitorSearchBtn: $('competitorSearchBtn'),
    competitorResults: $('competitorResults'),
    historyList:    $('historyList'),
    savedList:      $('savedList'),
    trendingPlatformLabel: $('trendingPlatformLabel'),
    generateAsoBtn: $('generateAsoBtn'),
    asoGeneratorContent: $('asoGeneratorContent'),
    asoTitles:      $('asoTitles'),
    asoSubtitles:   $('asoSubtitles'),
    asoKeywordField:$('asoKeywordField'),
    asoDescriptions:$('asoDescriptions'),
    sidebarBackdrop:$('sidebarBackdrop'),
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
      if (currentView() === 'trending') renderTrendingView();
    });

    // Top Charts category filter
    const tcCatSel = $('tcCategorySelect');
    if (tcCatSel) {
      tcCatSel.addEventListener('change', () => {
        _tcGenre = tcCatSel.value;
        renderTrendingView();
      });
    }

    // Sidebar nav
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.dataset.view;
        switchView(view);
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        if (window.innerWidth <= 900) closeSidebar();
      });
    });

    // Sidebar toggle (mobile)
    els.sidebarToggle.addEventListener('click', () => {
      const isOpen = els.sidebar.classList.toggle('open');
      els.sidebarBackdrop.classList.toggle('visible', isOpen);
      document.body.classList.toggle('sidebar-open', isOpen);
    });
    els.sidebarBackdrop.addEventListener('click', closeSidebar);

    // Close sidebar on swipe-left
    let touchStartX = 0;
    els.sidebar.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    els.sidebar.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx < -60) closeSidebar();
    }, { passive: true });

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

    // ASO Generator
    els.generateAsoBtn.addEventListener('click', generateAndRenderASO);
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
    // no-op: platform shown in topbar switcher
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

    // Reset ASO generator
    els.asoGeneratorContent.classList.add('hidden');

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
  let suggestAbort = null;

  function onKeywordInput() {
    clearTimeout(suggestTimeout);
    const val = els.keywordInput.value.trim();
    if (!val) { els.suggestions.innerHTML = ''; return; }

    suggestTimeout = setTimeout(async () => {
      try {
        const hints = await API.fetchSearchHints(val, state.country);
        // Ignore stale result if input changed
        if (els.keywordInput.value.trim() !== val) return;
        renderSuggestions(hints.length ? hints : staticSuggestions(val));
      } catch (e) {
        renderSuggestions(staticSuggestions(val));
      }
    }, 250);
  }

  function renderSuggestions(suggestions) {
    els.suggestions.innerHTML = suggestions
      .map(s => `<button class="suggestion-chip">${escHtml(s)}</button>`)
      .join('');
    $$('#suggestions .suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        els.keywordInput.value = chip.textContent;
        els.suggestions.innerHTML = '';
        doSearch(chip.textContent);
      });
    });
  }

  function staticSuggestions(base) {
    const mods = ['free','pro','best','2025','for beginners','advanced','no ads','offline'];
    return mods.map(m => `${base} ${m}`).slice(0, 6);
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

      const revenue = API.estimateAppRevenue(app, app.platform || state.platform);

      const iconHtml = app.icon
        ? `<img class="app-icon" src="${escHtml(app.icon)}" alt="${escHtml(app.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const placeholderHtml = `<div class="app-icon-placeholder" ${app.icon ? 'style="display:none"' : ''}>
        ${appEmoji(app.category)}
      </div>`;

      const revModelIcon = revenue.revenueModel === 'paid' ? '💎' : revenue.revenueModel === 'freemium' ? '🔓' : '📢';

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
        <div class="app-revenue">
          <div class="app-revenue-val">${API.formatRevenue(revenue.monthlyRevenue)}<span class="app-revenue-period">/mo</span></div>
          <div class="app-revenue-downloads">${API.formatNumber(revenue.monthlyDownloads)} downloads/mo</div>
          <div class="app-revenue-model">${revModelIcon} ${revenue.revenueModel}</div>
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
  async function openAppModal(app) {
    // Show modal immediately with search-result data, then enrich via Lookup API
    els.appModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');

    renderModalContent(app);

    // Enrich with fresh data from Lookup API (non-blocking)
    if (app.id && app.platform !== 'android') {
      try {
        const fresh = await API.lookupById(app.id, state.country);
        if (fresh) {
          fresh.rank = app.rank;
          renderModalContent(fresh);
        }
      } catch (e) { /* keep search-result data */ }
    }

    // Load developer's other apps (non-blocking)
    if (app.id && app.platform !== 'android') {
      loadDeveloperApps(app);
    }
  }

  function renderModalContent(app) {
    const rating   = app.rating || 0;
    const reviews  = API.formatNumber(app.ratingCount || 0);
    const price    = app.isFree ? 'Free' : `$${app.price?.toFixed(2) || '0.00'}`;
    const size     = app.size || '—';
    const version  = app.version || '—';
    const minOS    = app.minOS || '—';
    const updated  = app.updateDate ? app.updateDate.slice(0, 10) : '—';
    const released = app.releaseDate ? app.releaseDate.slice(0, 10) : '—';
    const desc     = app.fullDescription || app.description || 'No description available.';
    const revenue  = API.estimateAppRevenue(app, app.platform || state.platform);
    const bundleId = app.bundleId || '—';
    const langCount = (app.languages && app.languages.length) || 0;

    const iconHtml = app.icon
      ? `<img class="modal-app-icon" src="${escHtml(app.icon)}" alt="${escHtml(app.name)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
      : '';
    const phHtml = `<div class="modal-app-icon-placeholder" ${app.icon ? 'style="display:none"' : ''}>${appEmoji(app.category)}</div>`;

    const relatedKws = generateAppKeywords(app.name, app.category);

    const screenshotHtml = (app.screenshots && app.screenshots.length > 0) ? `
      <div class="modal-section-title">Screenshots</div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px">
        ${app.screenshots.slice(0, 5).map(s => `<img src="${escHtml(s)}" style="height:180px;border-radius:8px;flex-shrink:0" loading="lazy" />`).join('')}
      </div>` : '';

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
          <div class="modal-stat-label">Released</div>
          <div class="modal-stat-val">${released}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Price</div>
          <div class="modal-stat-val ${app.isFree ? 'text-green' : 'text-yellow'}">${price}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Languages</div>
          <div class="modal-stat-val">${langCount > 0 ? langCount : '—'}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Bundle ID</div>
          <div class="modal-stat-val font-mono" style="font-size:.65rem;word-break:break-all">${escHtml(bundleId)}</div>
        </div>
      </div>

      <div class="modal-section-title">Estimated Revenue</div>
      <div class="modal-revenue-grid">
        <div class="modal-revenue-card">
          <div class="modal-revenue-label">Monthly Revenue</div>
          <div class="modal-revenue-val text-green">${API.formatRevenue(revenue.monthlyRevenue)}</div>
        </div>
        <div class="modal-revenue-card">
          <div class="modal-revenue-label">Annual Revenue</div>
          <div class="modal-revenue-val text-green">${API.formatRevenue(revenue.annualRevenue)}</div>
        </div>
        <div class="modal-revenue-card">
          <div class="modal-revenue-label">Daily Downloads</div>
          <div class="modal-revenue-val">${API.formatNumber(revenue.dailyDownloads)}</div>
        </div>
        <div class="modal-revenue-card">
          <div class="modal-revenue-label">Monthly Downloads</div>
          <div class="modal-revenue-val">${API.formatNumber(revenue.monthlyDownloads)}</div>
        </div>
        <div class="modal-revenue-card">
          <div class="modal-revenue-label">Revenue Model</div>
          <div class="modal-revenue-val" style="text-transform:capitalize">${revenue.revenueModel}</div>
        </div>
      </div>

      ${screenshotHtml}

      <div class="modal-section-title">Description</div>
      <div class="modal-desc">${escHtml(desc.length > 600 ? desc.slice(0, 600) + '…' : desc)}</div>

      <div class="modal-section-title">Likely Keywords</div>
      <div class="modal-kw-list">
        ${relatedKws.map(k => `<button class="modal-kw-chip" data-kw="${escHtml(k)}">${escHtml(k)}</button>`).join('')}
      </div>

      <div id="devAppsSection"></div>

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

    try { feather.replace(); } catch(e) {}
  }

  async function loadDeveloperApps(app) {
    try {
      if (!app.artistId) return;
      const devApps = await API.lookupDeveloper(app.artistId, state.country);
      const others = devApps.filter(a => String(a.id) !== String(app.id)).slice(0, 10);
      const section = document.getElementById('devAppsSection');
      if (!section || others.length === 0) return;

      section.innerHTML = `
        <div class="modal-section-title">More by ${escHtml(app.developer)} (${others.length})</div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px">
          ${others.map(a => `
            <div class="dev-app-card" data-appid="${escHtml(a.id)}" style="flex-shrink:0;width:90px;text-align:center;cursor:pointer">
              ${a.icon ? `<img src="${escHtml(a.icon)}" style="width:50px;height:50px;border-radius:12px;margin-bottom:4px" loading="lazy" />` : `<div style="width:50px;height:50px;border-radius:12px;background:var(--bg-card);margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font-size:1.3rem">${appEmoji(a.category)}</div>`}
              <div style="font-size:.7rem;color:var(--text-primary);line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(a.name)}</div>
            </div>
          `).join('')}
        </div>`;

      section.querySelectorAll('.dev-app-card').forEach((card, i) => {
        card.addEventListener('click', () => openAppModal(others[i]));
      });
    } catch (e) {
      // Developer lookup not available (e.g. trackId != artistId)
    }
  }

  function closeModal() {
    els.appModal.classList.add('hidden');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
  }

  // ── ASO METADATA GENERATOR ──────────────────────────────────────
  function generateAndRenderASO() {
    if (!state.results) {
      showToast('Run a keyword search first', 'error');
      return;
    }

    const { keyword, related, apps } = state.results;
    const aso = API.generateASOMetadata(keyword, related, apps);

    // Render Titles
    els.asoTitles.innerHTML = aso.titles.map(t => `
      <div class="aso-suggestion-item">
        <div class="aso-suggestion-text">${escHtml(t)}</div>
        <div class="aso-suggestion-meta">
          <span class="aso-char-count ${t.length > 30 ? 'over-limit' : ''}">${t.length}/30 chars</span>
          <button class="aso-copy-btn" data-copy="${escHtml(t)}" title="Copy">
            <i data-feather="copy"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Render Subtitles
    els.asoSubtitles.innerHTML = aso.subtitles.map(s => `
      <div class="aso-suggestion-item">
        <div class="aso-suggestion-text">${escHtml(s)}</div>
        <div class="aso-suggestion-meta">
          <span class="aso-char-count ${s.length > 30 ? 'over-limit' : ''}">${s.length}/30 chars</span>
          <button class="aso-copy-btn" data-copy="${escHtml(s)}" title="Copy">
            <i data-feather="copy"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Render Keyword Field
    els.asoKeywordField.innerHTML = `
      <div class="aso-suggestion-item">
        <div class="aso-suggestion-text font-mono" style="font-size:0.82rem">${escHtml(aso.keywordList)}</div>
        <div class="aso-suggestion-meta">
          <span class="aso-char-count ${aso.keywordList.length > 100 ? 'over-limit' : ''}">${aso.keywordList.length}/100 chars</span>
          <button class="aso-copy-btn" data-copy="${escHtml(aso.keywordList)}" title="Copy">
            <i data-feather="copy"></i>
          </button>
        </div>
      </div>
    `;

    // Render Descriptions
    els.asoDescriptions.innerHTML = aso.descriptions.map((d, i) => `
      <div class="aso-description-item">
        <div class="aso-desc-label">Option ${i + 1}</div>
        <div class="aso-desc-text">${escHtml(d).replace(/\n/g, '<br>')}</div>
        <div class="aso-suggestion-meta">
          <span class="aso-char-count">${d.length} chars</span>
          <button class="aso-copy-btn" data-copy-desc="${i}" title="Copy">
            <i data-feather="copy"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Store descriptions for copy
    els.asoDescriptions._descriptions = aso.descriptions;

    // Show the content
    els.asoGeneratorContent.classList.remove('hidden');
    feather.replace();

    // Bind copy buttons
    $$('.aso-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        let text = btn.dataset.copy;
        if (btn.dataset.copyDesc !== undefined) {
          text = els.asoDescriptions._descriptions[+btn.dataset.copyDesc];
        }
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!', 'success');
          }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Copied to clipboard!', 'success');
          });
        }
      });
    });

    // Scroll to the section
    $('asoGeneratorCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('ASO metadata generated!', 'success');
  }

  // ── TOP CHARTS VIEW ────────────────────────────────────────────────
  let _tcGenre = '';

  async function renderTrendingView() {
    const listEl = $('topChartsList');
    const updatedEl = $('tcUpdated');
    listEl.innerHTML = `<div class="tc-loading"><div class="spinner"></div>Loading live charts…</div>`;

    // Update title based on selected category
    const titleEl = $('tcTitle');
    if (titleEl) {
      const catSel = $('tcCategorySelect');
      const catName = catSel ? catSel.options[catSel.selectedIndex]?.text : '';
      if (!_tcGenre || catName === 'Top Overall') {
        titleEl.textContent = 'Top Apps & Games';
      } else {
        titleEl.textContent = `Top ${catName} Apps`;
      }
    }

    try {
      const data = await API.getTopCharts(state.platform, state.country, _tcGenre);
      if (data.unavailable) {
        listEl.innerHTML = `<div class="tc-loading">${data.reason}<br><span style="font-size:.8rem;margin-top:8px;display:block">Switch to iOS or iPad for live chart data.</span></div>`;
        if (updatedEl) updatedEl.textContent = '';
        return;
      }
      renderTopChartsColumns(data);
      if (updatedEl && data.updated) {
        const mins = Math.round((Date.now() - new Date(data.updated).getTime()) / 60000);
        updatedEl.textContent = mins < 2 ? 'Updated just now' : `Updated ${mins} min ago`;
      }
    } catch (e) {
      listEl.innerHTML = `<div class="tc-loading">Failed to load charts. Please try again.</div>`;
    }
  }

  function renderTopChartsColumns(data) {
    const listEl = $('topChartsList');
    const cols = [
      { title: 'Free',     apps: data.topfree || [] },
      { title: 'Paid',     apps: data.toppaid || [] },
      { title: 'Grossing', apps: data.topgrossing || [] },
    ];

    listEl.innerHTML = `
      <div class="tc-columns">
        ${cols.map(col => `
          <div class="tc-col">
            <div class="tc-col-title">${col.title}</div>
            <div class="tc-col-list">
              ${col.apps.length === 0
                ? '<div class="tc-empty">No data available</div>'
                : col.apps.map(app => renderChartRow(app, col.title)).join('')
              }
            </div>
          </div>
        `).join('')}
      </div>`;

    // Bind clicks
    $$('.tc-row').forEach(row => {
      row.addEventListener('click', async () => {
        const appId = row.dataset.appid;
        if (appId) {
          try {
            const app = await API.lookupById(appId, state.country);
            if (app) { openAppModal(app); return; }
          } catch(e) {}
        }
        const name = row.dataset.appname;
        if (name) {
          els.keywordInput.value = name;
          switchView('search');
          $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === 'search'));
          doSearch(name);
        }
      });
    });
  }

  function renderChartRow(app, colTitle) {
    let priceHtml = '';
    if (app.price > 0) {
      priceHtml = `<span class="tc-price">$${app.price.toFixed(2)}</span>`;
    } else {
      priceHtml = `<span class="tc-price tc-free">Free</span>`;
    }

    return `
    <div class="tc-row" data-appid="${escHtml(app.id)}" data-appname="${escHtml(app.name)}">
      <span class="tc-rank">${app.rank}.</span>
      ${app.icon
        ? `<img class="tc-icon" src="${escHtml(app.icon)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
        : ''}
      <div class="tc-icon-ph" ${app.icon ? 'style="display:none"' : ''}>${appEmoji(app.category)}</div>
      <div class="tc-info">
        <div class="tc-name">${escHtml(app.name)}</div>
        <div class="tc-dev">${priceHtml} · ${escHtml(app.developer)}</div>
      </div>
    </div>`;
  }

  // ── COMPETITOR SEARCH ─────────────────────────────────────────────
  async function doCompetitorSearch() {
    const q = els.competitorInput.value.trim();
    if (!q) { showToast('Enter an app name or bundle ID', 'error'); return; }
    showToast('Analyzing competitor…', 'info');

    try {
      let app = null;

      // Detect bundle ID (e.g. "com.example.app") or numeric iTunes ID
      if (/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/i.test(q)) {
        app = await API.lookupByBundleId(q, state.country);
      } else if (/^\d{6,}$/.test(q)) {
        app = await API.lookupById(q, state.country);
      }

      // Fallback to keyword search
      if (!app) {
        const res = await API.searchKeyword(q, state.platform, state.country);
        if (res.apps.length === 0) { showToast('No results found', 'error'); return; }
        app = res.apps[0];
      }
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
      ['Rank', 'Name', 'Developer', 'Category', 'Rating', 'Reviews', 'Price', 'Has IAP', 'Version', 'Est. Monthly Revenue', 'Est. Monthly Downloads', 'Revenue Model'],
      ...apps.map(a => {
        const rev = API.estimateAppRevenue(a, a.platform || state.platform);
        return [a.rank, a.name, a.developer, a.category, a.rating, a.ratingCount, a.isFree ? 'Free' : `$${a.price}`, a.hasIAP ? 'Yes' : 'No', a.version, `$${rev.monthlyRevenue}`, rev.monthlyDownloads, rev.revenueModel];
      }),
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

  // ── SIDEBAR CLOSE ─────────────────────────────────────────────────
  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarBackdrop.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
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

  // ── CURSOR GLOW TRACKING ────────────────────────────────────────
  function initGlowTracking() {
    document.addEventListener('mousemove', e => {
      const targets = document.querySelectorAll('.metric-card, .app-row');
      targets.forEach(card => {
        const r = card.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top && e.clientY <= r.bottom) {
          card.style.setProperty('--glow-x', (e.clientX - r.left) + 'px');
          card.style.setProperty('--glow-y', (e.clientY - r.top) + 'px');
        }
      });
    });
  }

  // ── BOOT ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initGlowTracking();
  });

})();
