(function () {
  const config = window.VL_CMS_CONFIG;
  if (!config || !window.supabase) return;
  const client = window.supabase.createClient(config.url, config.key);

  // Generic binder: any element with data-cms-key="<content_key>" is filled from that row.
  // If it has child .cms-eyebrow/.cms-title/.cms-body/.cms-cta, only those parts update;
  // otherwise the element's own text is set from body, then title, then cta_label.
  function applyContent(items) {
    items.forEach((item) => {
      document.querySelectorAll(`[data-cms-key="${item.content_key}"]`).forEach((el) => {
        if (el.tagName === 'A' && item.cta_url) el.href = item.cta_url;
        const eyebrowEl = el.querySelector('.cms-eyebrow');
        const titleEl = el.querySelector('.cms-title');
        const bodyEl = el.querySelector('.cms-body');
        const ctaEl = el.querySelector('.cms-cta');
        if (!eyebrowEl && !titleEl && !bodyEl && !ctaEl) {
          const text = item.body || item.title || item.cta_label;
          if (text) { el.textContent = text; el.style.whiteSpace = 'pre-line'; }
          return;
        }
        if (eyebrowEl && item.eyebrow) eyebrowEl.textContent = item.eyebrow;
        if (titleEl && item.title) { titleEl.textContent = item.title; titleEl.style.whiteSpace = 'pre-line'; }
        if (bodyEl && item.body) { bodyEl.textContent = item.body; bodyEl.style.whiteSpace = 'pre-line'; }
        if (ctaEl) {
          if (item.cta_label) ctaEl.textContent = item.cta_label;
          if (item.cta_url && ctaEl.tagName === 'A') ctaEl.href = item.cta_url;
        }
      });
    });
  }

  // Media binder: swaps any <img> or CSS background-image whose current source
  // ends with a published item's target_filename. Works site-wide with no
  // per-page wiring because it matches by filename, not by selector.
  function applyMedia(items) {
    items.forEach((asset) => {
      if (!asset.target_filename) return;
      document.querySelectorAll('img[src]').forEach((image) => {
        if ((image.getAttribute('src') || '').endsWith(asset.target_filename)) {
          image.src = asset.source_url;
          if (asset.alt_text) image.alt = asset.alt_text;
        }
      });
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules || []).forEach((rule) => {
            if (rule.style?.backgroundImage?.includes(asset.target_filename)) {
              rule.style.backgroundImage = rule.style.backgroundImage.replaceAll(asset.target_filename, asset.source_url);
            }
          });
        } catch (_) { /* Cross-origin stylesheets are unavailable by design. */ }
      });
    });
  }

  // List binder: any element with data-media-list="<placement>" gets its
  // children replaced entirely by published media rows for that placement,
  // in order — this is how the admin can add/remove/reorder/show/hide
  // carousel items with no code changes. If a placement has zero published
  // rows, the static fallback markup already in the HTML is left alone.
  function applyMediaLists(items) {
    const groups = items.reduce((all, item) => {
      if (document.querySelector(`[data-media-list="${item.placement}"]`)) (all[item.placement] ||= []).push(item);
      return all;
    }, {});
    Object.entries(groups).forEach(([placement, entries]) => {
      const container = document.querySelector(`[data-media-list="${placement}"]`);
      if (!container || !entries.length) return;
      container.replaceChildren(...entries.map((item) => {
        const card = document.createElement('article');
        card.className = 'etsy-item';
        const image = document.createElement('img');
        image.src = item.source_url;
        image.alt = item.alt_text || item.title || 'VL Body Lab';
        const body = document.createElement('div');
        body.className = 'etsy-item-body';
        const title = document.createElement('h3');
        title.textContent = item.title;
        body.append(title);
        if (item.caption) {
          const caption = document.createElement('p');
          caption.textContent = item.caption;
          body.append(caption);
        }
        const link = document.createElement('a');
        link.href = '#contact';
        link.textContent = 'Request the Etsy link →';
        body.append(link);
        card.append(image, body);
        return card;
      }));
    });
  }

  async function loadVLCMS() {
    const [{ data: content }, { data: media }] = await Promise.all([
      client.from(config.contentTable).select('*').eq('published', true),
      client.from(config.mediaTable).select('*').eq('published', true).order('sort_order').order('created_at'),
    ]);
    applyContent(content || []);
    applyMedia(media || []);
    applyMediaLists(media || []);
  }

  document.addEventListener('DOMContentLoaded', loadVLCMS);
}());
