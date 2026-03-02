// Language Translation Engine
(function () {
    const STORAGE_KEY = 'lang';
    const DEFAULT_LANG = 'en';
    const cache = {};

    function getCurrentLang() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    }

    function setLang(lang) {
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.setAttribute('lang', lang);
    }

    async function loadTranslation(lang) {
        if (cache[lang]) return cache[lang];
        // Determine base path: use site's baseurl if defined, otherwise root
        const base = document.querySelector('script[src*="lang.js"]');
        let prefix = '/';
        if (base) {
            const src = base.getAttribute('src');
            // e.g. "/portfolio/lang.js" → "/portfolio/"
            const idx = src.lastIndexOf('/');
            if (idx > 0) prefix = src.substring(0, idx + 1);
        }
        const resp = await fetch(prefix + 'lang/' + lang + '.json');
        const data = await resp.json();
        cache[lang] = data;
        return data;
    }

    async function applyTranslation(lang) {
        const translations = await loadTranslation(lang);
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.getAttribute('data-i18n');
            if (translations[key] !== undefined) {
                // Use innerHTML only for about paragraphs that contain <strong> tags
                if (key.startsWith('about.p')) {
                    el.innerHTML = translations[key];
                } else {
                    el.textContent = translations[key];
                }
            }
        });
        setLang(lang);
        updateToggleButtons(lang);
    }

    function updateToggleButtons(lang) {
        document.querySelectorAll('.lang-toggle').forEach(function (btn) {
            btn.textContent = lang === 'en' ? 'मर' : 'EN';
            btn.setAttribute('aria-label', lang === 'en' ? 'Switch to Marathi' : 'Switch to English');
        });
    }

    function handleToggle() {
        var current = getCurrentLang();
        var next = current === 'en' ? 'mr' : 'en';
        applyTranslation(next);
    }

    // Bind all toggle buttons
    function bindToggles() {
        document.querySelectorAll('.lang-toggle').forEach(function (btn) {
            btn.addEventListener('click', handleToggle);
        });
    }

    // Initialize
    var lang = getCurrentLang();
    setLang(lang);
    bindToggles();
    if (lang !== DEFAULT_LANG) {
        applyTranslation(lang);
    } else {
        updateToggleButtons(lang);
    }
})();
