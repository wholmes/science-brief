# Science Brief

A series of web-based science articles sponsored and written by [Brand Meets Code](https://brandmeetscode.com).

Each article translates recent scientific research into clear, visually rich long-form reads — built as standalone static pages with custom illustrations, interactive visualizations, and full analytics via `track.js`.

## Articles

| Slug | Title |
|---|---|
| [`/cosmic-web-explainer`](cosmic-web-explainer/index.html) | The Universe Has a Skeleton — And We Just Saw It Clearly for the First Time |

## Project structure

```
science-brief/
  <page-slug>/
    index.html    page markup
    style.css     page-specific styles
    page.js       page-specific JS and analytics config
  js/
    track.js      shared analytics layer (consent-aware, transport-agnostic)
  vercel.json     clean URL and trailing-slash config
```

Each page is self-contained. Shared JavaScript lives in `js/` and is referenced with an absolute path so it works across all pages.

## Adding a new article

1. Create a new folder with the article's slug: `mkdir my-article`
2. Add `index.html`, `style.css`, and `page.js` inside it
3. In `index.html`, reference the shared analytics and page files:
   ```html
   <link rel="stylesheet" href="style.css">
   ...
   <script src="/js/track.js" defer></script>
   <script src="page.js" defer></script>
   ```
4. In `page.js`, call `Track.set()` with the article's metadata:
   ```js
   Track.set({ content_type: 'science_brief', topic: 'your-topic', author: 'BrandMeetsCode' });
   ```
5. Push — Vercel serves the page at `/my-article` automatically.

## SEO

Each page's `index.html` includes a full SEO block: `<meta name="description">`, canonical URL, Open Graph, Twitter Card, and a JSON-LD `Article` schema. When you add a new article, copy the SEO block from `cosmic-web-explainer/index.html` and update the title, description, URL, dates, and `about` entities.

The XML sitemap lives at `sitemap.xml` in the repo root. Add a new `<url>` entry for each article you publish. `robots.txt` points crawlers to it automatically.

## Analytics

Powered by `js/track.js` — a zero-dependency, consent-aware tracking layer that captures page views, scroll depth, read progress, engaged time, outbound clicks, and named conversion events. Consent mode is set to `implied`. Events route to the GTM `dataLayer` by default; configure additional transports (GA4, custom beacon) in the `CONFIG` block at the top of `track.js`.

See `track-integration-guide.md` for full documentation.

---

*Produced by [Brand Meets Code](https://brandmeetscode.com)*
