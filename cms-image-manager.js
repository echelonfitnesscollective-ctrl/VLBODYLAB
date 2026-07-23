(function () {
  const config = window.VL_CMS_CONFIG;
  if (!config || !window.supabase) return;
  const client = window.supabase.createClient(config.url, config.key);
  const panel = document.querySelector('#cms-panel');
  if (!panel) return;
  const section = document.createElement('section');
  section.className = 'panel';
  section.innerHTML = '<div class="panel-head"><div><p class="eyebrow">Image manager</p><h2>Replace website photos</h2></div></div><p>Use the current filename (example: your-photo.jpg) and a new image URL. Every matching photo on the site updates without code edits.</p><form id="media-form" class="grid"><label>Current filename<input name="target" required placeholder="your-photo.jpg"></label><label>Replacement image URL<input name="image_url" type="url" required placeholder="https://..."></label><label class="span-2">Alt text<input name="alt_text" maxlength="160" placeholder="Optional description"></label><div class="span-2 form-actions"><button class="button" type="submit">Save image replacement</button></div></form><p class="status" id="media-status"></p><div id="media-list"></div>';
  panel.append(section);
  const form = section.querySelector('#media-form'); const status = section.querySelector('#media-status'); const list = section.querySelector('#media-list');
  async function refresh() { const { data, error } = await client.from(config.mediaTable).select('*').eq('brand', config.brand).order('updated_at', { ascending: false }); if (error) { list.textContent = 'Run the VL image-manager SQL setup in Supabase once.'; return; } list.replaceChildren(...(data || []).map((item) => { const row = document.createElement('p'); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button button-light'; remove.textContent = 'Remove'; remove.onclick = async () => { await client.from(config.mediaTable).delete().eq('id', item.id); refresh(); }; row.textContent = `${item.target} → ${item.image_url} `; row.append(remove); return row; })); }
  form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); status.textContent = 'Saving…'; const { error } = await client.from(config.mediaTable).upsert({ brand: config.brand, target: values.target.trim(), image_url: values.image_url.trim(), alt_text: values.alt_text.trim() || null }, { onConflict: 'brand,target' }); status.textContent = error ? 'Could not save. Confirm the image-manager SQL setup is run.' : 'Image replacement saved.'; if (!error) { form.reset(); refresh(); } });
  client.auth.getSession().then(({ data }) => { if (data.session) refresh(); });
}());
