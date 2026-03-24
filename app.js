/* ═══════════════════════════════════════════════════════════
   LUMINARY — app.js
   T-03: OS theme auto-detection
   T-04: Manual theme toggle
   T-05: localStorage theme persistence
   T-13: Random quote on button click
   T-14: Daily quote logic (date-seeded)
   T-15: Auto-load daily quote on visit
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════
     STATE
  ═══════════════════════════════════════ */
  const state = {
    currentQuote:   null,   // quote object currently displayed
    currentCategory:'all',  // active category filter
    favorites:      [],     // array of quote IDs
    isAnimating:    false,  // prevent rapid-click animation stacking
    history:        [],     // quote navigation history (for prev)
    historyIndex:   -1,     // pointer into history
  };


  /* ═══════════════════════════════════════
     DOM REFERENCES
  ═══════════════════════════════════════ */
  const $ = id => document.getElementById(id);

  const dom = {
    html:           document.documentElement,
    // Theme
    btnTheme:       $('btn-theme'),
    metaTheme:      $('meta-theme-color'),
    // Quote display
    quoteCard:      $('quote-card'),
    quoteText:      $('quote-text'),
    quoteAuthor:    $('quote-author'),
    quoteCategory:  $('quote-category'),
    // Navigation
    btnNext:        $('btn-next'),
    btnNextArrow:   $('btn-next-arrow'),
    btnPrev:        $('btn-prev'),
    // Actions
    btnCopy:        $('btn-copy'),
    btnShare:       $('btn-share'),
    btnFavorite:    $('btn-favorite'),
    btnDownload:    $('btn-download'),
    // Category filter
    btnFilter:      $('btn-filter'),
    categoryDrawer: $('category-drawer'),
    chips:          document.querySelectorAll('.chip'),
    // Favorites drawer
    btnFavorites:   $('btn-favorites'),
    favoritesDrawer:$('favorites-drawer'),
    btnCloseFavs:   $('btn-close-favorites'),
    favoritesList:  $('favorites-list'),
    favoritesEmpty: $('favorites-empty'),
    favoritesCount: $('favorites-count'),
    // Download modal
    btnDownloadEl:  $('btn-download'),
    downloadModal:  $('download-modal'),
    btnCloseModal:  $('btn-close-modal'),
    exportOptions:  document.querySelectorAll('[data-export-theme]'),
    // Export card
    exportCard:     $('export-card'),
    exportQuote:    $('export-quote'),
    exportAuthor:   $('export-author'),
    // Toast
    toast:          $('toast'),
    toastMessage:   $('toast-message'),
    // Keyboard hint
    keyboardHint:   $('keyboard-hint'),
    // Daily badge
    dailyBadge:     document.querySelector('.daily-badge'),
  };


  /* ═══════════════════════════════════════
     THEME MANAGEMENT
     T-03, T-04, T-05
  ═══════════════════════════════════════ */
  const THEME_KEY = 'luminary_theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    dom.html.setAttribute('data-theme', theme);
    if (dom.btnTheme) {
      dom.btnTheme.setAttribute('aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      );
    }
    if (dom.metaTheme) {
      dom.metaTheme.setAttribute('content',
        theme === 'dark' ? '#0E0E0E' : '#FAF9F6'
      );
    }
  }

  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = dom.html.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Apply theme immediately before paint (no flash)
  applyTheme(getPreferredTheme());

  // Live OS theme change (only if user hasn't manually set one)
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', e => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });


  /* ═══════════════════════════════════════
     QUOTE DISPLAY
  ═══════════════════════════════════════ */
  function renderQuote(quote, direction = 'next') {
    if (!quote) return;

    const card = dom.quoteCard;

    // If already animating, snap to end and continue
    if (state.isAnimating) {
      card.classList.remove('is-exiting', 'is-entering');
      state.isAnimating = false;
    }

    state.isAnimating = true;

    // Set direction for animation
    if (direction === 'prev') {
      card.classList.add('is-reverse');
    } else {
      card.classList.remove('is-reverse');
    }

    // Exit animation
    card.classList.add('is-exiting');

    setTimeout(() => {
      // Update content
      state.currentQuote = quote;
      dom.quoteText.textContent   = quote.text;
      dom.quoteAuthor.textContent = quote.author;
      dom.quoteCategory.textContent = quote.category;

      // Update favorite button state
      updateFavoriteButton(quote.id);

      updateNavButtons(); // Add this line here

      // Update URL without reload (deep link support)
      const url = new URL(window.location);
      url.searchParams.set('q', quote.id);
      window.history.replaceState({}, '', url);

      // Swap animation classes
      card.classList.remove('is-exiting');
      card.classList.add('is-entering');

      setTimeout(() => {
        card.classList.remove('is-entering', 'is-reverse');
        state.isAnimating = false;
      }, 300);

    }, 200);
  }


  /* ═══════════════════════════════════════
     NAVIGATION HISTORY
     Enables prev/next browsing
  ═══════════════════════════════════════ */
  function pushToHistory(quote) {
    // Trim forward history if we branched
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(quote);
    state.historyIndex = state.history.length - 1;
  }

  async function showNext() {
    if (state.isAnimating) return;

    // 1. If there is history to move into, just move forward
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      renderQuote(state.history[state.historyIndex], 'next');
      return;
    }

    // 2. Otherwise, if we are at the end, fetch a brand new quote
    await generateNewQuote();
  }

  async function generateNewQuote() {
    if (state.isAnimating) return;
    
    // Always fetch a fresh random quote
    const quote = await quoteService.getRandom(
      state.currentCategory,
      state.currentQuote?.id ?? null
    );
    
    if (quote) {
      pushToHistory(quote); // Automatically trims forward history if they went back!
      renderQuote(quote, 'next');
    }
  }

  async function showPrev() {
    if (state.isAnimating) return;
    if (state.historyIndex <= 0) return; // nothing before first

    state.historyIndex--;
    renderQuote(state.history[state.historyIndex], 'prev');
  }

  function updateNavButtons() {
    if (!dom.btnPrev) return;
    
    // Disable/dim the Back arrow if we are at the very first quote
    const atStart = state.historyIndex <= 0;
    dom.btnPrev.disabled = atStart;
    dom.btnPrev.style.opacity = atStart ? '0.3' : '1';
    dom.btnPrev.style.pointerEvents = atStart ? 'none' : 'auto';
  }


  /* ═══════════════════════════════════════
     DAILY QUOTE
     T-14, T-15
  ═══════════════════════════════════════ */
  async function loadDailyQuote() {
    const quote = await quoteService.getDaily();
    if (quote) {
      pushToHistory(quote);
      // Render without animation on first load
      state.currentQuote = quote;
      dom.quoteText.textContent     = quote.text;
      dom.quoteAuthor.textContent   = quote.author;
      dom.quoteCategory.textContent = quote.category;
      updateFavoriteButton(quote.id);
      updateNavButtons();
      // Set deep link URL
      const url = new URL(window.location);
      url.searchParams.set('q', quote.id);
      window.history.replaceState({}, '', url);
    }
  }


  /* ═══════════════════════════════════════
     DEEP LINK — load specific quote from URL
     e.g. luminary.app/?q=42
  ═══════════════════════════════════════ */
  async function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const qId    = params.get('q');
    if (!qId) return false;

    const quote = await quoteService.getById(qId);
    if (quote) {
      pushToHistory(quote);
      state.currentQuote            = quote;
      dom.quoteText.textContent     = quote.text;
      dom.quoteAuthor.textContent   = quote.author;
      dom.quoteCategory.textContent = quote.category;
      updateFavoriteButton(quote.id);
      updateNavButtons(); // Add this line here
      return true;
    }
    return false;
  }


  /* ═══════════════════════════════════════
     CATEGORY FILTER
     T-18, T-19
  ═══════════════════════════════════════ */
  function setCategory(category) {
    state.currentCategory = category;

    // Update chip active states
    dom.chips.forEach(chip => {
      const isActive = chip.dataset.category === category;
      chip.classList.toggle('chip-active', isActive);
    });
  }

  function toggleCategoryDrawer() {
    const isHidden = dom.categoryDrawer.hidden;
    dom.categoryDrawer.hidden = !isHidden;
    dom.btnFilter.setAttribute('aria-expanded', String(isHidden));
  }


  /* ═══════════════════════════════════════
     FAVORITES
  ═══════════════════════════════════════ */
  const FAV_KEY = 'luminary_favorites';

  function loadFavorites() {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      state.favorites = stored ? JSON.parse(stored) : [];
    } catch {
      state.favorites = [];
    }
  }

  function saveFavorites() {
    localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
  }

  function isFavorite(id) {
    return state.favorites.includes(id);
  }

  function toggleFavorite(id) {
    if (isFavorite(id)) {
      state.favorites = state.favorites.filter(f => f !== id);
    } else {
      state.favorites.unshift(id); // add to front
    }
    saveFavorites();
    updateFavoriteButton(id);
    updateFavoritesCount();
    renderFavoritesList();
  }

  function updateFavoriteButton(id) {
    if (!dom.btnFavorite) return;
    const active = isFavorite(id);
    dom.btnFavorite.classList.toggle('is-active', active);
    dom.btnFavorite.setAttribute('aria-pressed', String(active));

    // Pulse animation
    dom.btnFavorite.classList.remove('is-pulsing');
    void dom.btnFavorite.offsetWidth; // force reflow
    dom.btnFavorite.classList.add('is-pulsing');
  }

  function updateFavoritesCount() {
    const count = state.favorites.length;
    if (dom.favoritesCount) {
      dom.favoritesCount.hidden  = count === 0;
      dom.favoritesCount.textContent = count > 99 ? '99+' : String(count);
    }
  }

  async function renderFavoritesList() {
    if (!dom.favoritesList) return;

    if (state.favorites.length === 0) {
      dom.favoritesList.innerHTML = '';
      dom.favoritesEmpty.hidden   = false;
      return;
    }

    dom.favoritesEmpty.hidden = true;
    const quotes = await quoteService.getByIds(state.favorites);

    dom.favoritesList.innerHTML = quotes.map(q => `
      <li class="favorite-item" data-id="${q.id}">
        <div class="favorite-item-body" role="button" tabindex="0" aria-label="View quote by ${q.author}">
          <p class="favorite-item-quote">${q.text}</p>
          <span class="favorite-item-author">— ${q.author}</span>
        </div>
        <button class="favorite-item-remove" data-id="${q.id}" aria-label="Remove quote by ${q.author} from favorites">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </li>
    `).join('');

    // Click body to view quote
    dom.favoritesList.querySelectorAll('.favorite-item-body').forEach(body => {
      body.addEventListener('click', async () => {
        const quote = await quoteService.getById(body.closest('.favorite-item').dataset.id);
        if (quote) {
          pushToHistory(quote);
          renderQuote(quote);
          closeFavoritesDrawer();
        }
      });
      // Keyboard support
      body.addEventListener('keydown', async e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          body.click();
        }
      });
    });

    // Click remove button to delete from favorites
    dom.favoritesList.querySelectorAll('.favorite-item-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        toggleFavorite(id);
        // If current quote is the one removed, update its heart button
        if (state.currentQuote?.id === id) updateFavoriteButton(id);
      });
    });
  }

  function openFavoritesDrawer() {
    renderFavoritesList();
    dom.favoritesDrawer.hidden = false;
    dom.favoritesDrawer.removeAttribute('hidden');
    showBackdrop();
    dom.btnFavorites.setAttribute('aria-expanded', 'true');
    // Focus first item or close button
    setTimeout(() => dom.btnCloseFavs?.focus(), 50);
  }

  function closeFavoritesDrawer() {
    dom.favoritesDrawer.hidden = true;
    hideBackdrop();
    dom.btnFavorites.setAttribute('aria-expanded', 'false');
    dom.btnFavorites.focus();
  }


  /* ═══════════════════════════════════════
     BACKDROP
  ═══════════════════════════════════════ */
  const backdrop = document.getElementById('drawer-backdrop');

  function showBackdrop() {
    if (!backdrop) return;
    backdrop.hidden = false;
    backdrop.removeAttribute('hidden');
  }

  function hideBackdrop() {
    if (!backdrop) return;
    backdrop.hidden = true;
  }


  /* ═══════════════════════════════════════
     COPY TO CLIPBOARD
  ═══════════════════════════════════════ */
  async function copyQuote() {
    if (!state.currentQuote) return;

    const text = `"${state.currentQuote.text}" — ${state.currentQuote.author}`;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
      // Visual feedback on button
      if (dom.btnCopy) {
        const span = dom.btnCopy.querySelector('span');
        if (span) {
          const orig = span.textContent;
          span.textContent = 'Copied!';
          setTimeout(() => { span.textContent = orig; }, 1500);
        }
      }
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity  = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('Copied to clipboard!');
    }
  }


  /* ═══════════════════════════════════════
     SHARE
  ═══════════════════════════════════════ */
  async function shareQuote() {
    if (!state.currentQuote) return;

    const q    = state.currentQuote;
    const url  = `${window.location.origin}${window.location.pathname}?q=${q.id}`;
    const text = `"${q.text}" — ${q.author}`;

    // Mobile: Web Share API
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Luminary', text, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
      }
    }

    // Desktop fallback: copy text + URL together
    const full = `${text}\n\n${url}`;
    try {
      await navigator.clipboard.writeText(full);
      showToast('Link copied — ready to share!');
    } catch {
      showToast('Could not copy. Try manually.');
    }
  }


  /* ═══════════════════════════════════════
     TOAST
  ═══════════════════════════════════════ */
  let toastTimer = null;

  function showToast(message, duration = 2000) {
    if (!dom.toast) return;
    dom.toastMessage.textContent = message;
    dom.toast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.hidden = true;
    }, duration);
  }


  /* ═══════════════════════════════════════
     IMAGE EXPORT — T-35
     Renders off-screen card via html2canvas
     and downloads as luminary-quote-{id}.png
  ═══════════════════════════════════════ */
  async function exportQuoteAsImage(exportTheme) {
    if (!state.currentQuote) return;
    if (!window.html2canvas) {
      showToast('Export not available. Try again shortly.');
      return;
    }

    const q = state.currentQuote;

    // Populate the off-screen export card
    dom.exportQuote.textContent  = q.text;
    dom.exportAuthor.textContent = `— ${q.author}`;

    // Apply chosen theme to export card
    const card = dom.exportCard;
    card.setAttribute('data-theme', exportTheme);

    // Set explicit theme colors directly on the card
    // (html2canvas doesn't read CSS custom properties reliably)
    const isLight = exportTheme === 'light';
    card.style.backgroundColor    = isLight ? '#FAF9F6' : '#0E0E0E';
    dom.exportQuote.style.color   = isLight ? '#1A1A1A' : '#F0EBE1';
    dom.exportAuthor.style.color  = isLight ? '#6B6B6B' : '#A09A90';

    const exportLogoText = card.querySelector('.export-logo-text');
    if (exportLogoText) {
      exportLogoText.style.color = isLight ? '#1A1A1A' : '#F0EBE1';
    }
    const exportTagline = card.querySelector('.export-tagline');
    if (exportTagline) {
      exportTagline.style.color  = isLight ? '#C9A84C' : '#D4A853';
    }

    // Show loading toast
    showToast('Preparing your image…', 5000);

    try {
      // Move card into viewport temporarily for html2canvas
      card.style.position = 'fixed';
      card.style.left     = '-9999px';
      card.style.top      = '0';
      card.style.width    = '1080px';
      card.style.height   = '1080px';

      const canvas = await html2canvas(card, {
        width:           1080,
        height:          1080,
        scale:           1,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: isLight ? '#FAF9F6' : '#0E0E0E',
        logging:         false,
      });

      // Restore card position
      card.style.position = 'fixed';
      card.style.left     = '-9999px';
      card.style.top      = '-9999px';

      // Trigger download
      const safeName   = q.author
        .normalize('NFD')                    // decompose accented chars
        .replace(/[\u0300-\u036f]/g, '')     // strip accents
        .replace(/[^a-zA-Z0-9\s-]/g, '')    // strip special chars
        .trim()
        .replace(/\s+/g, '-');               // spaces to dashes
      const filename   = `Luminary-${safeName}-${q.id}.png`;
      const link       = document.createElement('a');
      link.download    = filename;
      link.href        = canvas.toDataURL('image/png');
      link.click();

      showToast('Downloaded!');

    } catch (err) {
      console.error('[Luminary] Export failed:', err);
      showToast('Export failed. Please try again.');

      // Restore card position on error
      card.style.left = '-9999px';
      card.style.top  = '-9999px';
    }
  }


  /* ═══════════════════════════════════════
     DOWNLOAD MODAL
  ═══════════════════════════════════════ */
  function openDownloadModal() {
    if (dom.downloadModal) dom.downloadModal.showModal();
  }

  function closeDownloadModal() {
    if (dom.downloadModal) dom.downloadModal.close();
  }
  const KB_HINT_KEY = 'luminary_kb_hint_shown';

  function showKeyboardHint() {
    if (!dom.keyboardHint) return;
    // Only show on desktop and only once
    if (window.innerWidth < 768) return;
    if (localStorage.getItem(KB_HINT_KEY)) return;

    dom.keyboardHint.hidden = false;
    localStorage.setItem(KB_HINT_KEY, '1');

    // Auto-hide after 5 seconds
    setTimeout(() => {
      dom.keyboardHint.hidden = true;
    }, 5000);
  }

  function handleKeyboard(e) {
    // Skip if user is typing in an input
    if (e.target.matches('input, textarea, select')) return;
    // Skip if a modal/drawer is open
    if (dom.downloadModal?.open) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        showNext();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        showPrev();
        break;
      case 'f':
      case 'F':
        if (state.currentQuote) toggleFavorite(state.currentQuote.id);
        break;
      case 'c':
      case 'C':
        copyQuote();
        break;
      case 't':
      case 'T':
        toggleTheme();
        break;
      case 'Escape':
        closeFavoritesDrawer();
        closeDownloadModal();
        break;
    }
  }


  /* ═══════════════════════════════════════
     SWIPE GESTURES (mobile)
  ═══════════════════════════════════════ */
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(dx) < 50) return;
    if (Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) showNext(); // swipe left → next
    if (dx > 0) showPrev(); // swipe right → prev
  }


  /* ═══════════════════════════════════════
     EVENT LISTENERS
  ═══════════════════════════════════════ */
  function bindEvents() {
    // Theme toggle
    dom.btnTheme?.addEventListener('click', toggleTheme);

    // New quote (Always generate a brand new one)
    dom.btnNext?.addEventListener('click', generateNewQuote);

    // Forward Arrow (Only browse history)
    dom.btnNextArrow?.addEventListener('click', showNext);

    // Prev quote (Only browse history)
    dom.btnPrev?.addEventListener('click', showPrev);

    // Copy
    dom.btnCopy?.addEventListener('click', copyQuote);

    // Share
    dom.btnShare?.addEventListener('click', shareQuote);

    // Favorite
    dom.btnFavorite?.addEventListener('click', () => {
      if (state.currentQuote) toggleFavorite(state.currentQuote.id);
    });

    // Download modal
    dom.btnDownload?.addEventListener('click', openDownloadModal);
    dom.btnCloseModal?.addEventListener('click', closeDownloadModal);
    dom.downloadModal?.addEventListener('click', e => {
      if (e.target === dom.downloadModal) closeDownloadModal();
    });

    // Export theme options — T-35
    dom.exportOptions?.forEach(btn => {
      btn.addEventListener('click', () => {
        const exportTheme = btn.dataset.exportTheme;
        closeDownloadModal();
        exportQuoteAsImage(exportTheme);
      });
    });

    // Category filter
    dom.btnFilter?.addEventListener('click', toggleCategoryDrawer);

    dom.chips?.forEach(chip => {
      chip.addEventListener('click', async () => {
        const category = chip.dataset.category;
        setCategory(category);
        // Load a new quote from the selected category
        const quote = await quoteService.getRandom(category, state.currentQuote?.id);
        if (quote) {
          pushToHistory(quote);
          renderQuote(quote);
        }
        // Close drawer on mobile
        if (window.innerWidth < 768) {
          toggleCategoryDrawer();
        }
      });
    });

    // Favorites drawer
    dom.btnFavorites?.addEventListener('click', openFavoritesDrawer);
    dom.btnCloseFavs?.addEventListener('click', closeFavoritesDrawer);
    backdrop?.addEventListener('click', () => {
      closeFavoritesDrawer();
    });

    // Keyboard
    document.addEventListener('keydown', handleKeyboard);

    // Swipe
    dom.quoteCard?.addEventListener('touchstart', handleTouchStart, { passive: true });
    dom.quoteCard?.addEventListener('touchend',   handleTouchEnd,   { passive: true });

    // Close drawers on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeFavoritesDrawer();
      }
    });
  }


  /* ═══════════════════════════════════════
     INIT
  ═══════════════════════════════════════ */
  async function init() {
    // Load favorites from localStorage
    loadFavorites();
    updateFavoritesCount();

    // Wire up all event listeners
    bindEvents();

    // Load quote: deep link → daily quote
    const loadedFromURL = await loadFromURL();
    if (!loadedFromURL) {
      await loadDailyQuote();
    }

    // Show keyboard hint on desktop (once)
    showKeyboardHint();

    // Register Service Worker (T-38)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .catch(err => console.warn('[Luminary] SW registration failed:', err));
      });
    }
  }

  // Kick off when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
