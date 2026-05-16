# track.js — AI Agent Integration Spec

**Audience:** an autonomous AI tool or coding agent integrating `track.js`
into a static site without a human available to answer questions.

**Contract:** this document is self-contained. Do not request the source of
`track.js` to integrate it — its public behavior is fully specified here.
Treat `track.js` as an immutable dependency: **never modify it except the
`CONFIG` object, and only per the rules in §4.**

---

## 0. Capability manifest

```json
{
  "module": "track.js",
  "global": "Track",
  "dependencies": [],
  "loads": "<script src=\"<PATH>/track.js\" defer></script>",
  "auto_events": ["page_view","scroll_depth","read_progress",
                  "engaged_time","outbound_click","file_download"],
  "declarative_attrs": ["data-track-click","data-track-view",
                        "data-track-prop-*"],
  "api": ["Track.event(name,props)","Track.set(obj)",
          "Track.identify(id,traits)","Track.consent.grant()",
          "Track.consent.revoke()","Track.consent.status()",
          "Track.page()","Track.flush()","Track.debug()"],
  "transports": ["dataLayer(GTM)","gtag(GA4)","beacon(custom)","console"],
  "consent_modes": ["required","implied","opt-out"],
  "cookies": false,
  "storage": ["localStorage","sessionStorage"]
}
```

---

## 1. Public API contract (authoritative)

| Call | Effect | Returns |
|---|---|---|
| `Track.event(name, props?)` | Emit custom event. `name`: snake_case string. `props`: flat object of scalars. | `Track` |
| `Track.set(obj)` | Merge persistent super-properties into all future events. | `Track` |
| `Track.identify(id, traits?)` | Set `user_id`, emit `identify`. | `Track` |
| `Track.consent.grant()` | Persist consent, flush queued events. | `Track` |
| `Track.consent.revoke()` | Persist refusal, discard queue. | `Track` |
| `Track.consent.status()` | `'granted'` \| `'denied'`. | string |
| `Track.page()` | Reset per-page state, re-emit `page_view`. Use on client route change. | `Track` |
| `Track.flush()` | Force buffered beacon + queue out. | `Track` |
| `Track.debug()` | State snapshot object. | object |

`Track` is published on `window` after the script's `init()`, which runs on
`DOMContentLoaded` (or immediately if DOM already parsed). API calls made
before `init()` from inline scripts placed **after** the `track.js` tag are
safe because of `defer` ordering.

---

## 2. Event grammar

- Event names: `^[a-z][a-z0-9_]*$` (snake_case). Reuse the six auto-event
  names only via their existing mechanisms; do not emit them manually.
- Property keys: snake_case. Values: string \| number \| boolean. No nested
  objects, arrays, functions, or DOM nodes.
- Every emitted event is auto-enriched with: `ts`, `page_path`, `page_url`,
  `page_title`, `visitor_id`, `session_id`, `session_is_new`, `viewport`,
  `language`, plus active super-properties. **Do not duplicate these.**

---

## 3. Declarative attribute grammar

```
click-tag   ::= 'data-track-click="' EVENT_NAME '"' prop-attr*
view-tag    ::= 'data-track-view="'  EVENT_NAME '"' prop-attr*
prop-attr   ::= 'data-track-prop-' KEY '="' VALUE '"'
EVENT_NAME  ::= snake_case
KEY         ::= kebab-case   ; converted to snake_case at emit time
VALUE       ::= string
```

Behavior:
- `data-track-click` fires on click of the element or any descendant
  (event delegation, capture phase).
- `data-track-view` fires once when the element is ≥50% visible
  (IntersectionObserver), then unobserves.
- Each `data-track-prop-foo-bar="x"` becomes `{ foo_bar: "x" }` on that event.

---

## 4. Allowed CONFIG edits (whitelist)

Only these `CONFIG` fields may be changed, and only when a rule in §6 requires
it. All other fields, and all code below the `INTERNALS` divider, are off
limits.

| Field | Allowed values | Edit when |
|---|---|---|
| `transports.console.enabled` | `false` | Target is production |
| `transports.dataLayer.name` | string | Host GTM uses a non-default dataLayer name (detectable in page source) |
| `transports.gtag.enabled` / `.measurementId` | `true` / `"G-…"` | GA4 direct requested and a gtag snippet exists in the page |
| `transports.beacon.enabled` / `.endpoint` | `true` / URL | A first-party collector URL is provided |
| `consent.mode` | `'implied'` / `'opt-out'` | Explicitly instructed; never default to weakening consent |
| `readMilestones.selector` | CSS selector | No `<article>` exists (see §6.2) |
| `samplePct` | `0`–`100` | Explicitly instructed |

If a required value is unknown, **do not guess**. Apply the §5 default and
record an assumption in the §8 report.

---

## 5. Autonomous defaults (use when unspecified)

| Decision | Default |
|---|---|
| Script path | Same directory as the HTML: `track.js` |
| Script placement | Last element before `</body>` |
| Transport | GTM `dataLayer` (leave default; do not enable others) |
| `console.enabled` | Leave `true` unless target is stated as production |
| Consent mode | Leave `'required'` (do not weaken without instruction) |
| Read-progress target | Existing single `<article>`; else largest text container (see §6.2) |
| Super-properties | None unless provided |
| Element view/click tags | Tag only unambiguous primary CTA and primary hero visual; do not over-tag |

