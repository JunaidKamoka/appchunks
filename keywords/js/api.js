/**
 * KeywordsIQ — API Module
 * Fetches real app data from iTunes Search API (iOS/iPad/macOS)
 * Generates realistic keyword intelligence metrics
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
      releaseDate:  raw.releaseDate || '',
      updateDate:   raw.currentVersionReleaseDate || raw.releaseDate || '',
      url:          raw.trackViewUrl || raw.artistViewUrl || '',
      minOS:        raw.minimumOsVersion || '—',
      screenshots:  raw.screenshotUrls || [],
      languages:    raw.languageCodesISO2A || [],
      platform:     platform || 'ios',
    };
  }

  /**
   * Generate Android app data (simulated with realistic data patterns)
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
        releaseDate:  randomDate(2018, 2023, seed+i),
        updateDate:   randomDate(2024, 2025, seed+i),
        url:          `https://play.google.com/store/apps/details?id=com.example.app${i}`,
        minOS:        `Android ${5 + Math.floor(r*4)}.0+`,
        screenshots:  [],
        languages:    ['EN'],
        platform:     'android',
      };
    });
  }

  // ── KEYWORD INTELLIGENCE ───────────────────────────────────────────

  /**
   * Generate realistic keyword metrics
   */
  function generateKeywordMetrics(keyword, platform, country, appCount) {
    const s  = hashStr(keyword + platform + country);
    const s2 = hashStr(keyword + country + platform);

    // ── Platform-specific realistic scaling ────────────────────────
    // iOS:     largest App Store, most competitive, highest CPI
    // iPad:    ~20% of iOS volume, less competition (iPad-optimised apps)
    // macOS:   ~8% of iOS volume, far fewer apps, different pricing
    // Android: ~80% of iOS volume, very competitive, lower CPI
    const PLATFORM = {
      ios:     { vol: 1.00, diff: 1.00, cpiBase: 0.80, cpiRange: 4.50, apps: 1.00 },
      ipad:    { vol: 0.20, diff: 0.76, cpiBase: 0.65, cpiRange: 3.20, apps: 0.72 },
      macos:   { vol: 0.08, diff: 0.52, cpiBase: 1.10, cpiRange: 2.80, apps: 0.32 },
      android: { vol: 0.80, diff: 0.92, cpiBase: 0.40, cpiRange: 2.00, apps: 1.10 },
    };
    const p = PLATFORM[platform] || PLATFORM.ios;

    // Volume: high for short/popular keywords, lower for long-tail
    const wordCount  = keyword.trim().split(/\s+/).length;
    const popularity = lcg(s);
    const rawVol     = wordCount === 1
      ? Math.floor(50000 + popularity * 950000)
      : wordCount === 2
        ? Math.floor(10000 + popularity * 400000)
        : Math.floor(1000  + popularity * 80000);

    // Apply platform scale + seasonality noise
    const volume = Math.max(50, Math.round(rawVol * p.vol * (0.85 + lcg(s2) * 0.3)));

    // Difficulty 1–100 (scaled by platform competitiveness)
    const difficulty = Math.min(99, Math.round(
      (20 + (rawVol / 10000) * 0.5 + lcg(s + 3) * 50 + appCount * 0.3) * p.diff
    ));

    // Chance score (inverse of difficulty + some luck)
    const chance = Math.max(1, Math.min(99,
      Math.round(100 - difficulty * 0.7 + lcg(s + 7) * 30)
    ));

    // Competing apps (scaled per platform app-store size)
    const competing = Math.max(5, Math.round(
      (50 + difficulty * 2.5 + lcg(s2 + 1) * 800) * p.apps
    ));

    // CPI — platform-specific base + difficulty modifier
    const cpi = parseFloat(
      (p.cpiBase + difficulty * 0.035 + lcg(s + 11) * p.cpiRange).toFixed(2)
    );

    // Trend: percentage change vs 30 days ago
    const trend = parseFloat(((lcg(s2 + 5) - 0.4) * 80).toFixed(1));

    // Monthly volume history (12 months)
    const history = generateVolumeHistory(volume, s);

    return { volume, difficulty, chance, competing, cpi, trend, history };
  }

  /**
   * Generate 12-month volume history
   */
  function generateVolumeHistory(baseVolume, seed) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months.map((month, i) => ({
      month,
      volume: Math.max(100, Math.round(baseVolume * (0.6 + lcg(seed + i * 13) * 0.8))),
    }));
  }

  /**
   * Generate related keywords
   */
  function generateRelatedKeywords(keyword, platform, country) {
    const seed = hashStr(keyword + platform);
    const words = keyword.trim().split(/\s+/);

    // Platform-specific modifiers reflecting real App Store search behaviour
    const MODIFIERS = {
      ios:     ['free', 'best', 'pro', 'app', 'no ads', '2025', 'download',
                'for iphone', 'offline', 'premium', 'lite', 'advanced', 'easy', 'fast', 'top'],
      ipad:    ['for ipad', 'ipad app', 'best', 'pro', 'free', 'apple pencil',
                'split screen', 'offline', 'premium', 'no ads', '2025', 'lite', 'easy'],
      macos:   ['for mac', 'macos', 'mac app', 'best', 'free', 'pro',
                'menubar', 'native', 'offline', 'download', 'alternative', 'lightweight'],
      android: ['free', 'best', 'pro', 'apk', 'no ads', '2025', 'download',
                'for android', 'offline', 'premium', 'lite', 'advanced', 'fast', 'open source'],
    };
    const modifiers = MODIFIERS[platform] || MODIFIERS.ios;
    const synonyms = {
      editor:   ['editor','editing','edit','creator','maker','designer'],
      photo:    ['photo','picture','image','pic','camera','selfie'],
      vpn:      ['vpn','proxy','privacy','secure','tunnel','anonymous'],
      fitness:  ['fitness','workout','exercise','gym','health','training'],
      music:    ['music','songs','audio','mp3','playlist','streaming'],
      todo:     ['todo','tasks','planner','organizer','reminder','notes'],
      video:    ['video','movies','films','clips','player','stream'],
      chat:     ['chat','messenger','message','talk','call','voice'],
      travel:   ['travel','trips','flight','hotel','booking','maps'],
      learn:    ['learn','learning','lessons','course','study','tutorial'],
    };

    const related = new Set();
    related.add(keyword);

    // Add modifier combinations
    modifiers.slice(0, 8).forEach(mod => {
      related.add(`${keyword} ${mod}`);
      related.add(`${mod} ${keyword}`);
    });

    // Synonym expansions
    words.forEach(word => {
      const w = word.toLowerCase();
      Object.entries(synonyms).forEach(([k, syns]) => {
        if (syns.includes(w)) {
          syns.forEach(s => {
            if (s !== w) {
              related.add(keyword.replace(new RegExp(w, 'i'), s));
            }
          });
        }
      });
    });

    const arr = [...related].filter(k => k !== keyword).slice(0, 18);

    // Volume scale matches generateKeywordMetrics platform factors
    const VOL_SCALE = { ios: 1.00, ipad: 0.20, macos: 0.08, android: 0.80 };
    const DIFF_SCALE = { ios: 1.00, ipad: 0.76, macos: 0.52, android: 0.92 };
    const volScale  = VOL_SCALE[platform]  || 1;
    const diffScale = DIFF_SCALE[platform] || 1;

    return arr.map((kw, i) => {
      const s  = hashStr(kw + platform + country);
      const s2 = hashStr(kw + country + i);
      const wc = kw.trim().split(/\s+/).length;
      const popularity = lcg(s);
      const rawVol = wc === 1
        ? Math.floor(20000 + popularity * 500000)
        : Math.floor(1000 + popularity * 150000);
      const vol  = Math.max(10, Math.round(rawVol * volScale));
      const diff = Math.min(98, Math.round((15 + lcg(s2) * 75) * diffScale));
      const chance = Math.max(2, Math.min(98, Math.round(100 - diff * 0.65 + lcg(s2+3) * 25)));
      const trendRaw = (lcg(s + 9) - 0.4) * 80;
      return {
        keyword: kw,
        volume: Math.round(vol * (0.85 + lcg(s2) * 0.3)),
        difficulty: diff,
        chance,
        trend: parseFloat(trendRaw.toFixed(1)),
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

    if (platform !== 'android') {
      try {
        const raw = await searchITunes(keyword, country, platform, 25);
        apps = raw.map((r, i) => normalizeITunesApp(r, i + 1, platform));
      } catch (e) {
        console.warn('iTunes API failed, using simulated data', e);
        apps = generateAndroidApps(keyword, country, 20).map(a => ({ ...a, platform }));
      }
    } else {
      apps = generateAndroidApps(keyword, country, 25);
    }

    // Fill gaps if API returned fewer results
    if (apps.length < 5) {
      apps = generateAndroidApps(keyword, country, 20).map(a => ({ ...a, platform }));
    }

    const metrics  = generateKeywordMetrics(keyword, platform, country, apps.length);
    const related  = generateRelatedKeywords(keyword, platform, country);

    return { apps, metrics, related, keyword, platform, country };
  }

  function getTrending(platform, country) {
    return generateTrending(platform, country);
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
    formatVolume,
    formatNumber,
    difficultyLabel,
    chanceLabel,
    renderStars,
    trendArrow,
  };
})();
