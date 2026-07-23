(function () {
  const config = window.VL_CMS_CONFIG;
  if (!config || !window.supabase) return;

  const targets = {
    homepage: '#story',
    lab: '#lab',
    shop: '#shop',
    etsy: '#etsy-drops',
    essentials: '#essentials',
    creator: '#creator',
    travel: '#travel',
    updates: '#creator'
  };

  function link(url, label) {
    if (!url) return null;
    const item = document.createElement('a');
    item.className = 'cms-update-action';
    item.href = url;
    item.textContent = label || 'Learn more →';
    if (/^https?:\/\//i.test(url)) { item.target = '_blank'; item.rel = 'noopener'; }
    return item;
  }

  function render(items) {
    document.querySelectorAll('[data-vl-cms-feed]').forEach((node) => node.remove());
    const groups = items.reduce((all, item) => { (all[item.placement] ||= []).push(item); return all; }, {});
    Object.entries(groups).forEach(([placement, entries]) => {
      const target = document.querySelector(targets[placement]);
      if (!target) return;
      const feed = document.createElement('div');
      feed.className = 'cms-update-feed';
      feed.dataset.vlCmsFeed = placement;
      entries.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'cms-update-card';
        if (item.image_url) {
          const image = document.createElement('img');
          image.src = item.image_url; image.alt = item.title || 'VL Body Lab update'; image.loading = 'lazy';
          card.append(image);
        }
        const copy = document.createElement('div');
        if (item.eyebrow) { const tag = document.createElement('span'); tag.textContent = item.eyebrow; tag.className = 'cms-update-eyebrow'; copy.append(tag); }
        const title = document.createElement('h3'); title.textContent = item.title; copy.append(title);
        if (item.body) { const body = document.createElement('p'); body.textContent = item.body; copy.append(body); }
        const cta = link(item.cta_url, item.cta_label);
        if (cta) copy.append(cta);
        card.append(copy); feed.append(card);
      });
      target.prepend(feed);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const client = window.supabase.createClient(config.url, config.key);
    const { data, error } = await client.from(config.table)
      .select('placement,eyebrow,title,body,cta_label,cta_url,image_url,sort_order,publish_at')
      .eq('brand', config.brand)
      .order('sort_order', { ascending: true })
      .order('publish_at', { ascending: false })
      .limit(32);
    if (!error && data?.length) render(data);
  });
}());
