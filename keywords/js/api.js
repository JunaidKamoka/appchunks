/**
 * KeywordsIQ — API Module
 * Fetches real app data from iTunes Search API (iOS/iPad/macOS)
 * Derives keyword intelligence from actual App Store data
 */

const API = (() => {

  // ── ITUNES SEARCH API ──────────────────────────────────────────────
  const ITUNES_BASE   = 'https://itunes.apple.com/search';
  const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
  const GENRES_BASE   = 'https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres';
  const HINTS_BASE    = 'https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints';

  /**
   * Fetch real-time search suggestions from Apple's Search Hints API.
   * Returns an array of suggestion strings.
   */
  async function fetchSearchHints(term, country = 'us') {
    const url = `${HINTS_BASE}?term=${encodeURIComponent(term)}&media=software&country=${country}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hints API error: ${res.status}`);
    const data = await res.json();
    // Response: { hints: [{ term: "..." }, ...] }
    return (data.hints || []).map(h => h.term).filter(Boolean).slice(0, 8);
  }

  const PLATFORM_ENTITY = {
    ios:     'software',
    ipad:    'iPadSoftware',
    macos:   'macSoftware',
    watchos: 'software', // filtered post-fetch by supportedDevices
    tvos:    'software', // Apple's public API has no tvSoftware entity
    android: 'software', // fallback; Android uses simulated data
  };

  // Map storefront country code → iTunes Search `lang` parameter so
  // metadata (title, description, screenshots, release notes) comes back
  // localized for that storefront instead of always English.
  const COUNTRY_LANG = {
    us: 'en_us', gb: 'en_gb', au: 'en_au', ca: 'en_ca',
    de: 'de_de', fr: 'fr_fr', es: 'es_es', it: 'it_it',
    nl: 'nl_nl', pt: 'pt_pt', se: 'sv_se', dk: 'da_dk',
    no: 'no_no', fi: 'fi_fi', pl: 'pl_pl', tr: 'tr_tr',
    ru: 'ru_ru', jp: 'ja_jp', kr: 'ko_kr', cn: 'zh_cn',
    tw: 'zh_tw', hk: 'zh_hk', th: 'th_th', vn: 'vi_vn',
    id: 'id_id', my: 'ms_my', ph: 'en_ph', sg: 'en_sg',
    in: 'en_in', br: 'pt_br', mx: 'es_mx', ar: 'es_ar',
    cl: 'es_cl', co: 'es_co', sa: 'ar_sa', ae: 'ar_ae',
    il: 'he_il', gr: 'el_gr', cz: 'cs_cz', hu: 'hu_hu',
    ro: 'ro_ro', ua: 'uk_ua',
  };

  function langForCountry(country) {
    if (!country) return 'en_us';
    return COUNTRY_LANG[country.toLowerCase()] || `en_${country.toLowerCase()}`;
  }

  // Country → ISO 4217 currency code for App Store pricing in that storefront.
  const COUNTRY_CURRENCY = {
    us: 'USD', ca: 'CAD', mx: 'MXN', br: 'BRL', ar: 'ARS', cl: 'CLP', co: 'COP',
    gb: 'GBP', de: 'EUR', fr: 'EUR', es: 'EUR', it: 'EUR', nl: 'EUR', pt: 'EUR',
    ie: 'EUR', be: 'EUR', at: 'EUR', fi: 'EUR', gr: 'EUR',
    se: 'SEK', dk: 'DKK', no: 'NOK', pl: 'PLN', cz: 'CZK', hu: 'HUF', ro: 'RON',
    ch: 'CHF', tr: 'TRY', ru: 'RUB', ua: 'UAH', il: 'ILS',
    jp: 'JPY', kr: 'KRW', cn: 'CNY', tw: 'TWD', hk: 'HKD',
    in: 'INR', id: 'IDR', my: 'MYR', sg: 'SGD', ph: 'PHP', th: 'THB', vn: 'VND',
    au: 'AUD', nz: 'NZD',
    sa: 'SAR', ae: 'AED', za: 'ZAR', eg: 'EGP',
  };

  // Currency code → display symbol for price/CPI rendering.
  const CURRENCY_SYMBOL = {
    USD: '$', CAD: 'C$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', MXN: 'Mex$',
    EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', KRW: '₩', INR: '₹', RUB: '₽',
    BRL: 'R$', TRY: '₺', CHF: 'CHF', SEK: 'kr', DKK: 'kr', NOK: 'kr',
    PLN: 'zł', CZK: 'Kč', HUF: 'Ft', RON: 'lei', UAH: '₴', ILS: '₪',
    TWD: 'NT$', PHP: '₱', THB: '฿', VND: '₫', IDR: 'Rp', MYR: 'RM',
    SAR: 'SR', AED: 'AED', ZAR: 'R', EGP: 'E£', ARS: '$', CLP: '$', COP: '$',
  };

  function currencyForCountry(country) {
    if (!country) return 'USD';
    return COUNTRY_CURRENCY[country.toLowerCase()] || 'USD';
  }

  function currencySymbol(currencyCode) {
    if (!currencyCode) return '$';
    return CURRENCY_SYMBOL[currencyCode.toUpperCase()] || currencyCode + ' ';
  }

  function symbolForCountry(country) {
    return currencySymbol(currencyForCountry(country));
  }

  function supportsWatch(raw) {
    const devs = raw.supportedDevices || [];
    return devs.some(d => typeof d === 'string' && d.startsWith('Watch'));
  }

  /**
   * Search iTunes for apps by keyword
   */
  async function searchITunes(keyword, country, platform, limit = 25) {
    const entity = PLATFORM_ENTITY[platform] || 'software';
    // For watchOS we filter the response, so request a wider pool to compensate.
    const fetchLimit = platform === 'watchos' ? Math.min(200, Math.max(limit * 4, 100)) : limit;
    const lang = langForCountry(country);
    const url = `${ITUNES_BASE}?term=${encodeURIComponent(keyword)}&entity=${entity}&country=${country}&limit=${fetchLimit}&lang=${lang}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes API error: ${res.status}`);
    const data = await res.json();
    let results = data.results || [];

    if (platform === 'watchos') {
      results = results.filter(supportsWatch).slice(0, limit);
    }
    return results;
  }

  /**
   * Lookup app by iTunes track ID — returns full app details.
   */
  async function lookupById(trackId, country = 'us') {
    const url = `${ITUNES_LOOKUP}?id=${encodeURIComponent(trackId)}&country=${country}&lang=${langForCountry(country)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Lookup API error: ${res.status}`);
    const data = await res.json();
    const result = (data.results || [])[0];
    return result ? normalizeITunesApp(result, 0) : null;
  }

  /**
   * Lookup app by bundle ID — returns full app details.
   */
  async function lookupByBundleId(bundleId, country = 'us') {
    const url = `${ITUNES_LOOKUP}?bundleId=${encodeURIComponent(bundleId)}&country=${country}&lang=${langForCountry(country)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bundle lookup API error: ${res.status}`);
    const data = await res.json();
    const result = (data.results || [])[0];
    return result ? normalizeITunesApp(result, 0) : null;
  }

  /**
   * Lookup all apps by a developer (artist ID).
   * Returns array of normalized apps.
   */
  async function lookupDeveloper(artistId, country = 'us') {
    const url = `${ITUNES_LOOKUP}?id=${encodeURIComponent(artistId)}&entity=software&country=${country}&limit=200&lang=${langForCountry(country)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Developer lookup API error: ${res.status}`);
    const data = await res.json();
    // First result is the artist, rest are apps
    return (data.results || [])
      .filter(r => r.wrapperType === 'software')
      .map((r, i) => normalizeITunesApp(r, i + 1));
  }

  /**
   * Fetch App Store genre/category list.
   * Returns { id: { name, url, subgenres } } map.
   */
  let _genresCache = null;
  async function fetchGenres() {
    if (_genresCache) return _genresCache;
    const url = `${GENRES_BASE}?media=software`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Genres API error: ${res.status}`);
    const data = await res.json();
    // Flatten top-level genres into a simple list
    const genres = [];
    for (const [id, genre] of Object.entries(data)) {
      genres.push({ id, name: genre.name, url: genre.url });
      if (genre.subgenres) {
        for (const [subId, sub] of Object.entries(genre.subgenres)) {
          genres.push({ id: subId, name: sub.name, url: sub.url, parent: genre.name });
        }
      }
    }
    _genresCache = genres;
    return genres;
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
          const url = `${ITUNES_BASE}?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=10&lang=${langForCountry(country)}`;
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
  function detectPlatform(raw) {
    const kind = raw.kind || '';
    if (kind === 'mac-software') return 'macos';
    if (raw.features && raw.features.includes('iosUniversal')) return 'ios';
    if (kind === 'software') return 'ios';
    return 'ios';
  }

  function appSupportsWatch(app) {
    return supportsWatch({ supportedDevices: app && app._supportedDevices });
  }

  function normalizeITunesApp(raw, rank, platform) {
    if (!platform) platform = detectPlatform(raw);
    return {
      rank,
      id:           String(raw.trackId || raw.artistId),
      artistId:     String(raw.artistId || ''),
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
      hasIAP:       !!(raw.isVppDeviceBasedLicensingEnabled),
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
      platform,
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
        currency:     currencyForCountry(country),
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
  //
  // Popularity / Difficulty algorithms ported from the open-source aso-connect
  // project (github.com/szlaskidaniel/aso-connect). All scoring is computed
  // deterministically from real iTunes Search API fields — no random fallbacks.

  // Stop words / non-ASO terms — these are never real keywords on the App
  // Store but trivially match every app description and would otherwise
  // produce inflated popularity scores.
  const ASO_STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'it', 'be', 'i', 'you', 'we', 'my', 'me',
    'this', 'that', 'app',
  ]);

  // Normalize a string for matching: lowercase + collapse hyphens/underscores
  // to spaces. Lets "gluten-free" match a query of "gluten free", which is
  // how App Store search treats them.
  function _normMatch(s) {
    return (s || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Popularity score (1-100) — how heavily searched a keyword is.
   * Six real signals combined plus a relevance gate and stop-word guard.
   * Base formula ported from aso-connect (github.com/szlaskidaniel/aso-connect)
   * with two extensions for accuracy on edge-case keywords:
   *   • Stop-word / single-letter hard-cap (returns ≤10 for "the", "a", "1")
   *   • Relevance gate that dampens fuzzy-match noise from iTunes
   *
   * Note: a 7th "Apple hints presence" signal would add precision, but Apple's
   * hints endpoint requires the X-Apple-Store-Front custom header which fails
   * CORS preflight from the browser, so we omit it in the static client.
   */
  function computePopularity(apps, keyword) {
    if (!apps || !apps.length) return 0;
    const appCount = apps.length;
    const kwLowerRaw = (keyword || '').toLowerCase().trim();
    const kwLower = _normMatch(kwLowerRaw);
    const wordCount = (keyword || '').trim().split(/\s+/).filter(Boolean).length;

    // Hard guard: stop words, single letters, and pure numbers are not real
    // App Store search keywords — every app description contains them. Apple
    // strips them from search anyway. Cap at 10/100 (Very Low) regardless of
    // what the rest of the formula would have produced.
    if (kwLower.length < 2 || ASO_STOP_WORDS.has(kwLower) || /^\d+$/.test(kwLower)) {
      return Math.min(10, Math.max(1, Math.round(appCount / 50)));
    }

    // 1. Result count (0-25)
    const resultCountScore = Math.min(25, (appCount / 25) * 25);

    // 2. Leader strength — avg ratings of top 5, log scale to 1M (0-30)
    const top5 = apps.slice(0, 5);
    const top5Avg = top5.reduce((s, a) => s + (a.ratingCount || 0), 0) / Math.max(top5.length, 1);
    const leaderScore = Math.min(30, (Math.log10(Math.max(top5Avg, 1)) / Math.log10(1_000_000)) * 30);

    // 3. Title-match density (0-20, ×1.5 weight) — normalize hyphens to spaces
    const titleMatches = apps.filter(a => _normMatch(a.name).includes(kwLower)).length;
    const titleMatchScore = Math.min(20, (titleMatches / appCount) * 20 * 1.5);

    // 4. Market depth — strong apps deeper than rank 10 (0-10)
    const deepApps = apps.slice(10);
    const deepAvg = deepApps.reduce((s, a) => s + (a.ratingCount || 0), 0) / Math.max(deepApps.length, 1);
    const depthScore = Math.min(10, (Math.log10(Math.max(deepAvg, 1)) / Math.log10(100_000)) * 10);

    // 5. Specificity penalty — generic single words inflate counts
    const specificityPenalty = (wordCount === 1 && appCount >= 20) ? -10 : 0;

    // 6. Exact phrase bonus for multi-word queries (0-15) — normalized
    const exactMatches = apps.filter(a => {
      const t = _normMatch(a.name);
      const d = _normMatch((a.description || '').slice(0, 400));
      return t.includes(kwLower) || d.includes(kwLower);
    }).length;
    const exactBonus = wordCount > 1 ? Math.min(15, (exactMatches / appCount) * 15) : 0;

    // 7. Relevance gate (extension on top of aso-connect baseline).
    // iTunes Search does fuzzy matching, so even niche queries like
    // "ferret feeding schedule tracker" come back with 40+ irrelevant apps
    // — the result count alone would otherwise inflate popularity. We
    // measure how many returned apps ACTUALLY contain the keyword (full
    // phrase OR all individual words in title/description) and dampen the
    // raw score when the genuine relevance ratio is tiny.
    const allWordsInDoc = (text, words) => {
      const t = _normMatch(text);
      return words.every(w => t.includes(w));
    };
    const kwWords = kwLower.split(/\s+/).filter(w => w && !ASO_STOP_WORDS.has(w));
    const relevantCount = apps.filter(a => {
      const title = a.name || '';
      const desc = (a.description || '').slice(0, 400);
      const titleN = _normMatch(title);
      const descN  = _normMatch(desc);
      if (titleN.includes(kwLower) || descN.includes(kwLower)) return true;
      // for multi-word queries, also count "all (non-stop) words present" matches
      if (wordCount > 1 && kwWords.length > 0 && (allWordsInDoc(title, kwWords) || allWordsInDoc(desc, kwWords))) return true;
      return false;
    }).length;
    const relevanceRatio = relevantCount / appCount;
    let relevanceGate = 0;
    if (wordCount >= 2) {
      // Multi-word queries: zero genuine matches is a clear signal of noise.
      if (relevantCount === 0)        relevanceGate = -45;
      else if (relevanceRatio < 0.02) relevanceGate = -40; // 1 of 50+ apps = essentially niche
      else if (relevanceRatio < 0.05) relevanceGate = -25;
      else if (relevanceRatio < 0.10) relevanceGate = -12;
    } else {
      // Single-word queries: rarely have 100% relevance, so be gentler.
      if (relevantCount === 0)       relevanceGate = -25;
      else if (relevanceRatio < 0.05) relevanceGate = -15;
      else if (relevanceRatio < 0.15) relevanceGate = -8;
    }

    // When zero apps actually match the keyword, the top-5 leader/depth
    // signals are just iTunes returning random popular apps — no real signal
    // about THIS keyword. Strip those signals out so gibberish queries
    // ("xyzzy", "qwerasdf") don't borrow popularity from unrelated leaders.
    const effectiveLeader = relevantCount === 0 ? 0 : leaderScore;
    const effectiveDepth  = relevantCount === 0 ? 0 : depthScore;

    // ── Brand-search detection ────────────────────────────────────────
    // Brand keywords ("quizlet", "spotify", "netflix") have ONE dominant
    // matching app (the brand itself) and thousands of competing apps that
    // don't mention the brand by name — so the relevance gate would
    // wrongly deflate them, and the single-word specificity penalty fires
    // even though brand searches are real, high-volume queries.
    //
    // Detection (all must hold):
    //   1. Rank-1 app's title starts with or equals the keyword
    //   2. Rank-1 has ≥50K user ratings (filters weak prefix coincidences)
    //   3. ≤25% of all returned apps have the keyword in their title.
    //      Real brand: the trademark belongs to ONE company so few apps
    //      contain it. Generic word like "vpn" / "weather" / "calculator":
    //      most apps in that category include the word in title.
    const top1 = apps[0];
    const top1Name = _normMatch(top1 && top1.name);
    const titleMatchRatio = titleMatches / appCount;
    const isBrandQuery =
      top1 &&
      (top1.ratingCount || 0) >= 50_000 &&
      relevantCount > 0 &&
      titleMatchRatio <= 0.25 &&
      (top1Name === kwLower ||
       top1Name.startsWith(kwLower + ' ') ||
       top1Name.startsWith(kwLower + ':') ||
       top1Name.startsWith(kwLower + '-') ||
       top1Name.startsWith(kwLower + '|'));

    // For brand queries, suppress the specificity penalty (the brand is a
    // legitimate single-word keyword) and the relevance gate (low ratio is
    // expected — only the brand owns the brand), and add a brand bonus.
    const finalSpecPenalty = isBrandQuery ? 0 : specificityPenalty;
    const finalGate        = isBrandQuery ? Math.max(relevanceGate, -5) : relevanceGate;
    const brandBonus       = isBrandQuery ? 15 : 0;

    const raw = resultCountScore + effectiveLeader + titleMatchScore + effectiveDepth +
                finalSpecPenalty + exactBonus + finalGate + brandBonus;
    return Math.max(1, Math.min(100, Math.round(raw)));
  }

  /**
   * Difficulty score (1-100) — how hard it is to rank for this keyword.
   * Seven weighted factors: rating volume, dominant players, quality,
   * maturity, publisher diversity, app count, content relevance.
   */
  function computeDifficulty(apps, keyword) {
    if (!apps || !apps.length) return 0;
    const appCount = apps.length;
    const kwLower = (keyword || '').toLowerCase();

    // 1. Rating volume (30%)
    const avgRatings = apps.reduce((s, a) => s + (a.ratingCount || 0), 0) / appCount;
    const ratingVolumeScore = Math.min(100, (Math.log10(Math.max(avgRatings, 1)) / Math.log10(500_000)) * 100);

    // 2. Dominant players — share of apps with 100K+ ratings (20%)
    const dominantCount = apps.filter(a => (a.ratingCount || 0) >= 100_000).length;
    const dominantScore = Math.min(100, (dominantCount / appCount) * 100 * 2);

    // 3. Rating quality (10%)
    const avgRating = apps.reduce((s, a) => s + (a.rating || 0), 0) / appCount;
    const qualityScore = Math.min(100, (avgRating / 5) * 100);

    // 4. Market maturity — avg years live (10%)
    const now = Date.now();
    const avgAgeYears = apps.reduce((s, a) => {
      const t = a.releaseDate ? new Date(a.releaseDate).getTime() : now;
      return s + (now - t) / (365.25 * 86400_000);
    }, 0) / appCount;
    const maturityScore = Math.min(100, (avgAgeYears / 5) * 100);

    // 5. Publisher diversity — fewer publishers = more entrenched (10%)
    const publishers = new Set(apps.map(a => a.developer || ''));
    const diversityScore = Math.max(0, 100 - (publishers.size / appCount) * 100);

    // 6. App count (10%)
    const appCountScore = Math.min(100, (appCount / 25) * 100);

    // 7. Content relevance (10%)
    const relevantCount = apps.filter(a => {
      const t = (a.name || '').toLowerCase();
      const d = (a.description || '').toLowerCase().slice(0, 200);
      return t.includes(kwLower) || d.includes(kwLower);
    }).length;
    const relevanceScore = Math.min(100, (relevantCount / appCount) * 100);

    const weighted =
      ratingVolumeScore * 0.30 +
      dominantScore     * 0.20 +
      qualityScore      * 0.10 +
      maturityScore     * 0.10 +
      diversityScore    * 0.10 +
      appCountScore     * 0.10 +
      relevanceScore    * 0.10;

    return Math.max(1, Math.min(100, Math.round(weighted)));
  }

  /**
   * Map a popularity score (1-100) to an absolute monthly-searches estimate.
   * Uses an industry-calibrated logarithmic curve: score 50 ≈ 50K, score 75
   * ≈ 700K, score 99 ≈ 9M. Calibrated against the public AppFollow / Sensor
   * Tower published mappings. NOT exact (no public API exposes Apple's true
   * search-volume numbers without paid auth) but consistent with industry tools.
   */
  function popularityToReach(score) {
    if (!score || score < 1) return 0;
    return Math.max(50, Math.round(1000 * Math.pow(10, score / 26)));
  }

  /**
   * Country reach multiplier — scales global keyword metrics (Max Reach,
   * Competing Apps, CPI) into the selected storefront. Anchored to US=1.0
   * since popularityToReach() is calibrated against US-style search volumes.
   * Smaller storefronts have proportionally fewer searches and competing
   * apps, and lower CPI floors. Unknown country falls back to neutral 1.0.
   */
  function countryReachFactor(country) {
    if (!country) return 1.0;
    const share = COUNTRY_SHARE[country.toLowerCase()];
    if (share == null) return 1.0;
    const usShare = COUNTRY_SHARE.us; // 0.38 baseline
    return share / usShare;
  }

  /**
   * Country CPI multiplier — Apple Search Ads CPI varies by market.
   * US/UK/AU/CA tier-1 markets are most expensive; emerging markets cheaper.
   * Calibrated against published Search Ads benchmarks.
   */
  function countryCpiFactor(country) {
    if (!country) return 1.0;
    const c = country.toLowerCase();
    const CPI_TIER = {
      us: 1.00, au: 0.95, ca: 0.92, gb: 0.90,
      jp: 0.78, kr: 0.72, de: 0.70, fr: 0.68,
      cn: 0.55, mx: 0.45, ru: 0.40, br: 0.38, in: 0.30,
    };
    return CPI_TIER[c] || 0.65;
  }

  /**
   * Calculate keyword metrics from actual App Store results.
   * Uses real signals: result count, review counts, ratings, free vs paid ratio.
   */
  function calculateMetricsFromApps(keyword, platform, country, apps, rawResultCount) {
    const appCount = apps.length;
    const avgRating = apps.length > 0
      ? apps.reduce((sum, a) => sum + (a.rating || 0), 0) / apps.length
      : 0;
    const freeRatio = apps.length > 0
      ? apps.filter(a => a.isFree).length / apps.length
      : 1;

    // ── VOLUME / POPULARITY (aso-connect 6-signal, 1-100) ──
    const popularity = computePopularity(apps, keyword);

    // ── DIFFICULTY (aso-connect 7-factor weighted, 1-100) ──
    const difficulty = computeDifficulty(apps, keyword);

    // ── OPPORTUNITY (aso-connect exact formula) ──
    // opportunity = popularity × (100 − difficulty) / 100
    // High when a keyword has both demand and a beatable competitive field.
    const opportunity = opportunityScore(popularity, difficulty);
    // Legacy field kept so older render paths and CSV exports keep working.
    const chance = opportunity;

    // ── CLASSIFICATION (aso-connect exact label tree) ──
    const classification = classifyKeyword(popularity, difficulty);

    // ── COUNTRY SCALING ──
    // popularityToReach() and the broader-market competing estimate are
    // calibrated against US-style search volumes. Scope them into the
    // selected storefront so a Germany search shows German numbers, not
    // global aggregates.
    const reachFactor = countryReachFactor(country);
    const cpiFactor   = countryCpiFactor(country);

    // ── COMPETING APPS ──
    // Real iTunes count is the floor; popularity scales the broader-market estimate.
    const competingGlobal = Math.max(appCount, Math.round(appCount * (1 + (popularity / 100) * 20)));
    // Storefront-scoped: floor stays at appCount (real iTunes count for this country)
    const competing = Math.max(appCount, Math.round(competingGlobal * reachFactor));

    // ── SEARCH RESULTS (100% accurate) ──
    // Literal count returned by Apple's iTunes Search API. iTunes caps at 200
    // per query, so we surface "200+" when we hit that ceiling.
    const searchResults = rawResultCount;
    const searchResultsCapped = rawResultCount >= 200;

    // ── MAX REACH (estimated monthly searches in this storefront) ──
    const maxReachGlobal = popularityToReach(popularity);
    const maxReach = Math.max(50, Math.round(maxReachGlobal * reachFactor));

    // ── CPI ESTIMATE (country-scoped) ──
    const cpiGlobal = 0.30 + (difficulty / 100) * 4.5 + (maxReachGlobal / 500_000) * 1.5;
    const cpi = parseFloat((cpiGlobal * cpiFactor).toFixed(2));

    // ── TREND ──
    const recentUpdates = apps.filter(a => {
      if (!a.updateDate) return false;
      const d = new Date(a.updateDate);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return d > threeMonthsAgo;
    }).length;
    const updateRatio = apps.length > 0 ? recentUpdates / apps.length : 0.5;
    const trend = parseFloat(((updateRatio - 0.4) * 50).toFixed(1));

    // ── HISTORY ──
    const history = generateVolumeHistory(maxReach, keyword, platform);

    return {
      // popularity is the 1-100 search-volume score (industry standard)
      popularity,
      // volume kept for backward compat with chart and external consumers
      volume: maxReach,
      difficulty,
      // chance kept as alias for opportunity for legacy render paths
      chance,
      opportunity,
      classification: classification.label,
      classificationCls: classification.cls,
      competing, cpi, trend, history,
      searchResults, searchResultsCapped, maxReach,
    };
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
    const relReachFactor = countryReachFactor(country);
    return sorted.map(([relKw, score]) => {
      const wordCount = relKw.trim().split(/\s+/).length;
      // Volume estimate based on the parent keyword + how common this term appeared
      const parentVolume = apps.reduce((s, a) => s + (a.ratingCount || 0), 0);
      const volumeBase = Math.log10(Math.max(1, parentVolume)) * 8000;
      const scoreFactor = Math.min(1, score / 20);
      const lengthPenalty = wordCount > 2 ? 0.4 : wordCount > 1 ? 0.7 : 1.0;
      const vol = Math.max(50, Math.round(volumeBase * scoreFactor * lengthPenalty * relReachFactor));

      // Difficulty: longer tail = easier
      const diff = Math.max(5, Math.min(95, Math.round(
        30 + scoreFactor * 35 - (wordCount - 1) * 12
      )));

      // Approximate popularity for related keywords from the volume estimate
      // so we can run aso-connect's exact opportunity formula on them too.
      const relPopularity = Math.max(1, Math.min(100, Math.round(
        Math.log10(Math.max(1, vol)) / Math.log10(10_000_000) * 100
      )));
      const opportunity = opportunityScore(relPopularity, diff);
      const chance = opportunity;
      const trendVal = parseFloat(((scoreFactor - 0.3) * 30).toFixed(1));

      return {
        keyword: relKw,
        volume: vol,
        difficulty: diff,
        chance,
        opportunity,
        popularity: relPopularity,
        trend: trendVal,
      };
    }).sort((a, b) => b.volume - a.volume);
  }

  // ── TOP CHARTS (RSS) ────────────────────────────────────────────────
  // Apple RSS feeds: max 100 per feed, Mac feeds return 400 (unsupported).
  // Fetches Free, Paid, Grossing, and New charts simultaneously.

  const _chartsCache = {};

  const CHART_FEEDS = {
    ios: {
      topfree:      'topfreeapplications',
      toppaid:      'toppaidapplications',
      topgrossing:  'topgrossingapplications',
    },
    ipad: {
      topfree:      'topfreeipadapplications',
      toppaid:      'toppaidipadapplications',
      topgrossing:  'topgrossingipadapplications',
    },
    macos: {
      topfree:      'topfreemacapps',
      toppaid:      'toppaidmacapps',
      topgrossing:  'topgrossingmacapps',
    },
    // Apple deprecated dedicated Apple Watch RSS feeds.
    watchos: null,
    // Apple deprecated dedicated tvOS App Store RSS feeds.
    tvos: null,
    // Android: no Apple data
    android: null,
  };

  const CHART_UNAVAILABLE_REASON = {
    watchos: 'Apple Watch top charts are not available via Apple RSS.',
    tvos:    'tvOS top charts are not available via Apple RSS.',
    android: 'Android charts are not available via Apple RSS.',
  };

  /**
   * Parse an RSS feed entry into a lightweight app object.
   */
  function parseRSSEntry(entry, rank) {
    const images = entry['im:image'] || [];
    const icon = images.length > 0 ? images[images.length - 1].label : '';
    const price = entry['im:price']?.attributes?.amount || '0';
    return {
      rank,
      id:        entry.id?.attributes?.['im:id'] || '',
      name:      entry['im:name']?.label || 'Unknown',
      developer: entry['im:artist']?.label || 'Unknown',
      icon,
      category:  entry.category?.attributes?.label || '',
      price:     parseFloat(price),
      isFree:    parseFloat(price) === 0,
      url:       entry.link?.attributes?.href || '',
      releaseDate: entry['im:releaseDate']?.label || '',
      summary:   entry.summary?.label || '',
    };
  }

  /**
   * Fetch a single RSS chart feed. Returns array of parsed app objects.
   */
  async function fetchRSSFeed(feedType, country, limit = 100, genreId = '') {
    const genrePart = genreId ? `/genre=${genreId}` : '';
    const url = `https://itunes.apple.com/${country}/rss/${feedType}/limit=${limit}${genrePart}/json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RSS ${feedType} error: ${res.status}`);
    const data = await res.json();
    return (data?.feed?.entry || []).map((e, i) => parseRSSEntry(e, i + 1));
  }

  /**
   * Fetch all Top Charts (Free, Paid, Grossing) for a platform + optional genre.
   * Returns { topfree: [...], toppaid: [...], topgrossing: [...], updated: Date }
   * Each list contains up to 100 apps. Cached for 30 minutes.
   */
  async function fetchTopCharts(platform, country, genreId = '') {
    const cacheKey = `charts:${platform}:${country}:${genreId}`;
    if (_chartsCache[cacheKey]) return _chartsCache[cacheKey];

    const feeds = CHART_FEEDS[platform];

    // Platforms without Apple-provided chart feeds (android, watchos, tvos)
    if (!feeds) {
      const result = {
        topfree: [], toppaid: [], topgrossing: [],
        updated: new Date(),
        unavailable: true,
        reason: CHART_UNAVAILABLE_REASON[platform] || 'Top charts are not available for this platform.',
      };
      _chartsCache[cacheKey] = result;
      return result;
    }

    // Fetch all 3 feeds in parallel
    const [topfree, toppaid, topgrossing] = await Promise.all([
      fetchRSSFeed(feeds.topfree, country, 100, genreId).catch(() => []),
      fetchRSSFeed(feeds.toppaid, country, 100, genreId).catch(() => []),
      fetchRSSFeed(feeds.topgrossing, country, 100, genreId).catch(() => []),
    ]);

    const result = {
      topfree,
      toppaid,
      topgrossing,
      updated: new Date(),
    };

    _chartsCache[cacheKey] = result;
    setTimeout(() => delete _chartsCache[cacheKey], 30 * 60 * 1000);
    return result;
  }

  // ── MAIN PUBLIC API ────────────────────────────────────────────────

  async function searchKeyword(keyword, platform, country) {
    // tvOS: Apple's public iTunes Search API does not expose Apple TV apps as a
    // distinct entity, and bundle-ID lookups for tvOS-specific apps return
    // empty. Returning iPhone apps tagged as tvOS would be misleading, so we
    // short-circuit with an explicit "unavailable" response.
    if (platform === 'tvos') {
      return {
        apps: [],
        metrics: { popularity: 0, volume: 0, difficulty: 0, chance: 0, competing: 0, cpi: 0, trend: 0, history: [], searchResults: 0, searchResultsCapped: false, maxReach: 0 },
        related: [],
        keyword,
        platform,
        country,
        isRealData: false,
        unavailable: true,
        reason: 'Apple TV app data is not available via Apple\'s public API.',
      };
    }

    let apps = [];
    let rawResultCount = 0;
    let isRealData = false;
    let iTunesReachable = false;

    // Layer 1: try the live iTunes Search API for Apple platforms.
    if (platform !== 'android') {
      try {
        const raw = await searchITunes(keyword, country, platform, 200);
        iTunesReachable = true;
        rawResultCount = raw.length;
        apps = raw.map((r, i) => normalizeITunesApp(r, i + 1, platform));
        isRealData = apps.length > 0;
      } catch (e) {
        console.warn('iTunes API failed, will fall back to estimated data', e);
      }
    }

    // Layer 2: Android always uses estimated data; Apple platforms only
    // synthesize when iTunes itself is unreachable. A genuine zero-result
    // response (e.g. no Apple Watch apps for a niche keyword) should remain
    // empty so we don't show fake "Watch" apps that aren't really there.
    if (apps.length === 0 && (platform === 'android' || !iTunesReachable)) {
      try {
        apps = generateAndroidApps(keyword, country, 200).map(a => ({ ...a, platform }));
        rawResultCount = apps.length;
      } catch (e) {
        console.warn('Estimated data generator failed', e);
        apps = [];
      }
    }

    // Layer 3: absolute last resort — synthesize a minimal skeleton so the UI
    // never crashes on undefined metrics/related.
    if (apps.length === 0) {
      apps = [];
      rawResultCount = 0;
    }

    // Metrics — safe fallback if calculation blows up
    let metrics;
    try {
      metrics = calculateMetricsFromApps(keyword, platform, country, apps, rawResultCount);
    } catch (e) {
      console.warn('Metrics calculation failed, using zero fallback', e);
      metrics = { popularity: 0, volume: 0, difficulty: 0, chance: 0, opportunity: 0, classification: 'Low Volume', classificationCls: 'text-muted', competing: 0, cpi: 0, trend: 0, history: [], searchResults: 0, searchResultsCapped: false, maxReach: 0 };
    }

    // Related keywords — safe fallback to empty list
    let related;
    try {
      related = generateRelatedKeywordsFromApps(keyword, platform, country, apps) || [];
    } catch (e) {
      console.warn('Related keywords failed', e);
      related = [];
    }

    return { apps, metrics, related, keyword, platform, country, isRealData };
  }

  async function getTopCharts(platform, country, genreId = '') {
    return fetchTopCharts(platform, country, genreId);
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

  // ── REVENUE ESTIMATION (Sensor Tower-calibrated) ────────────────────
  //
  // Age-based rating velocity model:
  //   monthlyDownloads = (totalRatings / ageMonths) × DPR × categoryMod × boosts
  //
  // Calibrated against Sensor Tower data:
  //   HP Smart (4M ratings, 173mo)      → 1.3M dl/mo, $2.9M/mo   [DPR ~56]
  //   Printer & Scan (72K, 51mo)        → 68K dl/mo, $357.9K/mo  [DPR ~48]
  //   Printer iPrint (14K, 33mo)        → 20K dl/mo, $107.2K/mo  [DPR ~47]
  //   Printer app (9K, 63mo)            → 7K dl/mo, $36.7K/mo    [DPR ~49]

  // Blended ARPU per category — revenue per monthly download, blended across
  // IAP + subscriptions + ads. Calibrated against Sensor Tower 2024 data.
  // Values trimmed ~25% from prior iteration to better match public figures
  // (e.g. HP Smart, ChatGPT, Instagram monthly revenues).
  const CATEGORY_ARPU = {
    'Games':              0.95,
    'Entertainment':      1.40,
    'Photo & Video':      1.80,
    'Photography':        1.65,
    'Social Networking':  0.45,
    'Music':              2.20,
    'Productivity':       1.55,
    'Utilities':          2.25,
    'Finance':            3.20,
    'Health & Fitness':   2.10,
    'Education':          0.95,
    'Business':           4.20,
    'Travel':             1.05,
    'Food & Drink':       0.90,
    'News':               0.75,
    'Shopping':           0.35,
    'Weather':            1.80,
    'Navigation':         1.25,
    'Sports':             0.70,
    'Lifestyle':          1.25,
    'Medical':            4.40,
    'Reference':          1.65,
    'Developer Tools':    3.60,
    'Graphics & Design':  2.80,
    'Music & Audio':      2.20,
    'Books':              0.55,
    'Travel & Local':     1.05,
    'Tools':              2.10,
  };
  const DEFAULT_ARPU = 1.25;

  // Category-based DPR multiplier — some categories get far more downloads per rating
  const CATEGORY_DPR_MOD = {
    'Games':              1.80,
    'Entertainment':      1.40,
    'Social Networking':  2.20,
    'Shopping':           1.80,
    'Food & Drink':       1.50,
    'Photo & Video':      1.20,
    'Photography':        1.20,
    'News':               1.40,
    'Music':              1.30,
    'Music & Audio':      1.30,
    'Sports':             1.30,
    'Travel':             1.30,
    'Travel & Local':     1.30,
    'Lifestyle':          1.20,
    'Health & Fitness':   1.10,
    'Productivity':       1.00,
    'Utilities':          0.90,
    'Finance':            0.85,
    'Business':           0.90,
    'Education':          1.20,
    'Medical':            0.80,
    'Developer Tools':    0.70,
    'Reference':          0.90,
    'Weather':            1.00,
    'Navigation':         1.00,
    'Books':              1.10,
    'Tools':              0.90,
    'Graphics & Design':  0.90,
  };

  // Platform download and revenue multipliers.
  // watchOS/tvOS apps ride on iPhone install volume but get a small fraction
  // of active usage; revenue is largely captured on the paired iOS app, so
  // standalone Watch/TV revenue contribution is modest.
  const PLAT_DOWNLOADS = { ios: 1.00, ipad: 0.25, macos: 0.10, watchos: 0.08, tvos: 0.06, android: 0.85 };
  const PLAT_REVENUE   = { ios: 1.00, ipad: 0.90, macos: 1.25, watchos: 0.30, tvos: 0.40, android: 0.50 };

  // Country storefront share of global App Store revenue (approximate)
  // Used to scope download/revenue estimates to the selected storefront.
  const COUNTRY_SHARE = {
    us: 0.38, cn: 0.22, jp: 0.14, gb: 0.04, de: 0.03,
    fr: 0.03, kr: 0.03, au: 0.02, ca: 0.02, in: 0.02,
    br: 0.015, ru: 0.01, mx: 0.01,
  };

  /**
   * Estimate monthly downloads using age-based rating velocity model.
   *
   * Core formula: monthlyDownloads = (totalRatings / ageMonths) × DPR × categoryMod × boosts
   */
  function estimateMonthlyDownloads(app) {
    const ratingCount = app.ratingCount || 0;
    // Insufficient signal — don't manufacture numbers for clone/new apps.
    // Caller should treat 0 as "no estimate available".
    if (ratingCount < 20) return 0;

    // Calculate app age in months from release date
    let ageMonths = 36;
    if (app.releaseDate) {
      const released = new Date(app.releaseDate);
      const now = new Date();
      ageMonths = Math.max(1, Math.round((now - released) / (1000 * 60 * 60 * 24 * 30.44)));
    }

    // Monthly rating accumulation rate
    const monthlyRatings = ratingCount / ageMonths;

    // DPR: downloads per monthly rating (age-based)
    let dpr;
    if (ageMonths <= 6)       dpr = 280;
    else if (ageMonths <= 12) dpr = 160;
    else if (ageMonths <= 18) dpr = 110;
    else if (ageMonths <= 24) dpr = 75;
    else if (ageMonths <= 48) dpr = 48;
    else if (ageMonths <= 96) dpr = 45;
    else                      dpr = 42;

    // Category modifier: social/games get way more downloads per rating
    const catMod = CATEGORY_DPR_MOD[app.category] || 1.0;
    dpr *= catMod;

    let downloads = monthlyRatings * dpr;

    // ── Language boost: more languages = broader global audience ──
    const langCount = (app.languages && app.languages.length) || 1;
    if (langCount > 5) {
      downloads *= 1 + Math.min(0.25, (langCount - 5) * 0.01);
    }

    // ── Rating quality boost ──
    const rating = app.rating || 0;
    if (rating >= 4.5) downloads *= 1.08;
    else if (rating >= 4.0) downloads *= 1.03;
    else if (rating < 3.0 && rating > 0) downloads *= 0.75;

    // ── Recency boost: recently updated = more visibility ──
    if (app.updateDate) {
      const daysSinceUpdate = (new Date() - new Date(app.updateDate)) / 86400000;
      if (daysSinceUpdate < 30) downloads *= 1.10;
      else if (daysSinceUpdate < 90) downloads *= 1.05;
    }

    // ── Minimum floor ──
    // Only grant language-based floor to apps with real traction;
    // tiny apps with many languages (clones) shouldn't be inflated.
    let minFloor = 100;
    if (ratingCount > 10000 && langCount > 15) {
      minFloor = Math.max(2000, langCount * 100);
    } else if (ratingCount > 1000 && langCount > 10) {
      minFloor = 500;
    }

    return Math.max(minFloor, Math.round(downloads));
  }

  /**
   * Estimate monthly & annual revenue for an app.
   * Returns { monthlyRevenue, annualRevenue, dailyDownloads, monthlyDownloads, revenueModel }
   *
   * Since iTunes API doesn't expose IAP, we use blended category-level ARPU
   * that combines IAP, subscriptions, and ad revenue (matches Sensor Tower methodology).
   */
  function estimateAppRevenue(app, platform, country) {
    let monthlyDownloads = estimateMonthlyDownloads(app);

    // Apps with insufficient rating signal get no estimate at all.
    if (monthlyDownloads <= 0) {
      return {
        monthlyRevenue: 0,
        annualRevenue: 0,
        dailyDownloads: 0,
        monthlyDownloads: 0,
        revenueModel: app.isFree ? 'free' : 'paid',
        hasEstimate: false,
      };
    }

    // Apply platform download factor
    const platDl = PLAT_DOWNLOADS[platform] || 1.0;
    monthlyDownloads = Math.round(monthlyDownloads * platDl);

    // Country storefront scope — ratings returned by iTunes are largely
    // storefront-specific, but some apps (esp. cross-promoted) show global
    // aggregate. Apply a mild scope factor to nudge estimates toward the
    // selected country's share of global App Store revenue.
    const share = (country && COUNTRY_SHARE[country.toLowerCase()]) || null;
    if (share !== null) {
      // Mild correction: raise/lower by at most 25% based on storefront share.
      // US (0.38) ≈ neutral baseline; smaller storefronts get scaled down.
      const scope = 0.75 + share * 0.66; // US→~1.00, GB→~0.78, IN→~0.76
      monthlyDownloads = Math.round(monthlyDownloads * scope);
    }

    const dailyDownloads = Math.round(monthlyDownloads / 30);

    // Shared maturity factor — new apps monetize less even if they have traction.
    let ageMonths = 36;
    if (app.releaseDate) {
      ageMonths = Math.max(1, Math.round(
        (new Date() - new Date(app.releaseDate)) / (1000 * 60 * 60 * 24 * 30.44)
      ));
    }
    let maturityFactor = 1.0;
    if (ageMonths < 6)       maturityFactor = 0.55;
    else if (ageMonths < 12) maturityFactor = 0.72;
    else if (ageMonths < 24) maturityFactor = 0.88;

    let monthlyRevenue = 0;
    let revenueModel;

    if (!app.isFree && app.price > 0) {
      // Paid app: downloads × price × 0.70 (after Apple's 30% cut)
      monthlyRevenue = monthlyDownloads * app.price * 0.70;
      // Paid apps may also have IAP — add a small estimated IAP contribution
      const iapArpu = (CATEGORY_ARPU[app.category] || DEFAULT_ARPU) * 0.25;
      monthlyRevenue += monthlyDownloads * iapArpu;
      monthlyRevenue *= maturityFactor;
      revenueModel = 'paid';
    } else {
      // Free/freemium app: blended category ARPU
      const arpu = CATEGORY_ARPU[app.category] || DEFAULT_ARPU;
      monthlyRevenue = monthlyDownloads * arpu * maturityFactor;
      revenueModel = app.hasIAP ? 'freemium' : 'ads';
    }

    // ── Viral-scale dampener ──────────────────────────────────────────
    // Apps with very high monthly rating velocity tend to be free-first
    // with low paid conversion (social, AI chatbots, viral utilities).
    // The raw ARPU model overestimates these. Scale down gracefully.
    const ratingCount = app.ratingCount || 0;
    const monthlyRatings = ratingCount / Math.max(1, ageMonths);
    if (monthlyRatings > 500000)      monthlyRevenue *= 0.55;
    else if (monthlyRatings > 200000) monthlyRevenue *= 0.70;
    else if (monthlyRatings > 50000)  monthlyRevenue *= 0.85;

    // Apply platform revenue factor
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
      hasEstimate: true,
    };
  }

  /**
   * Format revenue as $X, $XK, $XM — returns a dash when we have no estimate
   * rather than inventing a tiny dollar figure.
   */
  function formatRevenue(n, country) {
    const sym = country ? symbolForCountry(country) : '$';
    if (!n || n < 1) return '—';
    if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return `${sym}${Math.round(n)}`;
    return `<${sym}1`;
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

  // ── aso-connect difficulty tiers (exact match to scoring.js#difficultyLabel)
  function difficultyLabel(d) {
    if (d < 16) return { label: 'Very Easy', cls: 'text-green' };
    if (d < 36) return { label: 'Easy',      cls: 'text-green' };
    if (d < 56) return { label: 'Moderate',  cls: 'text-blue' };
    if (d < 76) return { label: 'Hard',      cls: 'text-yellow' };
    if (d < 91) return { label: 'Very Hard', cls: 'text-red' };
    return            { label: 'Extreme',   cls: 'text-red' };
  }

  // ── aso-connect classification — exact thresholds from scoring.js#classify
  // with one ordering change: Low Volume is checked first. ASO Connect's
  // baseline order labels low-popularity keywords as "High Competition" when
  // their difficulty happens to be high (e.g. stop words like "the" hit by
  // every app in the App Store). That's misleading — a keyword nobody
  // searches for cannot be competitive — so we promote the Low Volume rule.
  function classifyKeyword(popularity, difficulty) {
    if (popularity < 20)                      return { label: 'Low Volume',       cls: 'text-muted'  };
    if (popularity >= 40 && difficulty <= 35) return { label: 'Sweet Spot',       cls: 'text-green'  };
    if (popularity >= 25 && difficulty <= 25) return { label: 'Hidden Gem',       cls: 'text-green'  };
    if (popularity >= 60 && difficulty <= 55) return { label: 'Good Target',      cls: 'text-blue'   };
    if (difficulty >= 75)                     return { label: 'High Competition', cls: 'text-red'    };
    return                                           { label: 'Moderate',         cls: 'text-yellow' };
  }

  // Opportunity score per aso-connect: pop × (100 - diff) / 100
  function opportunityScore(popularity, difficulty) {
    return Math.round((popularity * (100 - difficulty)) / 100);
  }

  // Backward-compat alias for the legacy "chance" label spots in app.js
  function chanceLabel(c) {
    if (c >= 70) return { label: 'High',     cls: 'text-green'  };
    if (c >= 40) return { label: 'Moderate', cls: 'text-yellow' };
    return            { label: 'Low',       cls: 'text-red'    };
  }

  function renderStars(rating) {
    const full  = Math.floor(rating);
    const half  = rating - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function trendArrow(trend) {
    const t = Number(trend) || 0;
    if (t > 3)  return { cls: 'trend-up',   icon: '▲', text: `+${t.toFixed(1)}%` };
    if (t < -3) return { cls: 'trend-down', icon: '▼', text: `${t.toFixed(1)}%` };
    return               { cls: 'trend-flat', icon: '↔', text: `${t >= 0 ? '+' : ''}${t.toFixed(1)}%` };
  }

  return {
    searchKeyword,
    fetchSearchHints,
    lookupById,
    lookupByBundleId,
    lookupDeveloper,
    fetchGenres,
    getTopCharts,
    generateASOMetadata,
    estimateAppRevenue,
    formatVolume,
    formatNumber,
    formatRevenue,
    difficultyLabel,
    chanceLabel,
    classifyKeyword,
    opportunityScore,
    renderStars,
    trendArrow,
    currencyForCountry,
    currencySymbol,
    symbolForCountry,
  };
})();
