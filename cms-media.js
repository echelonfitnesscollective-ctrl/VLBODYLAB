(function () {
  const config = window.VL_CMS_CONFIG;
  if (!config || !window.supabase) return;
  const client = window.supabase.createClient(config.url, config.key);
  client.from(config.mediaTable).select('target,image_url,alt_text').eq('brand', config.brand).then(({ data }) => {
    (data || []).forEach((asset) => {
      document.querySelectorAll('img[src]').forEach((image) => {
        if ((image.getAttribute('src') || '').endsWith(asset.target)) {
          image.src = asset.image_url;
          if (asset.alt_text) image.alt = asset.alt_text;
        }
      });
      Array.from(document.styleSheets).forEach((sheet) => {
        try { Array.from(sheet.cssRules || []).forEach((rule) => { if (rule.style?.backgroundImage?.includes(asset.target)) rule.style.backgroundImage = rule.style.backgroundImage.replaceAll(asset.target, asset.image_url); }); } catch (_) { /* Cross-origin stylesheets are unavailable by design. */ }
      });
    });
  });
}());
