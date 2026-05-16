/* ============================================================================
 * track.js — Static-Site Analytics Layer
 * ----------------------------------------------------------------------------
 * A zero-dependency, vendor-agnostic, consent-aware tracking module designed
 * to drop into static HTML templates. It captures page, engagement, scroll,
 * click, and visibility signals, then forwards them through one or more
 * pluggable transports (GTM dataLayer, GA4 gtag, a custom beacon endpoint,
 * or the console for debugging).
 *
 * Design principles
 *   - One config block. Edit the CONFIG object below; never touch internals.
 *   - Consent first. Non-essential events queue until consent is granted.
 *   - Transport agnostic. The same event fans out to every enabled sink.
 *   - DataLayer native. Plays cleanly with GTM and a normal GA4 setup.
 *   - Declarative. Tag elements with data-attributes; no per-page JS needed.
 *
 * Quick start
 *   <script src="track.js" defer></script>
 *   ...then optionally:  Track.consent.grant();   // when the user opts in
 *
 * Declarative tagging
 *   <a href="..." data-track-click="cta_click"
 *      data-track-prop-location="hero">Read</a>
 *   <section data-track-view="viz_seen" data-track-prop-id="cosmic-web">
 *   <a href="https://external.com">…</a>           // auto outbound
 *   <a href="/file.pdf">…</a>                       // auto download
 *
 * Manual API
 *   Track.event('signup', { plan: 'pro' });
 *   Track.consent.grant() / .revoke() / .status();
 *   Track.set({ userId: 'abc' });   // merged into every subsequent event
 *   Track.flush();                  // force-send the queue
 * ==========================================================================*/

