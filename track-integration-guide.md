# track.js — Integration & Prompting Guide

A vendor-agnostic, consent-aware analytics layer for static HTML. This document
covers two things:

1. **Manual integration** — exactly what to do, step by step.
2. **The Prompt Block** — a copy-paste instruction you can hand to an AI
   assistant to wire `track.js` into any static template for you.

---

## 1. Thirty-second install

Place `track.js` next to your HTML and add one line before `</body>`:

```html
<script src="track.js" defer></script>
```

That's it. With default config it immediately starts capturing — through the
GTM `dataLayer` and the browser console — page views, scroll depth, read
progress, engaged time, outbound clicks, and file downloads. No further code
is required for baseline tracking.

> Default consent mode is `required`. Non-essential events **queue** until you
> call `Track.consent.grant()`. If you have no consent banner and tracking is
> lawful in your context, set `consent.mode` to `'implied'` (see §3).

---

## 2. File placement

```
/your-site/
  index.html
  about.html
  track.js          <- drop it here (or /assets/js/track.js)
```

Reference it with a path that matches:

```html
<script src="/assets/js/track.js" defer></script>
```

Use `defer` so it runs after HTML parses but before `DOMContentLoaded`
listeners would otherwise fire. Do not use `async` — ordering matters if you
also push manual events inline.

---

## 3. The only block you edit: `CONFIG`

Open `track.js`. Everything you touch is the `CONFIG` object at the top.
The most common edits:

| Goal | Field | Set to |
|---|---|---|
| Turn off console noise in prod | `transports.console.enabled` | `false` |
| No consent banner, lawful context | `consent.mode` | `'implied'` |
| Renamed GTM dataLayer | `transports.dataLayer.name` | your name |
| Send to GA4 directly | `transports.gtag.enabled` + `measurementId` | `true` / `G-XXXX` |
| Send to your own collector | `transports.beacon.enabled` + `endpoint` | `true` / URL |
| Measure read depth on a different element | `readMilestones.selector` | CSS selector |
| Client-side sampling | `samplePct` | `0`–`100` |

You never need to edit anything below the `INTERNALS` divider.

---

## 4. Consent wiring

If `consent.mode` is `'required'` (the default), connect your banner buttons:

```html
<button id="consent-accept">Accept</button>
<button id="consent-decline">Decline</button>

<script>
  document.getElementById('consent-accept')
    .addEventListener('click', function () { Track.consent.grant(); });
  document.getElementById('consent-decline')
    .addEventListener('click', function () { Track.consent.revoke(); });
</script>
```

- `grant()` — persists the decision and **drains the queued events**.
- `revoke()` — persists refusal and **discards** the queue.
- `Track.consent.status()` — returns `'granted'` or `'denied'`.

