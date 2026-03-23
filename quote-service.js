/* ═══════════════════════════════════════════════════════════
   LUMINARY — quote-service.js
   T-12: QuoteService class
   Abstraction layer for all quote data access.
   Swap the internals here to change data source —
   the rest of the app never needs to change.
═══════════════════════════════════════════════════════════ */

class QuoteService {

  constructor() {
    this._quotes = [];
    this._loaded = false;
    this._source = 'json'; // 'json' | 'api' | 'claude'
  }

  /* ─────────────────────────────────────
     INIT — load quotes.json once
  ───────────────────────────────────── */
  async init() {
    if (this._loaded) return;

    try {
      const response = await fetch('quotes.json');
      if (!response.ok) throw new Error(`Failed to load quotes.json: ${response.status}`);
      const data = await response.json();
      this._quotes = data.quotes || [];
      this._loaded = true;
    } catch (err) {
      console.error('[QuoteService] Failed to load quotes:', err);
      // Fallback: hardcoded emergency quote so the app never breaks
      this._quotes = [
        {
          id: 0,
          text: "A new light, every day.",
          author: "Luminary",
          category: "wisdom"
        }
      ];
      this._loaded = true;
    }
  }

  /* ─────────────────────────────────────
     GET ALL QUOTES
     Optional category filter
  ───────────────────────────────────── */
  async getAll(category = 'all') {
    await this.init();
    if (category === 'all') return [...this._quotes];
    return this._quotes.filter(q => q.category === category);
  }

  /* ─────────────────────────────────────
     GET RANDOM QUOTE
     Optional category filter
     Will not repeat the last shown quote
  ───────────────────────────────────── */
  async getRandom(category = 'all', excludeId = null) {
    await this.init();

    let pool = await this.getAll(category);

    // Avoid repeating the current quote if pool allows
    if (pool.length > 1 && excludeId !== null) {
      pool = pool.filter(q => q.id !== excludeId);
    }

    if (pool.length === 0) return null;

    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  /* ─────────────────────────────────────
     GET DAILY QUOTE
     Same quote all day, changes at midnight.
     Seeded by today's date — deterministic.
  ───────────────────────────────────── */
  async getDaily() {
    await this.init();

    const today       = this._getTodayString();
    const storedDate  = localStorage.getItem('luminary_daily_date');
    const storedId    = localStorage.getItem('luminary_daily_id');

    // Return stored daily quote if it's still today
    if (storedDate === today && storedId !== null) {
      const quote = this._quotes.find(q => q.id === parseInt(storedId, 10));
      if (quote) return quote;
    }

    // Generate new daily quote seeded by today's date
    const seed  = this._dateToSeed(today);
    const index = seed % this._quotes.length;
    const quote = this._quotes[index];

    // Persist for the rest of the day
    localStorage.setItem('luminary_daily_date', today);
    localStorage.setItem('luminary_daily_id', String(quote.id));

    return quote;
  }

  /* ─────────────────────────────────────
     GET QUOTE BY ID
  ───────────────────────────────────── */
  async getById(id) {
    await this.init();
    return this._quotes.find(q => q.id === parseInt(id, 10)) || null;
  }

  /* ─────────────────────────────────────
     GET QUOTES BY IDS (for favorites)
  ───────────────────────────────────── */
  async getByIds(ids = []) {
    await this.init();
    const idSet = new Set(ids.map(Number));
    return this._quotes.filter(q => idSet.has(q.id));
  }

  /* ─────────────────────────────────────
     GET ALL CATEGORIES
  ───────────────────────────────────── */
  async getCategories() {
    await this.init();
    const cats = [...new Set(this._quotes.map(q => q.category))];
    return cats.sort();
  }

  /* ─────────────────────────────────────
     GET TOTAL COUNT
     Optional category filter
  ───────────────────────────────────── */
  async getCount(category = 'all') {
    const quotes = await this.getAll(category);
    return quotes.length;
  }

  /* ─────────────────────────────────────
     PRIVATE HELPERS
  ───────────────────────────────────── */

  // Returns today's date as 'YYYY-MM-DD'
  _getTodayString() {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    const d   = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Converts 'YYYY-MM-DD' to a stable integer seed
  _dateToSeed(dateStr) {
    const n = parseInt(dateStr.replace(/-/g, ''), 10);
    return ((n * 2654435761) >>> 0) % 100000;
  }

}

// Singleton — one instance used across the whole app
const quoteService = new QuoteService();