(function (window, document) {
  'use strict';

  /* ==========================================================================
   * CONFIG  —  the only block you should normally edit
   * ========================================================================*/
  var CONFIG = {

    // Public global name. window.Track by default.
    globalName: 'Track',

    // --- Consent -----------------------------------------------------------
    // mode: 'required'  -> nothing non-essential fires until consent granted
    //       'implied'   -> fires immediately (use only where lawful)
    //       'opt-out'   -> fires unless the user has explicitly revoked
    consent: {
      mode: 'implied',
      storageKey: 'trk_consent',     // persisted decision
      respectDNT: true              // honor navigator.doNotTrack === '1'
    },

    // --- Identity / session ------------------------------------------------
    session: {
      enabled: true,
      storageKey: 'trk_session',
      idKey: 'trk_id',               // anonymous, first-party visitor id
      timeoutMinutes: 30,            // inactivity window that ends a session
      storage: 'localStorage'        // 'localStorage' | 'sessionStorage' | 'memory'
    },

    // --- Transports (sinks). Enable any combination. ----------------------
    transports: {
      // Google Tag Manager dataLayer
      dataLayer: {
        enabled: true,
        name: 'dataLayer'            // change if you renamed your GTM dataLayer
      },
      // GA4 via global gtag()
      gtag: {
        enabled: false,
        measurementId: 'G-XXXXXXXXXX'
      },
      // First-party collector. Receives JSON via navigator.sendBeacon / fetch.
      beacon: {
        enabled: false,
        endpoint: 'https://your-domain.example/collect',
        batch: true,                 // coalesce events, flush on interval/unload
        batchIntervalMs: 5000
      },
      // Console output for local debugging
      console: {
        enabled: true               // set false in production
      }
    },

    // --- Automatic trackers (toggle individually) -------------------------
    auto: {
      pageView:        true,         // fires once on load (or on SPA route change)
      scrollDepth:     true,         // thresholds below
      readMilestones:  true,         // % of primary content element scrolled past
      engagedTime:     true,         // active time only; pauses on blur/idle
      outboundLinks:   true,         // clicks to other domains
      downloads:       true,         // clicks to file extensions below
      elementViews:    true,         // [data-track-view] enters viewport
      declaredClicks:  true,         // [data-track-click] elements
      rageClicks:      false,        // 3+ rapid clicks on same element
      formEngagement:  false         // first interaction + submit on <form>
    },

    scrollDepth: {
      thresholds: [25, 50, 75, 90, 100],
      eventName: 'scroll_depth'
    },

    readMilestones: {
      // CSS selector for the main content block to measure read progress on.
      selector: 'article',
      thresholds: [25, 50, 75, 100],
      eventName: 'read_progress'
    },

    engagedTime: {
      // Heartbeat: emit accumulated engaged seconds at these elapsed marks.
      pingsAtSeconds: [15, 30, 60, 120, 300],
      idleAfterMs: 30000,            // no input for this long => idle (paused)
      eventName: 'engaged_time'
    },

    downloads: {
      extensions: ['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar',
                   '7z','gz','tar','csv','txt','rtf','dmg','pkg','exe','apk',
                   'mp3','wav','mp4','mov','avi','mkv','json','xml','svg'],
      eventName: 'file_download'
    },

    outbound: { eventName: 'outbound_click' },

    // --- Campaign / attribution -------------------------------------------
    attribution: {
      captureUTM: true,              // utm_source/medium/campaign/term/content
      captureClickIds: true,         // gclid, fbclid, msclkid, ttclid …
      captureReferrer: true,
      firstTouchKey: 'trk_first',    // persisted first-touch attribution
      lastTouchKey:  'trk_last'      // session last-touch attribution
    },

    // --- Misc --------------------------------------------------------------
    debug: false,                    // verbose internal logging
    samplePct: 100                   // 0–100; client-side sampling rate
  };

  /* ==========================================================================
   * INTERNALS  —  you should not need to edit below this line
   * ========================================================================*/

  var QUEUE = [];                    // events awaiting consent / transport
  var BEACON_BUFFER = [];            // events awaiting batched beacon flush
  var STATE = {
    consented: false,
    initialized: false,
    sampledIn: true,
    superProps: {},                  // merged into every event
    session: null,
    scrollFired: {},
    readFired: {},
    engagedSeconds: 0,
    engagedPingsFired: {},
    lastActivityTs: Date.now(),
    isIdle: false,
    isVisible: !document.hidden,
    rage: { el: null, count: 0, ts: 0 }
  };

  var log = function () {
    if (!CONFIG.debug) return;
    try { console.log.apply(console, ['[track]'].concat([].slice.call(arguments))); }
    catch (e) {}
  };

  /* ---- storage abstraction ------------------------------------------------*/
  var memStore = {};
  function store(kind) {
    try {
      if (kind === 'localStorage' && window.localStorage) return window.localStorage;
      if (kind === 'sessionStorage' && window.sessionStorage) return window.sessionStorage;
    } catch (e) {}
    return {
      getItem: function (k) { return k in memStore ? memStore[k] : null; },
      setItem: function (k, v) { memStore[k] = String(v); },
      removeItem: function (k) { delete memStore[k]; }
    };
  }
  var ss = store(CONFIG.session.storage);

  function jsonGet(s, k) {
    try { var v = s.getItem(k); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function jsonSet(s, k, v) {
    try { s.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  /* ---- id + session -------------------------------------------------------*/
  function uuid() {
    if (window.crypto && crypto.randomUUID) { try { return crypto.randomUUID(); } catch (e) {} }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    var ls = store('localStorage');
    var id = ls.getItem(CONFIG.session.idKey);
    if (!id) { id = uuid(); ls.setItem(CONFIG.session.idKey, id); }
    return id;
  }

  function ensureSession() {
    if (!CONFIG.session.enabled) return null;
    var now = Date.now();
    var s = jsonGet(ss, CONFIG.session.storageKey);
    var timeoutMs = CONFIG.session.timeoutMinutes * 60000;
    if (!s || (now - s.lastTs) > timeoutMs) {
      s = { id: uuid(), startTs: now, lastTs: now, pageCount: 0, isNew: true };
      log('new session', s.id);
    } else {
      s.isNew = false;
    }
    s.lastTs = now;
    jsonSet(ss, CONFIG.session.storageKey, s);
    return s;
  }

  function touchSession() {
    if (!STATE.session) return;
    STATE.session.lastTs = Date.now();
    jsonSet(ss, CONFIG.session.storageKey, STATE.session);
  }

  /* ---- attribution --------------------------------------------------------*/
  function parseParams() {
    var out = {}, q = window.location.search.replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }

  function collectAttribution() {
    var p = parseParams(), a = {};
    if (CONFIG.attribution.captureUTM) {
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function (k) {
        if (p[k]) a[k] = p[k];
      });
    }
    if (CONFIG.attribution.captureClickIds) {
      ['gclid','fbclid','msclkid','ttclid','dclid','wbraid','gbraid'].forEach(function (k) {
        if (p[k]) a[k] = p[k];
      });
    }
    if (CONFIG.attribution.captureReferrer && document.referrer) {
      try {
        var r = new URL(document.referrer);
        if (r.hostname !== window.location.hostname) {
          a.referrer = document.referrer;
          a.referrer_domain = r.hostname;
        }
      } catch (e) {}
    }
    // First-touch is written once and never overwritten.
    var ls = store('localStorage');
    if (Object.keys(a).length && !ls.getItem(CONFIG.attribution.firstTouchKey)) {
      jsonSet(ls, CONFIG.attribution.firstTouchKey,
              { ts: Date.now(), landing: window.location.pathname, params: a });
    }
    // Last-touch is refreshed per session when new params appear.
    if (Object.keys(a).length) {
      jsonSet(ss, CONFIG.attribution.lastTouchKey,
              { ts: Date.now(), landing: window.location.pathname, params: a });
    }
    var first = jsonGet(ls, CONFIG.attribution.firstTouchKey);
    var last  = jsonGet(ss, CONFIG.attribution.lastTouchKey);
    var merged = {};
    Object.keys(a).forEach(function (k) { merged[k] = a[k]; });
    if (first) merged.first_touch = first.params;
    if (last)  merged.last_touch = last.params;
    return merged;
  }

  /* ---- consent ------------------------------------------------------------*/
  function dntEnabled() {
    var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  }

  function resolveConsent() {
    if (CONFIG.consent.respectDNT && dntEnabled()) { log('DNT on'); return false; }
    var ls = store('localStorage');
    var saved = ls.getItem(CONFIG.consent.storageKey);
    if (saved === 'granted') return true;
    if (saved === 'revoked') return false;
    if (CONFIG.consent.mode === 'implied') return true;
    if (CONFIG.consent.mode === 'opt-out') return saved !== 'revoked';
    return false; // 'required' and no decision yet
  }

  function setConsent(decision) {
    var ls = store('localStorage');
    ls.setItem(CONFIG.consent.storageKey, decision);
    STATE.consented = decision === 'granted' ||
      (CONFIG.consent.mode === 'opt-out' && decision !== 'revoked');
    log('consent ->', decision, STATE.consented);
    if (STATE.consented) drainQueue();
  }

  /* ---- transports ---------------------------------------------------------*/
  function toDataLayer(evt) {
    var t = CONFIG.transports.dataLayer;
    if (!t.enabled) return;
    window[t.name] = window[t.name] || [];
    window[t.name].push(Object.assign({ event: evt.event }, evt));
  }

  function toGtag(evt) {
    var t = CONFIG.transports.gtag;
    if (!t.enabled || typeof window.gtag !== 'function') return;
    var params = {};
    Object.keys(evt).forEach(function (k) { if (k !== 'event') params[k] = evt[k]; });
    window.gtag('event', evt.event, params);
  }

  function toBeacon(evt) {
    var t = CONFIG.transports.beacon;
    if (!t.enabled) return;
    if (t.batch) { BEACON_BUFFER.push(evt); return; }
    sendBeacon([evt]);
  }

  function sendBeacon(events) {
    var t = CONFIG.transports.beacon;
    if (!t.enabled || !events.length) return;
    var payload = JSON.stringify({ sent_at: Date.now(), events: events });
    var ok = false;
    try {
      if (navigator.sendBeacon) {
        ok = navigator.sendBeacon(t.endpoint,
              new Blob([payload], { type: 'application/json' }));
      }
    } catch (e) {}
    if (!ok) {
      try {
        fetch(t.endpoint, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: payload
        });
      } catch (e) { log('beacon failed', e); }
    }
  }

  function flushBeaconBuffer() {
    if (BEACON_BUFFER.length) { sendBeacon(BEACON_BUFFER.slice()); BEACON_BUFFER.length = 0; }
  }

  function toConsole(evt) {
    if (!CONFIG.transports.console.enabled) return;
    try { console.log('%c[track]', 'color:#7fd8c8', evt.event, evt); } catch (e) {}
  }

  function dispatch(evt) {
    toDataLayer(evt); toGtag(evt); toBeacon(evt); toConsole(evt);
  }

  /* ---- core emit ----------------------------------------------------------*/
  function enrich(name, props) {
    var s = STATE.session || {};
    var base = {
      event: name,
      ts: Date.now(),
      page_path: window.location.pathname,
      page_url: window.location.href,
      page_title: document.title,
      page_referrer: document.referrer || undefined,
      visitor_id: getVisitorId(),
      session_id: s.id,
      session_is_new: !!s.isNew,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      language: navigator.language
    };
    var merged = {};
    Object.keys(base).forEach(function (k) { if (base[k] !== undefined) merged[k] = base[k]; });
    Object.keys(STATE.superProps).forEach(function (k) { merged[k] = STATE.superProps[k]; });
    if (props) Object.keys(props).forEach(function (k) { merged[k] = props[k]; });
    return merged;
  }

  function emit(name, props, opts) {
    opts = opts || {};
    if (!STATE.sampledIn && !opts.essential) { log('sampled out', name); return; }
    var evt = enrich(name, props);
    if (STATE.consented || opts.essential) {
      dispatch(evt);
      touchSession();
    } else {
      QUEUE.push(evt);
      log('queued (no consent)', name);
    }
  }

  function drainQueue() {
    if (!QUEUE.length) return;
    log('draining', QUEUE.length, 'queued events');
    QUEUE.splice(0).forEach(function (evt) { dispatch(evt); });
  }

  /* ---- automatic trackers -------------------------------------------------*/
  function trackPageView() {
    if (!CONFIG.auto.pageView) return;
    if (STATE.session) { STATE.session.pageCount = (STATE.session.pageCount || 0) + 1; }
    emit('page_view', Object.assign({
      page_count_in_session: STATE.session ? STATE.session.pageCount : 1
    }, collectAttribution()), { essential: true });
  }

  function maxScrollPct() {
    var doc = document.documentElement, body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
    var height = Math.max(body.scrollHeight, doc.scrollHeight,
                          body.offsetHeight, doc.offsetHeight) - window.innerHeight;
    if (height <= 0) return 100;
    return Math.min(100, Math.round((scrollTop / height) * 100));
  }

  function trackScrollDepth() {
    if (!CONFIG.auto.scrollDepth) return;
    var pct = maxScrollPct();
    CONFIG.scrollDepth.thresholds.forEach(function (t) {
      if (pct >= t && !STATE.scrollFired[t]) {
        STATE.scrollFired[t] = true;
        emit(CONFIG.scrollDepth.eventName, { percent: t });
      }
    });
  }

  function trackReadMilestones() {
    if (!CONFIG.auto.readMilestones) return;
    var el = document.querySelector(CONFIG.readMilestones.selector);
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var elTop = rect.top + window.pageYOffset;
    var elHeight = el.offsetHeight;
    var viewed = (window.pageYOffset + window.innerHeight) - elTop;
    var pct = Math.max(0, Math.min(100, Math.round((viewed / elHeight) * 100)));
    CONFIG.readMilestones.thresholds.forEach(function (t) {
      if (pct >= t && !STATE.readFired[t]) {
        STATE.readFired[t] = true;
        emit(CONFIG.readMilestones.eventName, { percent: t });
      }
    });
  }

  function markActivity() {
    STATE.lastActivityTs = Date.now();
    if (STATE.isIdle) { STATE.isIdle = false; log('resumed from idle'); }
  }

  function engagedTick() {
    if (!CONFIG.auto.engagedTime) return;
    var now = Date.now();
    var idle = (now - STATE.lastActivityTs) > CONFIG.engagedTime.idleAfterMs;
    if (idle) STATE.isIdle = true;
    if (STATE.isVisible && !STATE.isIdle) STATE.engagedSeconds += 1;
    CONFIG.engagedTime.pingsAtSeconds.forEach(function (mark) {
      if (STATE.engagedSeconds >= mark && !STATE.engagedPingsFired[mark]) {
        STATE.engagedPingsFired[mark] = true;
        emit(CONFIG.engagedTime.eventName, { seconds: mark });
      }
    });
  }

  function fileExtension(href) {
    try {
      var path = new URL(href, window.location.href).pathname;
      var m = path.match(/\.([a-z0-9]+)$/i);
      return m ? m[1].toLowerCase() : null;
    } catch (e) { return null; }
  }

  function isOutbound(href) {
    try {
      var u = new URL(href, window.location.href);
      return u.protocol.indexOf('http') === 0 && u.hostname !== window.location.hostname;
    } catch (e) { return false; }
  }

  function onDocumentClick(e) {
    var el = e.target;
    while (el && el !== document.body && el.nodeType === 1) {
      // Declarative click
      if (CONFIG.auto.declaredClicks && el.hasAttribute('data-track-click')) {
        var name = el.getAttribute('data-track-click');
        emit(name, collectDataProps(el, 'data-track-prop-'));
      }
      // Links: outbound + downloads
      if (el.tagName === 'A' && el.href) {
        var href = el.getAttribute('href') || el.href;
        var ext = fileExtension(href);
        if (CONFIG.auto.downloads && ext &&
            CONFIG.downloads.extensions.indexOf(ext) !== -1) {
          emit(CONFIG.downloads.eventName, {
            file_url: href, file_extension: ext,
            link_text: (el.textContent || '').trim().slice(0, 120)
          });
        } else if (CONFIG.auto.outboundLinks && isOutbound(href)) {
          emit(CONFIG.outbound.eventName, {
            destination: href,
            link_text: (el.textContent || '').trim().slice(0, 120)
          });
        }
      }
      el = el.parentNode;
    }
    if (CONFIG.auto.rageClicks) detectRage(e);
  }

  function collectDataProps(el, prefix) {
    var out = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf(prefix) === 0) {
        out[a.name.slice(prefix.length).replace(/-/g, '_')] = a.value;
      }
    }
    return out;
  }

  function detectRage(e) {
    var now = Date.now(), r = STATE.rage;
    if (r.el === e.target && (now - r.ts) < 600) {
      r.count++;
      if (r.count >= 3) {
        emit('rage_click', {
          tag: e.target.tagName,
          text: (e.target.textContent || '').trim().slice(0, 80)
        });
        r.count = 0;
      }
    } else {
      r.el = e.target; r.count = 1;
    }
    r.ts = now;
  }

  function initElementViews() {
    if (!CONFIG.auto.elementViews || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('[data-track-view]');
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var el = en.target;
          emit(el.getAttribute('data-track-view'),
               collectDataProps(el, 'data-track-prop-'));
          io.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initFormEngagement() {
    if (!CONFIG.auto.formEngagement) return;
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
      var started = false;
      form.addEventListener('focusin', function () {
        if (!started) {
          started = true;
          emit('form_start', { form_id: form.id || form.name || 'unnamed' });
        }
      });
      form.addEventListener('submit', function () {
        emit('form_submit', { form_id: form.id || form.name || 'unnamed' });
      });
    });
  }

  /* ---- throttle helper ----------------------------------------------------*/
  function throttle(fn, ms) {
    var last = 0, timer;
    return function () {
      var now = Date.now(), ctx = this, args = arguments;
      var remaining = ms - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer); last = now; fn.apply(ctx, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now(); timer = null; fn.apply(ctx, args);
        }, remaining);
      }
    };
  }

  /* ---- lifecycle ----------------------------------------------------------*/
  function bindGlobalListeners() {
    var onScroll = throttle(function () {
      trackScrollDepth();
      trackReadMilestones();
    }, 250);
    window.addEventListener('scroll', onScroll, { passive: true });

    ['mousemove','keydown','touchstart','click','scroll'].forEach(function (ev) {
      window.addEventListener(ev, markActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', function () {
      STATE.isVisible = !document.hidden;
      if (STATE.isVisible) markActivity();
    });

    document.addEventListener('click', onDocumentClick, true);

    if (CONFIG.auto.engagedTime) setInterval(engagedTick, 1000);

    // Flush on the way out.
    var finalFlush = function () {
      if (CONFIG.auto.engagedTime && STATE.engagedSeconds > 0) {
        emit(CONFIG.engagedTime.eventName,
             { seconds: STATE.engagedSeconds, final: true });
      }
      flushBeaconBuffer();
    };
    window.addEventListener('pagehide', finalFlush);
    window.addEventListener('beforeunload', finalFlush);

    if (CONFIG.transports.beacon.enabled && CONFIG.transports.beacon.batch) {
      setInterval(flushBeaconBuffer, CONFIG.transports.beacon.batchIntervalMs);
    }
  }

  function init() {
    if (STATE.initialized) return;
    STATE.initialized = true;

    STATE.sampledIn = (Math.random() * 100) < CONFIG.samplePct;
    STATE.consented = resolveConsent();
    STATE.session = ensureSession();

    bindGlobalListeners();
    initElementViews();
    initFormEngagement();

    trackPageView();
    // Evaluate initial scroll position (deep links / restored scroll).
    trackScrollDepth();
    trackReadMilestones();

    log('initialized', {
      consented: STATE.consented,
      sampledIn: STATE.sampledIn,
      session: STATE.session && STATE.session.id
    });
  }

  /* ---- public API ---------------------------------------------------------*/
  var API = {
    /** Manually emit a custom event. */
    event: function (name, props) { emit(name, props); return API; },

    /** Merge persistent "super properties" into every future event. */
    set: function (obj) {
      if (obj) Object.keys(obj).forEach(function (k) { STATE.superProps[k] = obj[k]; });
      return API;
    },

    /** Associate a known user id (e.g. after login). */
    identify: function (userId, traits) {
      STATE.superProps.user_id = userId;
      if (traits) API.set(traits);
      emit('identify', { user_id: userId });
      return API;
    },

    /** Consent controls — wire these to your banner buttons. */
    consent: {
      grant:  function () { setConsent('granted'); return API; },
      revoke: function () { setConsent('revoked'); QUEUE.length = 0; return API; },
      status: function () { return STATE.consented ? 'granted' : 'denied'; }
    },

    /** Re-run pageview + reset per-page state (call on SPA route change). */
    page: function () {
      STATE.scrollFired = {}; STATE.readFired = {};
      trackPageView();
      return API;
    },

    /** Force any buffered beacon events out immediately. */
    flush: function () { flushBeaconBuffer(); drainQueue(); return API; },

    /** Read-only snapshot for debugging. */
    debug: function () {
      return {
        consented: STATE.consented,
        sampledIn: STATE.sampledIn,
        session: STATE.session,
        engagedSeconds: STATE.engagedSeconds,
        queued: QUEUE.length,
        beaconBuffered: BEACON_BUFFER.length,
        superProps: STATE.superProps
      };
    },

    /** Expose config for runtime overrides before init (advanced). */
    config: CONFIG
  };

  // Publish under the configured global name.
  window[CONFIG.globalName] = API;

  // Boot once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