The decision is remembered in `localStorage`, so the banner only needs to show
on first visit (your banner logic, not the library's).

---

## 5. Declarative tagging reference

You rarely need to write tracking JS. Tag elements with data attributes and
the library handles them.

### Track a click with a named event

```html
<a href="/signup"
   data-track-click="cta_click"
   data-track-prop-location="hero"
   data-track-prop-variant="A">Get started</a>
```

Fires `cta_click` with `{ location: 'hero', variant: 'A' }`.
Any `data-track-prop-*` attribute becomes an event property
(dashes convert to underscores).

### Track when an element is seen

```html
<section data-track-view="section_viewed"
         data-track-prop-id="pricing">
  ...
</section>
```

Fires once when the element is ≥50% in the viewport.

### Automatic — no attributes needed

- **Outbound links** — any `<a>` to a different domain fires `outbound_click`.
- **Downloads** — any `<a>` to a configured file extension fires
  `file_download`.

So an external source link or a PDF link is tracked the moment you add it,
with zero markup changes.

---

## 6. Manual API

For anything dynamic:

```js
// Custom event
Track.event('video_play', { id: 'intro', position: 0 });

// Persistent properties merged into EVERY future event
Track.set({ content_group: 'science-briefs', author: 'whittfield' });

// Known user (after login)
Track.identify('user_8841', { plan: 'pro' });

// SPA / pjax route change — resets per-page state and re-fires pageview
Track.page();

// Force buffered beacon events out now
Track.flush();

// Inspect state while debugging
console.log(Track.debug());
```

---

## 7. Transport setup

### GTM (default, recommended)

Nothing to do beyond having GTM on the page. Events arrive on `dataLayer`
with an `event` key — build GTM triggers on the event names
(`page_view`, `scroll_depth`, `read_progress`, `engaged_time`,
`outbound_click`, `file_download`, plus your custom names).

If your container uses a custom dataLayer name, set
`transports.dataLayer.name` to match.

### GA4 direct (no GTM)

```js
transports: {
  dataLayer: { enabled: false },
  gtag: { enabled: true, measurementId: 'G-XXXXXXXXXX' }
}
```

Requires the standard `gtag.js` snippet already on the page. Event params are
passed straight through to GA4.

### First-party collector

```js
transports: {
  beacon: {
    enabled: true,
    endpoint: 'https://collect.yourdomain.com/e',
    batch: true,
    batchIntervalMs: 5000
  }
}
```

Posts JSON `{ sent_at, events: [...] }` via `navigator.sendBeacon`, falling
back to `fetch` with `keepalive`. Batches and flushes on interval + page exit.

Transports are not mutually exclusive — enable several and every event fans
out to all of them.

---

## 8. Recipes for a static editorial page

Wiring the cosmic-web explainer (or any long-form page):

```html
<!-- Mark the main content block so read progress measures the article,
     not the whole document including the footer -->
<article> ... </article>     <!-- default selector is 'article', so done -->

<!-- Track the hero visualization being seen -->
<div class="viz-wrap"
     data-track-view="visualization_seen"
     data-track-prop-id="cosmic-web-canvas"> ... </div>

<!-- Name the important outbound action explicitly -->
<a href="https://cosmos.astro.caltech.edu/page/cosmosweb-dr"
   data-track-click="data_download"
   data-track-prop-source="closing-paragraph">download</a>

<!-- Group all science briefs for reporting -->
<script>
  Track.set({ content_type: 'science_brief', topic: 'cosmic-web' });
</script>
```

Resulting signal set: pageview + campaign attribution, how far people read the
article specifically, engaged (not idle) time, whether the visualization was
seen, and a clearly named `data_download` conversion alongside the automatic
`outbound_click`.

---

## 9. Event dictionary (defaults)

| Event | When | Key props |
|---|---|---|
| `page_view` | Load / `Track.page()` | attribution, `page_count_in_session` |
| `scroll_depth` | 25/50/75/90/100% of page | `percent` |
| `read_progress` | 25/50/75/100% of `article` | `percent` |
| `engaged_time` | 15/30/60/120/300 active sec | `seconds`, `final` |
| `outbound_click` | Link to other domain | `destination`, `link_text` |
| `file_download` | Link to known extension | `file_url`, `file_extension` |
| `identify` | `Track.identify()` | `user_id` |
| `rage_click` | 3+ rapid clicks (if enabled) | `tag`, `text` |
| `form_start` / `form_submit` | If `formEngagement` on | `form_id` |

Every event also carries: `ts`, `page_path`, `page_url`, `page_title`,
`visitor_id`, `session_id`, `session_is_new`, `viewport`, `language`, plus any
super properties set via `Track.set()`.

---

## 10. THE PROMPT BLOCK

Paste the following to an AI assistant along with your static HTML file (or
template) to have it integrated automatically. Fill the bracketed choices.

```
You are integrating the analytics module "track.js" into the attached static
HTML. Do not modify track.js itself — only edit the HTML and, if explicitly
told below, the track.js CONFIG block.

CONTEXT
- track.js is a zero-dependency, consent-aware tracking layer.
- It auto-captures: page_view, scroll_depth, read_progress, engaged_time,
  outbound_click, file_download.
- It reads declarative attributes: data-track-click="event_name",
  data-track-view="event_name", and data-track-prop-<key>="value".
- Public API: Track.event(name, props), Track.set(obj),
  Track.identify(id, traits), Track.consent.grant()/revoke(),
  Track.page(), Track.flush().

DO THE FOLLOWING
1. Add <script src="[PATH/TO]/track.js" defer></script> immediately before
   </body>.
2. Confirm the primary long-form content is wrapped in a single <article>
   element so read_progress measures the right block. If it is not, wrap it
   or tell me which selector to configure instead.
3. Add data-track-view="[EVENT_NAME]" (+ relevant data-track-prop-*) to these
   key elements: [LIST ELEMENTS, e.g. hero visual, pricing block].
4. Add data-track-click="[EVENT_NAME]" (+ data-track-prop-*) to these key
   actions: [LIST ACTIONS, e.g. primary CTA, download link].
5. Add an inline <script> after the track.js tag that calls Track.set() with
   these super properties: [e.g. content_type, topic, author].
6. Consent mode is [required | implied | opt-out].
   - If "required": also wire the existing consent banner buttons
     ([ACCEPT SELECTOR] / [DECLINE SELECTOR]) to Track.consent.grant() and
     Track.consent.revoke(). If no banner exists, add a minimal compliant one.
   - If "implied": set CONFIG.consent.mode to 'implied' in track.js.
7. For production, set CONFIG.transports.console.enabled to false and
   configure the active transport: [GTM default | GA4 G-XXXX | beacon URL].

CONSTRAINTS
- Do not duplicate auto-tracked behavior with manual handlers (e.g. do not add
  a click handler to outbound links — they are already captured).
- Keep all event names snake_case and consistent.
- Output the modified HTML in full and list every change you made with its
  rationale.
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No events anywhere | Consent `required`, not granted | Call `Track.consent.grant()` or set `mode:'implied'` |
| Events in console but not GTM | `dataLayer` name mismatch | Match `transports.dataLayer.name` to container |
| `read_progress` never fires | No `<article>` element | Set `readMilestones.selector` to your content block |
| Engaged time too low | Tab backgrounded / idle | Expected — it intentionally pauses on blur/idle |
| Nothing in GA4 | `gtag` not on page | Add gtag.js snippet, or use GTM transport |
| Beacon 0 received | Endpoint CORS / wrong URL | Endpoint must accept POST JSON, no auth challenge |

---

*track.js + this guide are first-party, consent-respecting, and cookie-free by
default (anonymous IDs live in localStorage). No data leaves the page until a
transport is configured and consent resolves.*