Weakening consent, enabling data exfiltration transports (gtag/beacon), or
sampling are **never** autonomous defaults — they require explicit instruction.

---

## 6. Deterministic integration procedure

Execute in order. Each step is idempotent — re-running must not duplicate.

**6.1 Inject loader**
Insert exactly once, immediately before `</body>`:
`<script src="<PATH>/track.js" defer></script>`
If a `track.js` script tag already exists, do not add another.

**6.2 Resolve read-progress target**
- If exactly one `<article>` exists → no action (default selector matches).
- If zero `<article>` → identify the dominant long-form text container
  (greatest text length among `main`, `[role=main]`, `.content`, `.post`,
  `.article`, `section`). Set `CONFIG.readMilestones.selector` to a stable
  selector for it (prefer an existing `id`; if none, add a stable id like
  `id="trk-content"` to that element only).
- If multiple `<article>` → set selector to the one with the most text via a
  stable id.

**6.3 Tag the primary visual (optional, conservative)**
If there is one clearly dominant hero/visual block, add
`data-track-view="primary_visual_seen"` and a single
`data-track-prop-id="<stable-id-or-class>"`. If ambiguous, skip — do not
tag multiple candidates.

**6.4 Tag the primary action (optional, conservative)**
If there is one unambiguous primary CTA (a button or link that is the page's
main goal), add `data-track-click="primary_cta_click"` plus
`data-track-prop-label="<trimmed visible text, ≤60 chars>"`.
Do **not** tag outbound or file-download links — those are auto-captured;
tagging them would double-count.

**6.5 Super-properties (only if provided)**
If content-grouping values are supplied, add a single inline script
**after** the loader:
`<script>Track.set({ /* provided keys */ });</script>`

**6.6 Consent**
- Mode `required` (default): if a consent UI exists, bind its accept control
  to `Track.consent.grant()` and its decline control to
  `Track.consent.revoke()` via `addEventListener`, without removing existing
  handlers. If no consent UI exists, do not invent one and do not weaken
  mode — record this in §8 as a blocker for non-essential events.
- Mode `implied`/`opt-out`: only if explicitly instructed; apply via §4.

**6.7 Production hardening**
If target is declared production: set
`CONFIG.transports.console.enabled = false`. Configure the instructed
transport per §4. If none instructed, leave GTM default.

---

## 7. Anti-patterns (must not do)

- Adding manual click handlers to outbound or download links (already tracked).
- Emitting `page_view`, `scroll_depth`, `read_progress`, `engaged_time`,
  `outbound_click`, or `file_download` via `Track.event()`.
- Putting tracking calls in an inline script placed **before** the loader.
- Using `async` on the loader script.
- Tagging many elements speculatively. Tag the primary visual and primary
  action only; everything else is auto or out of scope.
- Modifying `track.js` outside the §4 whitelist.
- Enabling `gtag`/`beacon` or weakening consent without explicit instruction.
- camelCase or spaced event/property names.

---

## 8. Required output report

After integration, output:

1. **Diff summary** — every file touched and the exact edits.
2. **CONFIG changes** — each changed field, old → new, and the §6 rule that
   required it. State "none" if unchanged.
3. **Tags applied** — each element selector, the attribute added, and why.
4. **Assumptions** — every default from §5 applied due to missing input.
5. **Blockers** — anything that prevents events from flowing (e.g. consent
   `required` with no UI, GTM absent, no resolvable read target).
6. **Verification** — confirm each §9 check as pass/fail.

---

## 9. Post-integration verification checklist

- [ ] Exactly one `track.js` loader, `defer`, last before `</body>`.
- [ ] No inline `Track.*` call appears before the loader in DOM order.
- [ ] Read-progress target resolves to one element (article or configured).
- [ ] At most one `data-track-view` and one `data-track-click` added (unless
      explicitly instructed otherwise); none on outbound/download links.
- [ ] All added event/prop names match the §2/§3 grammar.
- [ ] No edits to `track.js` outside the §4 whitelist.
- [ ] If production: `console.enabled === false`.
- [ ] Consent handling matches the active mode; blockers reported if any.
- [ ] Loading the page and running `Track.debug()` in console returns an
      object with a `session.id` and no thrown errors.

---

## 10. Minimal correct result (reference)

For a generic static page with one `<article>`, one hero `.viz`, one primary
CTA, GTM present, non-production, consent `required` with a banner:

```html
  ...
  <div class="viz" data-track-view="primary_visual_seen"
       data-track-prop-id="viz">...</div>
  ...
  <article> ... </article>
  ...
  <a class="cta" href="/go" data-track-click="primary_cta_click"
     data-track-prop-label="Get started">Get started</a>
  ...
  <script src="track.js" defer></script>
  <script>
    var a = document.querySelector('[data-consent-accept]');
    var d = document.querySelector('[data-consent-decline]');
    if (a) a.addEventListener('click', function(){ Track.consent.grant(); });
    if (d) d.addEventListener('click', function(){ Track.consent.revoke(); });
  </script>
</body>
```

CONFIG: unchanged (GTM default, console left on for non-production).
Assumptions: script path defaulted to same directory; only primary visual and
CTA tagged. Blockers: none if banner present.
