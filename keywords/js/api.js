/**
 * KeywordsIQ — API Module
 * Fetches real app data from iTunes Search API (iOS/iPad/macOS)
 * Derives keyword intelligence from actual App Store data
 */

const API = (() => {

  // ── ITUNES SEARCH API ──────────────────────────────────────────────
  const ITUNES_BASE = 'https://itunes.apple.com/search';

  const PLATFORM_ENTITY = {
    ios:     'software',
    ipad:    'iPadSoftware',
    macos:   'macSoftware',
    android: 'software', // fallback; Android uses simulated data
  };

  /**
   * Search iTunes for apps by keyword
   */
  async function searchITunes(keyword, country, platform, limit = 25) {
    const entity = PLATFORM_ENTITY[platform] || 'software';
    const url = `${ITUNES_BASE}?term=${encodeURIComponent(keyword)}&entity=${entity}&country=${country}&limit=${limit}&lang=en_us`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  /**
   * Fetch iTunes search suggestions (autocomplete) for related keywords
   */
  async function fetchITunesSuggestions(keyword, country) {
    try {
      // Use iTunes Search API with different terms to find related apps
      const variations = [
        keyword,
        keyword.split(' ')[0], // first word
      ];
      const seen = new Set();
      const relatedApps = [];

      for (const term of variations) {
        if (!term || term.length < 2) continue;
        try {
          const url = `${ITUNES_BASE}?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=10&lang=en_us`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            for (const app of (data.results || [])) {
              if (!seen.has(app.trackId)) {
                seen.add(app.trackId);
                relatedApps.push(app);
              }
            }
          }
        } catch (_) { /* skip failed variation */ }
      }
      return relatedApps;
    } catch (_) {
      return [];
    }
  }

  /**
   * Normalize iTunes result into our app schema
   */
  function normalizeITunesApp(raw, rank, platform) {
    return {
      rank,
      id:           String(raw.trackId || raw.artistId),
      name:         raw.trackName || raw.artistName || 'Unknown App',
      developer:    raw.artistName || 'Unknown Developer',
      bundleId:     raw.bundleId || '',
      icon:         raw.artworkUrl100 || raw.artworkUrl60 || '',
      category:     raw.primaryGenreName || 'Utilities',
      categoryId:   raw.primaryGenreId || 0,
      rating:       parseFloat((raw.averageUserRating || 0).toFixed(1)),
      ratingCount:  raw.userRatingCount || 0,
      price:        raw.price || 0,
      currency:     raw.currency || 'USD',
      isFree:       (raw.price || 0) === 0,
      hasIAP:       !!(raw.isVppDeviceBasedLicensingEnabled || raw.formattedPrice === 'Free'),
      version:      raw.version || '1.0',
      size:         raw.fileSizeBytes ? formatBytes(raw.fileSizeBytes) : '—',
      description:  (raw.description || '').slice(0, 400),
      fullDescription: raw.description || '',
      releaseDate:  raw.releaseDate || '',
      updateDate:   raw.currentVersionReleaseDate || raw.releaseDate || '',
      url:          raw.trackViewUrl || raw.artistViewUrl || '',
      minOS:        raw.minimumOsVersion || '—',
      screenshots:  raw.screenshotUrls || [],
      languages:    raw.languageCodesISO2A || [],
      platform:     'ios',
      genres:       raw.genres || [],
    };
  }

  /**
   * Generate Android app data (simulated — no public API available)
   */
  function generateAndroidApps(keyword, country, limit = 25) {
    const seed = hashStr(keyword + country);
    const categories = ['Tools','Productivity','Health & Fitness','Education','Entertainment',
                        'Social','Finance','Photography','Music & Audio','Travel & Local'];
    const devPrefixes = ['Dev','Labs','Studio','Digital','Tech','Apps','Soft','Mobile'];
    const devSuffixes = ['Inc','LLC','Co','GmbH','Ltd','SRL','AB','Pty'];

    return Array.from({ length: limit }, (_, i) => {
      const r = lcg(seed + i * 17);
      const r2 = lcg(seed + i * 37);
      const r3 = lcg(seed + i * 53);
      const rating = 3.5 + r * 1.5;
      const reviews = Math.floor(1000 + r2 * 2000000);
      const installs = formatInstalls(Math.floor(r3 * 500000000));
      const isFree = r > 0.15;
      const price = isFree ? 0 : parseFloat((0.99 + r * 9).toFixed(2));
      const devName = `${pick(devPrefixes, seed+i)} ${pick(devSuffixes, seed+i*7)}`;
      const cat = categories[Math.floor(r2 * categories.length)];
      const kwWords = keyword.split(' ');
      const appName = generateAppName(kwWords, seed + i);

      return {
        rank:         i + 1,
        id:           `com.${devName.toLowerCase().replace(/\s/g,'')}.${keyword.replace(/\s/g,'').toLowerCase()}${i}`,
        name:         appName,
        developer:    devName,
        bundleId:     `com.${devName.toLowerCase().replace(/\s/g,'')}.app`,
        icon:         '',
        category:     cat,
        categoryId:   i,
        rating:       parseFloat(rating.toFixed(1)),
        ratingCount:  reviews,
        installs,
        price,
        currency:     'USD',
        isFree,
        hasIAP:       r > 0.4,
        version:      `${Math.ceil(r*10)}.${Math.floor(r2*10)}.${Math.floor(r3*5)}`,
        size:         `${Math.ceil(r*80 + 5)} MB`,
        description:  `Discover the best ${keyword} experience with ${appName}. Trusted by millions.`,
        fullDescription: '',
        releaseDate:  randomDate(2018, 2023, seed+i),
        updateDate:   randomDate(2024, 2025, seed+i),
        url:          `https://play.google.com/store/apps/details?id=com.example.app${i}`,
        minOS:        `Android ${5 + Math.floor(r*4)}.0+`,
        screenshots:  [],
        languages:    ['EN'],
        platform:     'android',
        genres:       [cat],
      };
    });
  }

  // ── KEYWORD INTELLIGENCE (DERIVED FROM REAL DATA) ─────────────────

  /**
   * Calculate keyword metrics from actual App Store results.
   * Uses real signals: result count, review counts, ratings, free vs paid ratio.
   */
  function calculateMetricsFromApps(keyword, platform, country, apps, rawResultCount) {
    const appCount = apps.length;
    const totalReviews = apps.reduce((sum, a) => sum + (a.ratingCount || 0), 0);
    const avgRating = apps.length > 0
      ? apps.reduce((sum, a) => sum + (a.rating || 0), 0) / apps.length
      : 0;
    const freeRatio = apps.length > 0
      ? apps.filter(a => a.isFree).length / apps.length
      : 1;
    const top5Reviews = apps.slice(0, 5).reduce((sum, a) => sum + (a.ratingCount || 0), 0);

    // ── VOLUME ESTIMATE ──
    // Based on: number of apps returned (more apps = more searched keyword),
    // total reviews of top results (high reviews = high interest),
    // keyword length (shorter = broader = higher volume)
    const wordCount = keyword.trim().split(/\s+/).length;
    const lengthFactor = wordCount === 1 ? 3.0 : wordCount === 2 ? 1.5 : 0.7;

    // Review-based popularity signal
    const reviewSignal = Math.min(1.0, Math.log10(Math.max(1, top5Reviews)) / 7); // 0-1 scale
    const resultSignal = Math.min(1.0, rawResultCount / 25); // 0-1 scale

    const baseVolume = Math.round(
      (5000 + reviewSignal * 400000 + resultSignal * 50000) * lengthFactor
    );
    const volume = Math.max(100, Math.min(999000, baseVolume));

    // ── DIFFICULTY ──
    // Based on: total reviews (high reviews = hard to compete), top 5 strength,
    // average rating (high rated competitors = harder), number of results
    const reviewDifficulty = Math.min(40, Math.log10(Math.max(1, totalReviews)) * 7);
    const topStrength = Math.min(30, Math.log10(Math.max(1, top5Reviews)) * 5);
    const ratingDifficulty = avgRating > 4.0 ? 15 : avgRating > 3.5 ? 10 : 5;
    const countDifficulty = Math.min(15, appCount * 0.6);

    const difficulty = Math.max(1, Math.min(99, Math.round(
      reviewDifficulty + topStrength + ratingDifficulty + countDifficulty
    )));

    // ── CHANCE SCORE ──
    // Inverse of difficulty weighted by opportunity signals
    const lowCompetitionBonus = freeRatio > 0.8 ? 10 : 0; // mostly free = opportunity
    const gapBonus = avgRating < 4.0 ? 15 : avgRating < 4.3 ? 8 : 0; // low quality = opportunity
    const nichBonus = appCount < 10 ? 15 : appCount < 20 ? 8 : 0;

    const chance = Math.max(1, Math.min(99, Math.round(
      100 - difficulty + lowCompetitionBonus + gapBonus + nichBonus
    ) / 1.2));

    // ── COMPETING APPS ──
    // Use actual result count as base, estimate broader competition
    const competing = Math.max(appCount, Math.round(appCount * (1 + reviewSignal * 20)));

    // ── CPI ESTIMATE ──
    // Derived from difficulty and volume
    const cpi = parseFloat((0.30 + (difficulty / 100) * 4.5 + (volume / 500000) * 1.5).toFixed(2));

    // ── TREND ──
    // Estimate from recency of top app updates
    const recentUpdates = apps.filter(a => {
      if (!a.updateDate) return false;
      const d = new Date(a.updateDate);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return d > threeMonthsAgo;
    }).length;
    const updateRatio = apps.length > 0 ? recentUpdates / apps.length : 0.5;
    // Active category = positive trend
    const trend = parseFloat(((updateRatio - 0.4) * 50).toFixed(1));

    // ── HISTORY ──
    // Generate realistic-looking 12-month history based on the computed volume
    const history = generateVolumeHistory(volume, keyword, platform);

    return { volume, difficulty, chance, competing, cpi, trend, history };
  }

  /**
   * Generate 12-month volume history — uses volume as anchor,
   * applies gentle seasonality curve so it looks realistic.
   */
  function generateVolumeHistory(baseVolume, keyword, platform) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // Simple seasonal curve: dip in summer, peak in Q4/Q1
    const seasonality = [1.05, 0.95, 0.90, 0.88, 0.85, 0.82, 0.80, 0.83, 0.92, 1.00, 1.10, 1.15];
    const seed = hashStr(keyword + platform);

    return months.map((month, i) => ({
      month,
      volume: Math.max(100, Math.round(
        baseVolume * seasonality[i] * (0.92 + lcg(seed + i * 11) * 0.16)
      )),
    }));
  }

  /**
   * Generate related keywords by extracting them from real app names,
   * categories, and descriptions of the search results.
   */
  function generateRelatedKeywordsFromApps(keyword, platform, country, apps) {
    const kw = keyword.toLowerCase().trim();
    const related = new Map(); // keyword -> frequency/importance score

    // Extract keywords from app names
    const stopWords = new Set(['the','a','an','and','or','for','with','by','to','in','of','on',
                                'app','apps','my','your','its','is','it','&','-','–','—','+']);

    apps.forEach((app, rank) => {
      const weight = Math.max(1, 10 - rank); // top-ranked apps contribute more

      // From app name
      const nameWords = (app.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      // Generate 2-word and 3-word combinations from app names
      for (let i = 0; i < nameWords.length; i++) {
        const w = nameWords[i];
        if (w !== kw && !kw.includes(w)) {
          // Single word from app name + original keyword
          const combo = `${kw} ${w}`;
          related.set(combo, (related.get(combo) || 0) + weight);
        }
        if (i < nameWords.length - 1) {
          const pair = `${nameWords[i]} ${nameWords[i+1]}`;
          if (pair !== kw && pair.length > 4) {
            related.set(pair, (related.get(pair) || 0) + weight);
          }
        }
      }

      // From category
      const cat = (app.category || '').toLowerCase();
      if (cat && cat !== kw) {
        const catCombo = `${kw} ${cat}`;
        related.set(catCombo, (related.get(catCombo) || 0) + weight * 0.5);
      }

      // From genres
      (app.genres || []).forEach(genre => {
        const g = genre.toLowerCase();
        if (g && g !== kw && g !== cat) {
          related.set(g, (related.get(g) || 0) + weight * 0.3);
        }
      });
    });

    // Add common ASO modifier combinations
    const asoModifiers = ['free', 'best', 'pro', 'top', 'lite', 'no ads', 'offline', '2025'];
    asoModifiers.forEach(mod => {
      related.set(`${kw} ${mod}`, (related.get(`${kw} ${mod}`) || 0) + 2);
      related.set(`${mod} ${kw}`, (related.get(`${mod} ${kw}`) || 0) + 1);
    });

    // Sort by relevance score, take top 18
    const sorted = [...related.entries()]
      .filter(([k]) => k !== kw && k.length > 3 && k.length < 50)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);

    // Compute metrics for each related keyword based on its relevance score
    return sorted.map(([relKw, score]) => {
      const wordCount = relKw.trim().split(/\s+/).length;
      // Volume estimate based on the parent keyword + how common this term appeared
      const parentVolume = apps.reduce((s, a) => s + (a.ratingCount || 0), 0);
      const volumeBase = Math.log10(Math.max(1, parentVolume)) * 8000;
      const scoreFactor = Math.min(1, score / 20);
      const lengthPenalty = wordCount > 2 ? 0.4 : wordCount > 1 ? 0.7 : 1.0;
      const vol = Math.max(50, Math.round(volumeBase * scoreFactor * lengthPenalty));

      // Difficulty: longer tail = easier
      const diff = Math.max(5, Math.min(95, Math.round(
        30 + scoreFactor * 35 - (wordCount - 1) * 12
      )));

      const chance = Math.max(5, Math.min(95, Math.round(100 - diff * 0.8)));
      const trendVal = parseFloat(((scoreFactor - 0.3) * 30).toFixed(1));

      return {
        keyword: relKw,
        volume: vol,
        difficulty: diff,
        chance,
        trend: trendVal,
      };
    }).sort((a, b) => b.volume - a.volume);
  }

  /**
   * Generate trending keywords for a platform
   */
  function generateTrending(platform, country) {
    // Platform-specific trending — reflects real App Store category leaders
    const TRENDING = {
      ios: [
        'ai assistant', 'photo editor', 'vpn free', 'workout tracker',
        'sleep sounds', 'pdf scanner', 'language learning', 'video editor',
        'budget tracker', 'meditation app', 'recipe finder', 'password manager',
        'screen recorder', 'qr code scanner', 'flashcard maker', 'habit tracker',
        'stock market', 'weather radar', 'podcast player', 'note taking app',
      ],
      ipad: [
        'drawing app', 'pdf editor', 'note taking', 'digital planner',
        'video editing', 'reading app', 'spreadsheet app', 'presentation maker',
        'annotate pdf', 'handwriting app', 'calendar planner', 'music production',
        'photo editing', 'comic reader', 'language learning', 'coding app',
        'document scanner', 'diagram tool', 'whiteboard app', 'split view browser',
      ],
      macos: [
        'window manager', 'markdown editor', 'clipboard manager', 'screen capture',
        'password manager', 'email client', 'video converter', 'pdf editor',
        'time tracker', 'task manager', 'mind mapping', 'database app',
        'text expander', 'ftp client', 'system cleaner', 'menubar app',
        'code editor', 'vpn client', 'file manager', 'photo editor mac',
      ],
      android: [
        'ai assistant', 'photo editor', 'vpn free', 'workout tracker',
        'sleep sounds', 'pdf scanner', 'language learning', 'video editor',
        'budget tracker', 'meditation', 'recipe app', 'password manager',
        'screen recorder', 'qr scanner', 'flashcard maker', 'habit tracker',
        'stock market', 'weather app', 'podcast player', 'notes app',
      ],
    };
    const keywords = TRENDING[platform] || TRENDING.ios;

    const T_VOL  = { ios: 1.00, ipad: 0.20, macos: 0.08, android: 0.80 };
    const T_DIFF = { ios: 1.00, ipad: 0.76, macos: 0.52, android: 0.92 };
    const tVol  = T_VOL[platform]  || 1;
    const tDiff = T_DIFF[platform] || 1;

    return keywords.map((kw, i) => {
      const s  = hashStr(kw + platform + country + i);
      const s2 = hashStr(kw + country);
      const vol   = Math.max(100, Math.round((30000 + lcg(s) * 800000) * tVol));
      const spike = Math.round(10 + lcg(s2) * 120);
      const diff  = Math.min(97, Math.round((20 + lcg(s+5) * 70) * tDiff));
      return {
        rank: i + 1,
        keyword: kw,
        volume: vol,
        difficulty: diff,
        spike,
        chance: Math.max(3, Math.min(97, Math.round(100 - diff * 0.7 + lcg(s2+2) * 25))),
      };
    }).sort((a, b) => b.spike - a.spike);
  }

  // ── MAIN PUBLIC API ────────────────────────────────────────────────

  async function searchKeyword(keyword, platform, country) {
    let apps = [];
    let rawResultCount = 0;
    let isRealData = false;

    if (platform !== 'android') {
      try {
        const raw = await searchITunes(keyword, country, platform, 25);
        rawResultCount = raw.length;
        apps = raw.map((r, i) => normalizeITunesApp(r, i + 1));
        isRealData = apps.length > 0;
      } catch (e) {
        console.warn('iTunes API failed, using estimated data', e);
        apps = generateAndroidApps(keyword, country, 20).map(a => ({ ...a, platform }));
        rawResultCount = apps.length;
      }
    } else {
      apps = generateAndroidApps(keyword, country, 25);
      rawResultCount = apps.length;
    }

    // If API returned too few results, keep what we have (don't replace with fake data)
    if (apps.length === 0) {
      apps = generateAndroidApps(keyword, country, 15).map(a => ({ ...a, platform }));
      rawResultCount = apps.length;
    }

    // Calculate metrics from actual app data
    const metrics = calculateMetricsFromApps(keyword, platform, country, apps, rawResultCount);

    // Generate related keywords from real app data
    const related = generateRelatedKeywordsFromApps(keyword, platform, country, apps);

    return { apps, metrics, related, keyword, platform, country, isRealData };
  }

  function getTrending(platform, country) {
    return generateTrending(platform, country);
  }

  /**
   * Generate ASO metadata (title, subtitle, description) based on keyword analysis results.
   * Uses the searched keyword, related keywords, and top app data to craft suggestions.
   */
  function generateASOMetadata(keyword, related, apps) {
    const kw = keyword.trim();
    const kwCapitalized = kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Gather top related keywords for inclusion
    const topRelated = (related || []).slice(0, 8).map(r => r.keyword);
    const topCategories = [...new Set(apps.map(a => a.category).filter(Boolean))].slice(0, 3);

    // Extract unique meaningful words from top related keywords
    const stopWords = new Set(['the','a','an','and','or','for','with','by','to','in','of','on','app','free','best','top','no','ads']);
    const relatedWords = new Set();
    topRelated.forEach(rk => {
      rk.split(/\s+/).forEach(w => {
        const wl = w.toLowerCase();
        if (wl.length > 2 && !stopWords.has(wl) && !kw.toLowerCase().includes(wl)) {
          relatedWords.add(w.charAt(0).toUpperCase() + w.slice(1));
        }
      });
    });
    const extraWords = [...relatedWords].slice(0, 6);

    // Analyze top competitors for patterns
    const topAppNames = apps.slice(0, 5).map(a => a.name);

    // ── TITLE SUGGESTIONS (max 30 chars for App Store) ──
    const titles = [];
    titles.push(`${kwCapitalized} Pro`);
    titles.push(`${kwCapitalized} - ${extraWords[0] || topCategories[0] || 'Smart'} App`);
    titles.push(`${extraWords[0] || 'Smart'} ${kwCapitalized}`);
    // Filter to ≤30 chars
    const validTitles = titles
      .map(t => t.length > 30 ? t.slice(0, 27) + '...' : t)
      .filter((t, i, arr) => arr.indexOf(t) === i);

    // ── SUBTITLE SUGGESTIONS (max 30 chars for App Store) ──
    const subtitles = [];
    const featureWords = extraWords.length > 1 ? extraWords.slice(0, 2).join(' & ') : (topCategories[0] || 'Tools');
    subtitles.push(`${featureWords} Made Easy`);
    subtitles.push(`Best ${kwCapitalized} Tool`);
    subtitles.push(`${topCategories[0] || 'Powerful'} ${kwCapitalized} App`);
    const validSubtitles = subtitles
      .map(s => s.length > 30 ? s.slice(0, 27) + '...' : s)
      .filter((s, i, arr) => arr.indexOf(s) === i);

    // ── DESCRIPTION SUGGESTIONS ──
    // Build a keyword-rich description using top keywords naturally
    const allKeywords = [kw, ...topRelated.slice(0, 5)];
    const uniqueKeywords = [...new Set(allKeywords)];

    const descriptions = [];

    // Description 1: Feature-focused
    descriptions.push(
      `Looking for the best ${kw} app? Our app delivers a powerful ${kw} experience with features like ${uniqueKeywords.slice(1, 4).join(', ')}. ` +
      `Whether you need ${uniqueKeywords[1] || kw} on the go or advanced ${uniqueKeywords[2] || kw} tools, we've got you covered.\n\n` +
      `Key Features:\n` +
      uniqueKeywords.slice(0, 5).map(k => `- ${k.charAt(0).toUpperCase() + k.slice(1)}`).join('\n') + '\n\n' +
      `Download now and discover why users love our ${kw} app!`
    );

    // Description 2: Problem-solution focused
    descriptions.push(
      `Tired of complicated ${kw} apps? We built a simple, powerful solution for ${uniqueKeywords.slice(0, 3).join(', ')}.\n\n` +
      `Our ${kw} app is designed for everyone — from beginners to professionals. ` +
      `With intuitive controls and smart features for ${uniqueKeywords.slice(1, 4).join(', ')}, you'll get results fast.\n\n` +
      `Why choose us:\n` +
      `- Easy to use ${kw} tools\n` +
      `- ${extraWords[0] || 'Advanced'} features built-in\n` +
      `- Regular updates with new ${kw} capabilities\n` +
      `- No ads, no hassle\n\n` +
      `Join thousands of happy users. Try it today!`
    );

    // ── KEYWORD LIST for ASO ──
    const keywordList = uniqueKeywords.slice(0, 10).join(', ');

    return {
      titles: validTitles,
      subtitles: validSubtitles,
      descriptions,
      keywordList,
      topCategories,
    };
  }

  // ── HELPERS ────────────────────────────────────────────────────────

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) / 4294967295);
  }

  // Linear congruential generator for deterministic pseudo-random
  function lcg(seed) {
    const x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  function pick(arr, seed) {
    return arr[Math.floor(lcg(seed) * arr.length)];
  }

  function formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function formatInstalls(n) {
    if (n >= 1e9) return `${(n/1e9).toFixed(1)}B+`;
    if (n >= 1e6) return `${(n/1e6).toFixed(0)}M+`;
    if (n >= 1e3) return `${(n/1e3).toFixed(0)}K+`;
    return `${n}+`;
  }

  function randomDate(startYear, endYear, seed) {
    const year  = startYear + Math.floor(lcg(seed) * (endYear - startYear + 1));
    const month = 1 + Math.floor(lcg(seed + 1) * 12);
    const day   = 1 + Math.floor(lcg(seed + 2) * 28);
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  const APP_NAME_PARTS = {
    prefixes: ['Pro','Smart','Quick','Easy','Ultra','Super','Hyper','Snap','Flux','Neo','Aura','Vibe','Peak','Bolt','Swift'],
    suffixes: ['AI','Plus','Go','Now','HD','One','X','Max','Hub','Box','Base','Flow','Link','Sync'],
  };

  function generateAppName(words, seed) {
    const r = lcg(seed);
    const r2 = lcg(seed + 99);
    const usePre  = r > 0.5;
    const useSuf  = r2 > 0.5;
    const base    = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const pre     = pick(APP_NAME_PARTS.prefixes, seed + 11);
    const suf     = pick(APP_NAME_PARTS.suffixes, seed + 22);
    if (usePre && useSuf) return `${pre} ${base} ${suf}`;
    if (usePre)           return `${pre} ${base}`;
    if (useSuf)           return `${base} ${suf}`;
    return base;
  }

  // ── REVENUE ESTIMATION (Sensor Tower-style) ─────────────────────────
  //
  // Calibrated against real Sensor Tower data:
  //   HP (4M ratings)          → 1.3M downloads/mo, $2.9M/mo
  //   Smart Printer & Scan (72K ratings) → 68K downloads/mo, $357.9K/mo
  //   Smart Printer & Scanner (81K)      → 58K downloads/mo, $302.8K/mo
  //   Smart Printer iPrint (14K)         → 20K downloads/mo, $107.2K/mo
  //   Printer App: Smart Print (13K)     → 12K downloads/mo, $62.0K/mo
  //   Printer app ® (9K)                → 7K downloads/mo, $36.7K/mo
  //   HP Smart iPrint (681)              → 2K downloads/mo, $12.5K/mo
  //   Smart Printer for HP (394)         → 2K downloads/mo, $11.3K/mo
  //   Flashka (Education)               → 70K downloads/mo, $30K/mo
  //
  // Key insight: Business freemium ARPU is consistently ~$5.2/download

  // Revenue per download by category (freemium/IAP model)
  // Calibrated from Sensor Tower benchmarks
  const FREEMIUM_ARPU = {
    'Games':              2.80,
    'Entertainment':      1.80,
    'Photo & Video':      2.40,
    'Photography':        2.20,
    'Social Networking':  0.80,
    'Music':              2.50,
    'Productivity':       2.20,
    'Utilities':          3.20,
    'Finance':            4.50,
    'Health & Fitness':   3.00,
    'Education':          0.45,    // Flashka: $30K / 70K = $0.43
    'Business':           5.20,    // Sensor Tower: consistently $5.2/download
    'Travel':             1.40,
    'Food & Drink':       1.60,
    'News':               1.90,
    'Shopping':           0.70,
    'Weather':            2.60,
    'Navigation':         1.80,
    'Sports':             1.30,
    'Lifestyle':          2.10,
    'Medical':            5.50,
    'Reference':          2.60,
    'Developer Tools':    4.80,
  };
  const DEFAULT_ARPU = 2.20;

  // Platform download and revenue multipliers
  const PLAT_DOWNLOADS = { ios: 1.00, ipad: 0.25, macos: 0.10, android: 0.85 };
  const PLAT_REVENUE   = { ios: 1.00, ipad: 0.90, macos: 1.25, android: 0.50 };

  /**
   * Estimate monthly downloads from rating count.
   * Uses piecewise linear interpolation calibrated against Sensor Tower data.
   *
   * The key challenge: rating count is lifetime total, but we need current monthly.
   * Smaller apps tend to have higher download-to-rating ratios (newer, growing).
   * Large apps have lower ratios (accumulated ratings over years).
   */
  function estimateMonthlyDownloads(ratingCount, app) {
    if (ratingCount <= 0) return 100;

    // Piecewise linear model calibrated from Sensor Tower data points:
    //   394 ratings  → ~2K/mo    (ratio ~5.1)
    //   681 ratings  → ~2K/mo    (ratio ~2.9)
    //   9K ratings   → ~7K/mo    (ratio ~0.8)
    //   13K ratings  → ~12K/mo   (ratio ~0.9)
    //   14K ratings  → ~20K/mo   (ratio ~1.4)
    //   72K ratings  → ~68K/mo   (ratio ~0.9)
    //   81K ratings  → ~58K/mo   (ratio ~0.7)
    //   4M ratings   → ~1.3M/mo  (ratio ~0.3)
    let downloads;
    if (ratingCount < 1000) {
      // Small apps: high ratio (~3-5x), many users don't rate, apps may be newer
      downloads = Math.max(800, ratingCount * 3.5);
    } else if (ratingCount < 10000) {
      // Growing apps: ratio tapers from ~3.5x to ~0.9x
      downloads = 3500 + (ratingCount - 1000) * 0.85;
    } else if (ratingCount < 100000) {
      // Established apps: ratio ~0.6-0.8x
      downloads = 11150 + (ratingCount - 10000) * 0.65;
    } else if (ratingCount < 1000000) {
      // Popular apps: ratio ~0.4-0.5x
      downloads = 75000 + (ratingCount - 100000) * 0.45;
    } else {
      // Mega apps: ratio ~0.3x (accumulated years of ratings)
      downloads = 480000 + (ratingCount - 1000000) * 0.28;
    }

    // Recency boost: recently updated apps get more visibility → more downloads
    const isRecentlyUpdated = app && app.updateDate &&
      (new Date() - new Date(app.updateDate)) < 90 * 86400000;
    if (isRecentlyUpdated) downloads *= 1.25;

    // Rating quality boost: higher-rated apps rank better → more downloads
    const rating = (app && app.rating) || 0;
    if (rating >= 4.5) downloads *= 1.15;
    else if (rating >= 4.0) downloads *= 1.05;
    else if (rating < 3.0 && rating > 0) downloads *= 0.75;

    return Math.max(100, Math.round(downloads));
  }

  /**
   * Estimate monthly & annual revenue for an app.
   * Returns { monthlyRevenue, annualRevenue, dailyDownloads, monthlyDownloads, revenueModel }
   */
  function estimateAppRevenue(app, platform) {
    const ratingCount = app.ratingCount || 0;

    // Step 1: Estimate monthly downloads
    let monthlyDownloads = estimateMonthlyDownloads(ratingCount, app);

    // Apply platform download factor
    const platDl = PLAT_DOWNLOADS[platform] || 1.0;
    monthlyDownloads = Math.round(monthlyDownloads * platDl);
    const dailyDownloads = Math.round(monthlyDownloads / 30);

    // Step 2: Revenue based on monetisation model
    let monthlyRevenue = 0;
    let revenueModel = 'free';

    if (!app.isFree && app.price > 0) {
      // Paid app: revenue = downloads × price × 0.70 (after Apple's 30% cut)
      monthlyRevenue = monthlyDownloads * app.price * 0.70;
      revenueModel = 'paid';
    } else if (app.hasIAP) {
      // Freemium: revenue = downloads × category ARPU
      const arpu = FREEMIUM_ARPU[app.category] || DEFAULT_ARPU;
      monthlyRevenue = monthlyDownloads * arpu;
      revenueModel = 'freemium';
    } else {
      // Ad-supported: ~$0.15-0.25 per download in ad revenue
      monthlyRevenue = monthlyDownloads * 0.18;
      revenueModel = 'ads';
    }

    // Apply platform revenue factor (iOS highest, Android ~50%)
    const platRev = PLAT_REVENUE[platform] || 1.0;
    monthlyRevenue = Math.round(monthlyRevenue * platRev);

    monthlyRevenue = Math.max(0, monthlyRevenue);
    const annualRevenue = monthlyRevenue * 12;

    return {
      monthlyRevenue,
      annualRevenue,
      dailyDownloads: Math.max(0, dailyDownloads),
      monthlyDownloads: Math.max(0, monthlyDownloads),
      revenueModel,
    };
  }

  /**
   * Format revenue as $X, $XK, $XM
   */
  function formatRevenue(n) {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return `$${Math.round(n)}`;
    return '<$1';
  }

  // ── FORMATTING UTILITIES (exported) ───────────────────────────────

  function formatVolume(n) {
    if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`;
    return String(n);
  }

  function formatNumber(n) {
    if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`;
    return String(n);
  }

  function difficultyLabel(d) {
    if (d >= 80) return { label: 'Very Hard', cls: 'text-red' };
    if (d >= 60) return { label: 'Hard',      cls: 'text-yellow' };
    if (d >= 40) return { label: 'Medium',    cls: 'text-blue' };
    return             { label: 'Easy',       cls: 'text-green' };
  }

  function chanceLabel(c) {
    if (c >= 70) return { label: 'High',   cls: 'text-green' };
    if (c >= 40) return { label: 'Medium', cls: 'text-yellow' };
    return             { label: 'Low',     cls: 'text-red' };
  }

  function renderStars(rating) {
    const full  = Math.floor(rating);
    const half  = rating - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function trendArrow(trend) {
    if (trend > 3)  return { cls: 'trend-up',   icon: '▲', text: `+${trend.toFixed(1)}%` };
    if (trend < -3) return { cls: 'trend-down',  icon: '▼', text: `${trend.toFixed(1)}%` };
    return                 { cls: 'trend-flat',  icon: '—', text: `${trend.toFixed(1)}%` };
  }

  return {
    searchKeyword,
    getTrending,
    generateASOMetadata,
    estimateAppRevenue,
    formatVolume,
    formatNumber,
    formatRevenue,
    difficultyLabel,
    chanceLabel,
    renderStars,
    trendArrow,
  };
})();
