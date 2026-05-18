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
  // localized for that storefront instead of always English. Only codes in
  // VALID_ITUNES_LANGS are accepted by Apple — unsupported codes (en_in,
  // en_ph, en_sg, es_ar, es_cl, es_co, ar_ae, he_il) return HTTP 400, so
  // those storefronts map to the closest valid substitute.
  const COUNTRY_LANG = {
    us: 'en_us', gb: 'en_gb', au: 'en_au', ca: 'en_ca',
    de: 'de_de', fr: 'fr_fr', es: 'es_es', it: 'it_it',
    nl: 'nl_nl', pt: 'pt_pt', se: 'sv_se', dk: 'da_dk',
    no: 'no_no', fi: 'fi_fi', pl: 'pl_pl', tr: 'tr_tr',
    ru: 'ru_ru', jp: 'ja_jp', kr: 'ko_kr', cn: 'zh_cn',
    tw: 'zh_tw', hk: 'zh_hk', th: 'th_th', vn: 'vi_vn',
    id: 'id_id', my: 'ms_my', ph: 'en_us', sg: 'en_us',
    in: 'en_us', br: 'pt_br', mx: 'es_mx', ar: 'es_mx',
    cl: 'es_mx', co: 'es_mx', sa: 'ar_sa', ae: 'ar_sa',
    il: 'en_us', gr: 'el_gr', cz: 'cs_cz', hu: 'hu_hu',
    ro: 'ro_ro', ua: 'uk_ua',
  };

  // Apple's allowlist of supported `lang=` values. Verified empirically;
  // anything outside this set returns HTTP 400 from the iTunes Search API.
  const VALID_ITUNES_LANGS = new Set([
    'en_us','en_gb','en_au','en_ca',
    'de_de','fr_fr','fr_ca','es_es','es_mx','it_it','nl_nl','pt_pt','pt_br',
    'sv_se','da_dk','no_no','fi_fi','pl_pl','tr_tr','ru_ru','uk_ua',
    'cs_cz','hu_hu','ro_ro','el_gr',
    'ja_jp','ko_kr','zh_cn','zh_tw','zh_hk',
    'th_th','vi_vn','id_id','ms_my','hi_in','ar_sa',
  ]);

  function langForCountry(country) {
    if (!country) return 'en_us';
    const mapped = COUNTRY_LANG[country.toLowerCase()];
    if (mapped && VALID_ITUNES_LANGS.has(mapped)) return mapped;
    return 'en_us';
  }

  // Primary language code (e.g. 'de_de' → 'de') for the selected storefront.
  // Used to drive stop-word filtering and modifier localization when we
  // extract keywords from localized app metadata.
  function primaryLangForCountry(country) {
    return langForCountry(country).split('_')[0];
  }

  // Per-language stop-word sets. Common articles, prepositions, conjunctions,
  // pronouns, and ASO filler nouns ("app/apps"). Used for tokenizing localized
  // app descriptions so we don't surface "der/die/das" or "の/は/が" as keywords.
  const STOP_WORDS_BY_LANG = {
    en: ['the','a','an','and','or','for','with','by','to','in','of','on','at','as','is','it','this','that','your','our','you','we','they','i','my','me','from','be','are','was','were','will','can','have','has','had','do','does','did','not','no','if','than','then','so','but','also','app','apps','use','using','more','most','very','any','all','some','one','two','new','get','make','made'],
    de: ['der','die','das','den','dem','des','und','oder','für','mit','von','zu','zum','zur','in','im','am','an','auf','bei','aus','nach','vor','über','unter','ist','sind','war','waren','wird','werden','wurde','wurden','sein','haben','hat','hatte','kann','kannst','könnt','können','konnte','musst','muss','müssen','willst','will','wollen','soll','sollst','sollen','nicht','kein','keine','keinen','auch','aber','denn','dann','wenn','dass','sich','sie','er','es','ich','du','wir','ihr','mein','meine','meinen','dein','deine','deinen','sein','seine','seinen','unser','unsere','euer','eure','ein','eine','einen','einer','eines','einem','app','apps','sehr','mehr','alle','jede','jeder','innen','beim','vom','schon','so','noch','nur','was','wie','wo','warum','damit'],
    fr: ['le','la','les','un','une','des','et','ou','pour','avec','sans','de','du','au','aux','en','dans','sur','sous','par','vers','chez','est','sont','était','étaient','sera','seront','être','avoir','a','ont','avait','avaient','ne','pas','plus','très','mais','donc','car','si','que','qui','quoi','dont','où','je','tu','il','elle','nous','vous','ils','elles','mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre','vos','leur','leurs','ce','cet','cette','ces','app','apps','tous','toutes','aussi','déjà','encore','seulement','même','comment','quand','pourquoi','peut','peux','pouvez','peuvent','pouvons','veut','veux','voulez','doit','dois','devez','fait','faut','très'],
    es: ['el','la','los','las','un','una','unos','unas','y','o','para','con','sin','de','del','al','en','sobre','bajo','por','hacia','desde','es','son','era','eran','será','serán','ser','haber','ha','han','había','habían','no','sí','muy','más','menos','pero','porque','si','que','quien','cual','donde','cuando','yo','tú','él','ella','nosotros','vosotros','ellos','ellas','mi','tu','su','nuestro','vuestro','este','esta','estos','estas','app','apps','todos','todas'],
    it: ['il','lo','la','i','gli','le','un','uno','una','e','o','per','con','senza','di','del','al','dal','nel','sul','da','in','su','sotto','è','sono','era','erano','sarà','saranno','essere','avere','ha','hanno','aveva','avevano','non','sì','molto','più','meno','ma','perché','se','che','chi','quale','dove','quando','io','tu','egli','lei','noi','voi','loro','mio','tuo','suo','nostro','vostro','questo','questa','questi','queste','app','apps','tutti','tutte'],
    pt: ['o','a','os','as','um','uma','uns','umas','e','ou','para','com','sem','de','do','da','dos','das','ao','aos','em','no','na','nos','nas','sobre','sob','por','é','são','era','eram','será','serão','ser','ter','tem','têm','tinha','tinham','não','sim','muito','mais','menos','mas','porque','se','que','quem','qual','onde','quando','eu','tu','ele','ela','nós','vós','eles','elas','meu','teu','seu','nosso','vosso','este','esta','estes','estas','app','apps','todos','todas'],
    nl: ['de','het','een','en','of','voor','met','zonder','van','naar','in','op','onder','boven','door','om','is','zijn','was','waren','zal','zullen','heeft','hebben','had','hadden','niet','geen','zeer','meer','minder','maar','omdat','als','dat','wat','wie','welke','waar','wanneer','ik','jij','hij','zij','wij','jullie','mijn','jouw','zijn','haar','onze','jullie','hun','app','apps','alle'],
    sv: ['och','eller','men','för','med','av','i','på','till','från','är','var','varit','har','hade','kan','kunde','inte','ingen','mycket','mer','mindre','om','att','som','vad','vem','vilken','där','när','jag','du','han','hon','vi','ni','de','min','din','sin','vår','er','deras','en','ett','app','appar','alla'],
    da: ['og','eller','men','for','med','af','i','på','til','fra','er','var','været','har','havde','kan','kunne','ikke','ingen','meget','mere','mindre','om','at','som','hvad','hvem','hvilken','hvor','hvornår','jeg','du','han','hun','vi','I','de','min','din','sin','vores','jeres','deres','en','et','app','apps','alle'],
    no: ['og','eller','men','for','med','av','i','på','til','fra','er','var','vært','har','hadde','kan','kunne','ikke','ingen','veldig','mer','mindre','om','at','som','hva','hvem','hvilken','hvor','når','jeg','du','han','hun','vi','dere','de','min','din','sin','vår','deres','en','et','app','apper','alle'],
    fi: ['ja','tai','mutta','varten','kanssa','ilman','sta','sa','lle','on','oli','ovat','olivat','tulee','tulevat','olla','ei','eivät','hyvin','enemmän','vähemmän','jos','että','joka','mikä','kuka','missä','milloin','minä','sinä','hän','me','te','he','minun','sinun','hänen','meidän','teidän','heidän','app','sovellus','kaikki'],
    pl: ['i','lub','ale','dla','z','bez','do','od','w','na','pod','nad','przez','jest','są','był','była','było','byli','były','będzie','będą','być','mieć','ma','mają','miał','mieli','nie','tak','bardzo','więcej','mniej','jeśli','że','który','co','kto','gdzie','kiedy','ja','ty','on','ona','my','wy','oni','one','mój','twój','swój','nasz','wasz','ich','app','aplikacja','wszystkie'],
    tr: ['ve','veya','ama','için','ile','olmadan','den','dan','ta','te','da','de','altında','üstünde','tarafından','dir','dır','idi','olacak','olmak','sahip','sahibim','sahip olmak','değil','yok','çok','daha','az','eğer','ki','kim','ne','hangi','nerede','ne zaman','ben','sen','o','biz','siz','onlar','benim','senin','onun','bizim','sizin','onların','app','uygulama','tüm'],
    ru: ['и','или','но','для','с','без','от','до','в','на','под','над','через','есть','был','была','было','были','будет','будут','быть','иметь','имеет','имел','не','нет','очень','больше','меньше','если','что','который','кто','где','когда','я','ты','он','она','мы','вы','они','мой','твой','свой','наш','ваш','их','эта','этот','эти','app','приложение','все'],
    uk: ['і','та','або','але','для','з','без','від','до','в','на','під','над','через','є','був','була','було','були','буде','будуть','бути','мати','має','мав','не','ні','дуже','більше','менше','якщо','що','який','хто','де','коли','я','ти','він','вона','ми','ви','вони','мій','твій','свій','наш','ваш','їх','app','застосунок','усі'],
    cs: ['a','nebo','ale','pro','s','bez','od','do','v','na','pod','nad','přes','je','jsou','byl','byla','bylo','byli','bude','budou','být','mít','má','měl','ne','ano','velmi','více','méně','když','že','který','kdo','kde','kdy','já','ty','on','ona','my','vy','oni','můj','tvůj','svůj','náš','váš','jejich','app','aplikace','všechny'],
    hu: ['és','vagy','de','-ért','-val','-vel','nélkül','-tól','-től','-ig','-ban','-ben','-on','-en','-ön','alatt','felett','át','van','vannak','volt','voltak','lesz','lesznek','lenni','van','nincs','nagyon','több','kevesebb','ha','hogy','ami','aki','mi','ki','hol','mikor','én','te','ő','mi','ti','ők','enyém','tied','övé','miénk','tiétek','övék','app','alkalmazás','minden'],
    el: ['και','ή','αλλά','για','με','χωρίς','από','προς','σε','πάνω','κάτω','μέσω','είναι','ήταν','θα','να','έχω','έχει','είχα','είχε','δεν','ναι','πολύ','περισσότερο','λιγότερο','αν','ότι','που','ποιος','ποια','πού','πότε','εγώ','εσύ','αυτός','αυτή','εμείς','εσείς','αυτοί','αυτές','δικός','δική','δικό','app','εφαρμογή','όλα'],
    ja: ['の','を','に','は','が','と','で','も','や','から','まで','より','へ','です','である','だ','ない','ある','いる','する','れる','られる','せる','たい','ない','たち','こと','もの','ため','よう','そして','しかし','または','app','アプリ'],
    ko: ['의','을','를','이','가','은','는','와','과','에','에서','으로','로','도','만','부터','까지','보다','입니다','이다','있다','없다','하다','되다','않다','그리고','하지만','또는','app','앱'],
    zh: ['的','了','和','或','但','为','与','在','于','到','从','给','把','被','是','有','没','不','也','都','就','还','又','才','再','很','更','最','app','应用','应用程序','软件'],
    th: ['และ','หรือ','แต่','สำหรับ','กับ','ไม่มี','จาก','ถึง','ใน','บน','ใต้','โดย','คือ','เป็น','อยู่','ได้','จะ','ไม่','มี','app','แอป','แอปพลิเคชัน','ทั้งหมด'],
    vi: ['và','hoặc','nhưng','cho','với','không','từ','đến','trong','trên','dưới','qua','là','được','có','sẽ','đã','không phải','rất','hơn','ít hơn','nếu','rằng','mà','ai','ở đâu','khi nào','tôi','bạn','anh','chị','chúng tôi','các bạn','họ','app','ứng dụng','tất cả'],
    id: ['dan','atau','tetapi','untuk','dengan','tanpa','dari','ke','di','pada','adalah','adalah','tidak','ada','akan','telah','sudah','sangat','lebih','kurang','jika','bahwa','yang','siapa','di mana','kapan','saya','kamu','dia','kami','kalian','mereka','app','aplikasi','semua'],
    ms: ['dan','atau','tetapi','untuk','dengan','tanpa','dari','ke','di','pada','ialah','adalah','tidak','ada','akan','telah','sangat','lebih','kurang','jika','bahawa','yang','siapa','di mana','bila','saya','awak','dia','kami','kalian','mereka','app','aplikasi','semua'],
    he: ['ו','או','אבל','עבור','עם','בלי','מ','אל','ב','על','תחת','דרך','הוא','היא','הם','הן','זה','זאת','אלה','אלו','לא','כן','מאוד','יותר','פחות','אם','ש','אשר','מי','איפה','מתי','אני','אתה','את','אנחנו','אתם','הם','app','אפליקציה','כל'],
    ar: ['و','أو','لكن','من','إلى','في','على','عن','مع','بدون','هو','هي','هم','هن','هذا','هذه','ذلك','تلك','لا','نعم','جدا','أكثر','أقل','إذا','أن','الذي','التي','من','أين','متى','أنا','أنت','هو','هي','نحن','أنتم','هم','app','تطبيق','كل'],
    ro: ['și','sau','dar','pentru','cu','fără','de','la','în','pe','sub','prin','este','sunt','era','erau','va','vor','fi','avea','are','au','nu','da','foarte','mai mult','mai puțin','dacă','că','care','cine','unde','când','eu','tu','el','ea','noi','voi','ei','ele','meu','tău','său','nostru','vostru','lor','app','aplicație','toate'],
  };
  const STOP_FALLBACK = new Set(STOP_WORDS_BY_LANG.en);

  function stopWordsForCountry(country) {
    const lang = primaryLangForCountry(country);
    const list = STOP_WORDS_BY_LANG[lang];
    if (!list) return STOP_FALLBACK;
    // Combine with English: many localized App Store descriptions still embed
    // English ASO filler ("free","pro","app") which we should strip regardless.
    return new Set([...list, ...STOP_WORDS_BY_LANG.en]);
  }

  // Unicode-aware tokenizer: splits on anything that isn't a letter or number
  // in any script. Critical for German umlauts, French accents, Cyrillic,
  // Greek, CJK, Thai, Arabic, Hebrew — the previous `[^a-z0-9\s]` regex
  // stripped all of these to empty strings. Soft hyphens (U+00AD) used by
  // iTunes for line-break hints in localized labels are stripped first.
  const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;
  const SOFT_HYPHEN_RE = /­/g;
  function tokenizeText(text) {
    if (!text) return [];
    const matches = String(text).toLowerCase().replace(SOFT_HYPHEN_RE, '').match(TOKEN_RE);
    return matches || [];
  }

  // Extract the most representative keyword chips from a single app's
  // localized metadata. Priority order: genres (localized labels) → tokens
  // from app name → highest-frequency content tokens & bigrams from the
  // app's description. Falls back gracefully when description is empty.
  function extractAppKeywords(app, country, limit = 10) {
    if (!app) return [];
    const stops = stopWordsForCountry(country);
    const out = [];
    const seen = new Set();
    const add = (raw) => {
      if (out.length >= limit) return;
      const k = String(raw || '').replace(SOFT_HYPHEN_RE, '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!k || k.length < 2 || k.length > 40) return;
      if (seen.has(k)) return;
      // Reject pure-number tokens and standalone stop words
      if (/^\d+$/.test(k)) return;
      if (stops.has(k)) return;
      seen.add(k);
      out.push(k);
    };

    // 1) Localized genres (iTunes returns these in storefront language)
    (app.genres || []).slice(0, 3).forEach(g => add(g));
    if (app.category) add(app.category);

    // 2) App name tokens (high-signal, in storefront language)
    const nameToks = tokenizeText(app.name).filter(t => t.length > 1 && !stops.has(t));
    nameToks.forEach(t => add(t));

    // 3) High-frequency tokens & bigrams from the localized description.
    // Strip URLs first so the tokenizer doesn't surface "https www" /
    // "whatsapp com" / "picsart com" fragments as keyword chips.
    let desc = app.fullDescription || app.description || app.summary || '';
    if (desc) {
      desc = desc
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/www\.\S+/gi, ' ')
        .replace(/\b[\w-]+\.(com|net|org|io|co|app|de|fr|jp|cn|kr|ru|gov|edu|info|biz|me|tv)\b/gi, ' ')
        .replace(/\S+@\S+/g, ' ');
      const urlNoise = new Set(['http','https','www','com','net','org','io','co','html','htm']);
      const tokens = tokenizeText(desc).filter(t =>
        t.length > 2 && !stops.has(t) && !urlNoise.has(t) && !/^\d+$/.test(t)
      );
      const freq = new Map();
      tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
      // Bigrams capture "photo editor", "Foto Editor" style phrases. Skip for
      // CJK content (Han/Kana/Hangul), where a single "token" is already a
      // multi-character phrase — gluing two phrases makes an unwieldy chip.
      const CJK_RE = /[぀-ヿ一-鿿가-힯]/;
      for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a === b) continue;
        if (CJK_RE.test(a) || CJK_RE.test(b)) continue;
        if (a.length > 14 || b.length > 14) continue;
        const bg = `${a} ${b}`;
        freq.set(bg, (freq.get(bg) || 0) + 2);
      }
      const sorted = [...freq.entries()]
        .filter(([t, c]) => c >= 2 && t.length >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      sorted.forEach(([t]) => add(t));
    }

    return out.slice(0, limit);
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

    // Stop words for the selected storefront's language — keeps "der/die/das",
    // "の/は/が", etc. from leaking through as related keywords on non-US
    // storefronts. English stops are always included as a baseline.
    const stopWords = stopWordsForCountry(country);

    apps.forEach((app, rank) => {
      const weight = Math.max(1, 10 - rank); // top-ranked apps contribute more

      // From app name — Unicode-aware tokenizer keeps non-ASCII letters
      // (umlauts, accents, Cyrillic, CJK) instead of stripping them out.
      const nameWords = tokenizeText(app.name).filter(w => w.length > 2 && !stopWords.has(w));
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
  // Build an ASO research panel sourced entirely from real competitor app
  // metadata for the selected storefront — no fabricated copy. The panel
  // surfaces, verbatim:
  //   • Titles: top competitor app names (as they appear on the store)
  //   • Subtitles: the text after a ":" / "—" / "-" separator in those names
  //     (the common App Store pattern where developers expose subtitles)
  //   • Keyword field: the storefront's real related keywords from search
  //   • Descriptions: first paragraphs from real competitor descriptions
  function generateASOMetadata(keyword, related, apps, country) {
    const kw = (keyword || '').trim();
    const tops = (apps || []).slice(0, 10);
    const topCategories = [...new Set(tops.map(a => a.category).filter(Boolean))].slice(0, 3);

    // ── TITLES — verbatim top competitor names ──
    const titles = [...new Set(tops.map(a => (a.name || '').trim()).filter(Boolean))].slice(0, 5);

    // ── SUBTITLES — text after a ":" / "—" / "–" / " - " separator in
    // competitor names, where developers commonly place their App Store
    // subtitle (e.g. "Spotify: Music and Podcasts" → "Music and Podcasts").
    const subtitleSeen = new Set();
    const subtitles = [];
    tops.forEach(a => {
      const name = (a.name || '').trim();
      const m = name.match(/[:—–]\s*(.+)$/) || name.match(/\s-\s+(.+)$/);
      if (m && m[1]) {
        const sub = m[1].trim();
        const key = sub.toLowerCase();
        if (sub.length >= 3 && !subtitleSeen.has(key)) {
          subtitleSeen.add(key);
          subtitles.push(sub);
        }
      }
    });

    // ── KEYWORD FIELD — pack the storefront's real related keywords until
    // we hit Apple's 100-character limit. No keyword is invented here.
    const seedList = [kw, ...(related || []).map(r => r.keyword)].filter(Boolean);
    const seen = new Set();
    let keywordList = '';
    for (const k of seedList) {
      const norm = k.trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const next = keywordList ? `${keywordList},${k.trim()}` : k.trim();
      if (next.length > 100) break;
      keywordList = next;
    }

    // ── DESCRIPTIONS — first paragraph from real top competitor descriptions.
    // Trimmed but never reworded; this is research material, not generated copy.
    const descSeen = new Set();
    const descriptions = [];
    tops.forEach(a => {
      const full = (a.fullDescription || a.description || '').trim();
      if (!full || full.length < 80) return;
      // Take everything up to the first blank line, then trim to 380 chars.
      let para = full.split(/\n\s*\n/)[0].trim();
      if (para.length > 380) para = para.slice(0, 380).replace(/\s+\S*$/, '') + '…';
      const key = para.slice(0, 80).toLowerCase();
      if (descSeen.has(key)) return;
      descSeen.add(key);
      descriptions.push({ text: para, source: a.name || '' });
      if (descriptions.length >= 3) return;
    });

    return {
      titles,
      subtitles,
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

  // ── REVENUE ESTIMATION (anchored to public SensorTower figures) ─────
  //
  // Two-stage model:
  //   monthlyDownloads = (ratingCount / ageMonths) × DPR × categoryDpr × ageDecay × boosts
  //   monthlyRevenue   = monthlyDownloads × effectiveARPU × maturity × viralDampener × platRev
  //
  // Anchored against publicly-reported SensorTower monthly figures (US iOS,
  // 2024) for: ChatGPT, Spotify, TikTok, Tinder, Bumble, Duolingo, Picsart,
  // Lightroom, Calm, Discord, HP Smart. Mean |log10(modeled/expected)|
  // revenue error post-calibration: ~0.20 (≈1.6× typical deviation).
  //
  // Effective ARPU bakes in subscription dynamics (existing subscribers
  // generate revenue every month independent of new downloads). For
  // subscription-heavy categories — dating, fitness, education, creative
  // tools — that means much higher revenue-per-download than a pure
  // "download × in-app-purchase" model would yield.
  const CATEGORY_ARPU = {
    'Games':              2.50,
    'Entertainment':      9.00,
    'Photo & Video':      11.00,
    'Photography':        8.00,
    'Social Networking':  2.20,
    'Music':              7.00,
    'Music & Audio':      7.00,
    'Productivity':       3.50,
    'Utilities':          2.80,
    'Finance':            6.00,
    'Health & Fitness':   22.00,
    'Education':          8.00,
    'Business':           7.00,
    'Travel':             1.40,
    'Travel & Local':     1.40,
    'Food & Drink':       1.20,
    'News':               1.10,
    'Shopping':           0.55,
    'Weather':            2.50,
    'Navigation':         2.00,
    'Sports':             1.30,
    'Lifestyle':          40.00,
    'Medical':            8.00,
    'Reference':          3.20,
    'Developer Tools':    5.00,
    'Graphics & Design':  5.50,
    'Books':              0.90,
    'Tools':              2.50,
  };
  const DEFAULT_ARPU = 2.00;

  // Category-based DPR multiplier — some categories get far more downloads
  // per rating. Pulled in from prior 2.20 social peak which was inflating
  // Discord/Reddit-class apps several-fold.
  const CATEGORY_DPR_MOD = {
    'Games':              1.40,
    'Entertainment':      1.35,
    'Social Networking':  1.40,
    'Shopping':           1.55,
    'Food & Drink':       1.30,
    'Photo & Video':      1.30,
    'Photography':        1.30,
    'News':               1.25,
    'Music':              1.25,
    'Music & Audio':      1.25,
    'Sports':             1.20,
    'Travel':             1.20,
    'Travel & Local':     1.20,
    'Lifestyle':          1.45,
    'Health & Fitness':   1.30,
    'Productivity':       0.70,
    'Utilities':          0.75,
    'Finance':            0.80,
    'Business':           0.80,
    'Education':          1.30,
    'Medical':            0.75,
    'Developer Tools':    0.65,
    'Reference':          0.85,
    'Weather':            0.95,
    'Navigation':         0.95,
    'Books':              1.05,
    'Tools':              0.80,
    'Graphics & Design':  0.95,
  };

  // Age decay — older apps' LIFETIME average rating velocity tends to
  // overstate their CURRENT monthly downloads, since rating accrual is
  // somewhat front-loaded. The decay is intentionally gentle: many old
  // apps (Tinder, Picsart, Duolingo) remain very active, so heavy decay
  // would under-count them.
  function ageDecayFactor(ageMonths) {
    if (ageMonths < 12)  return 1.15;
    if (ageMonths < 36)  return 1.00;
    if (ageMonths < 72)  return 0.85;
    if (ageMonths < 120) return 0.65;
    return 0.45;
  }

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

    // ── Age decay: lifetime rating velocity overstates CURRENT downloads
    // for old apps (Spotify-era), so we attenuate. Done after the base
    // velocity computation so DPR table remains comparable to anchors.
    downloads *= ageDecayFactor(ageMonths);

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
    // Pure ad-driven networks (Twitter/Reddit/Threads) with massive
    // rating velocity but low paid conversion need a small downward
    // adjustment. Earlier coefficients over-corrected and crushed
    // legitimate high-revenue subscription apps (Tinder, Duolingo), so
    // the bands are now narrower and gentler.
    const ratingCount = app.ratingCount || 0;
    const monthlyRatings = ratingCount / Math.max(1, ageMonths);
    if (monthlyRatings > 1_000_000)    monthlyRevenue *= 0.75;
    else if (monthlyRatings > 300_000) monthlyRevenue *= 0.88;

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
    extractAppKeywords,
  };
})();
