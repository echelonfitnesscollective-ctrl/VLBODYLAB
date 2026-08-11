const config = window.VL_CMS_CONFIG;
const CONFIGURED = Boolean(config && config.url && config.key);
const client = CONFIGURED ? window.supabase.createClient(config.url, config.key) : null;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const PAGES = ['homepage', 'grit', 'kitchen', 'smoothies', 'snacks'];
function pageForKey(key) {
  if (key.startsWith('home_')) return 'homepage';
  if (key.startsWith('grit_')) return 'grit';
  if (key.startsWith('kitchen_')) return 'kitchen';
  if (key.startsWith('smoothies_')) return 'smoothies';
  if (key.startsWith('snacks_')) return 'snacks';
  return 'homepage';
}

function message(target, text, isError = false) {
  target.textContent = text;
  target.style.color = isError ? '#8a274b' : '#476447';
}
function safe(text) { return text || '—'; }
function escapeHtml(text) { const node = document.createElement('div'); node.textContent = text || ''; return node.innerHTML; }

async function withButtonState(button, busyLabel, task) {
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.innerHTML = busyLabel;
  try {
    await task();
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function requireOperator() {
  if (!client) {
    message($('#login-feedback'), 'The Supabase project keys are missing from cms-config.js.', true);
    return;
  }
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const { error } = await client.from('vl_admins').select('email').limit(1);
  if (error) {
    await client.auth.signOut();
    message($('#login-feedback'), 'This email is not approved for the VL Body Lab admin console.', true);
    return;
  }
  $('#operator-email').textContent = session.user.email;
  $('#operator-email').classList.remove('hidden');
  $('#sign-out').classList.remove('hidden');
  $('#login-shell').classList.add('hidden');
  $('#console').classList.remove('hidden');
  await Promise.all([loadContent(), loadMedia()]);
}

async function signInWithPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#login-feedback');
  message(feedback, '');
  if (!client) return message(feedback, 'The Supabase project keys are missing from cms-config.js.', true);
  const button = form.querySelector('button[type="submit"]');
  try {
    await withButtonState(button, 'Signing in…', async () => {
      const values = new FormData(form);
      const email = (values.get('email') || '').trim();
      const password = values.get('password') || '';
      if (!email || !password) { message(feedback, 'Enter both your email and password.', true); return; }
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        message(feedback, error.message === 'Invalid login credentials' ? 'Incorrect email or password. Try "Forgot your password?" below.' : error.message, true);
        return;
      }
      message(feedback, 'Signed in. Loading your console…');
      await requireOperator();
    });
  } catch (err) {
    message(feedback, err?.message || 'Something went wrong. Please try again.', true);
  }
}

async function forgotPassword() {
  const form = $('#password-login-form');
  const feedback = $('#login-feedback');
  message(feedback, '');
  if (!client) return message(feedback, 'The Supabase project keys are missing from cms-config.js.', true);
  const email = (form.querySelector('[name="email"]').value || '').trim();
  if (!email) { message(feedback, 'Type your email above first, then click this link again.', true); return; }
  const link = $('#forgot-password-link');
  try {
    await withButtonState(link, 'Sending…', async () => {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
      message(feedback, error ? error.message : 'Check your inbox for a link to set your password.', Boolean(error));
    });
  } catch (err) {
    message(feedback, err?.message || 'Something went wrong. Please try again.', true);
  }
}

async function setNewPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#set-password-feedback');
  message(feedback, '');
  const button = form.querySelector('button[type="submit"]');
  try {
    await withButtonState(button, 'Saving…', async () => {
      const password = new FormData(form).get('password');
      const { error } = await client.auth.updateUser({ password });
      if (error) { message(feedback, error.message, true); return; }
      message(feedback, 'Password saved. Loading your console…');
      form.classList.add('hidden');
      $('#password-login-form').classList.remove('hidden');
      await requireOperator();
    });
  } catch (err) {
    message(feedback, err?.message || 'Something went wrong. Please try again.', true);
  }
}

// ---------------------------------------------------------------------------
// Content tabs
// ---------------------------------------------------------------------------
function showPanel(name) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === name));
  $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panelName === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderContentCard(item) {
  const card = document.createElement('article');
  card.className = 'content-card';
  card.innerHTML = `
    <span class="badge ${item.published ? '' : 'draft'}">${item.published ? 'Published' : 'Draft'} · ${escapeHtml(item.section_name)}</span>
    <h3>${escapeHtml(safe(item.title || item.eyebrow))}</h3>
    <p>${escapeHtml(safe(item.body || item.cta_label))}</p>
    <footer><span>${item.cta_url ? escapeHtml(item.cta_url) : ''}</span><button type="button">Edit ↗</button></footer>
  `;
  card.querySelector('button').addEventListener('click', () => openEditor(item));
  return card;
}

let allContent = [];
async function loadContent() {
  const { data, error } = await client.from('vl_content_items').select('*').order('section_name').order('content_key');
  if (error) return;
  allContent = data || [];
  PAGES.forEach((page) => {
    const list = $(`#list-${page}`);
    list.replaceChildren();
    allContent.filter((item) => pageForKey(item.content_key) === page).forEach((item) => list.append(renderContentCard(item)));
  });
}

function openEditor(item) {
  const form = $('#content-form');
  form.elements.id.value = item.id;
  form.elements.eyebrow.value = item.eyebrow || '';
  form.elements.title.value = item.title || '';
  form.elements.body.value = item.body || '';
  form.elements.cta_label.value = item.cta_label || '';
  form.elements.cta_url.value = item.cta_url || '';
  form.elements.published.value = String(item.published);
  $('#editor-section').textContent = item.section_name;
  $('#editor-title').textContent = `Edit — ${item.content_key}`;
  $('#content-feedback').textContent = '';
  $('#content-editor').showModal();
}

async function saveContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#content-feedback');
  message(feedback, '');
  const values = new FormData(form);
  const payload = {
    eyebrow: values.get('eyebrow').trim() || null,
    title: values.get('title').trim() || null,
    body: values.get('body').trim() || null,
    cta_label: values.get('cta_label').trim() || null,
    cta_url: values.get('cta_url').trim() || null,
    published: values.get('published') === 'true',
  };
  const button = form.querySelector('button[type="submit"]');
  try {
    await withButtonState(button, 'Saving…', async () => {
      const { error } = await client.from('vl_content_items').update(payload).eq('id', values.get('id'));
      if (error) { message(feedback, error.message, true); return; }
      message(feedback, payload.published ? 'Saved and published to the live site.' : 'Saved privately as a draft.');
      await loadContent();
      setTimeout(() => $('#content-editor').close(), 650);
    });
  } catch (err) {
    message(feedback, err?.message || 'Something went wrong. Please try again.', true);
  }
}

// ---------------------------------------------------------------------------
// Image studio
// ---------------------------------------------------------------------------
function mediaCard(item) {
  const card = document.createElement('article');
  card.className = 'media-card';
  card.innerHTML = `
    <img src="${escapeHtml(item.source_url)}" alt="${escapeHtml(item.alt_text)}">
    <div class="media-body">
      <p>${item.published ? 'Published' : 'Draft'}${item.target_filename ? ` · replaces ${escapeHtml(item.target_filename)}` : ''}</p>
      <h3>${escapeHtml(item.placement)}</h3>
      <div class="media-actions">
        <button type="button" data-action="toggle">${item.published ? 'Unpublish' : 'Publish'}</button>
        <button type="button" data-action="delete">Delete</button>
      </div>
    </div>
  `;
  card.querySelector('[data-action="toggle"]').addEventListener('click', async (event) => {
    const feedback = $('#media-feedback');
    try {
      await withButtonState(event.currentTarget, '…', async () => {
        const { error } = await client.from('vl_media_items').update({ published: !item.published }).eq('id', item.id);
        if (error) { message(feedback, error.message, true); return; }
        await loadMedia();
      });
    } catch (err) { message(feedback, err?.message || 'Something went wrong.', true); }
  });
  card.querySelector('[data-action="delete"]').addEventListener('click', async (event) => {
    if (!confirm(`Delete the "${item.placement}" image from the studio?`)) return;
    const feedback = $('#media-feedback');
    try {
      await withButtonState(event.currentTarget, '…', async () => {
        const { error } = await client.from('vl_media_items').delete().eq('id', item.id);
        if (error) { message(feedback, error.message, true); return; }
        if (item.storage_path) await client.storage.from('vl-body-lab-media').remove([item.storage_path]);
        await loadMedia();
      });
    } catch (err) { message(feedback, err?.message || 'Something went wrong.', true); }
  });
  return card;
}

async function loadMedia() {
  const { data, error } = await client.from('vl_media_items').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) return;
  const list = $('#media-list');
  list.replaceChildren(...(data || []).map(mediaCard));
  $('#media-count').textContent = `${(data || []).length} image${(data || []).length === 1 ? '' : 's'}`;
}

async function uploadMedia(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#media-feedback');
  message(feedback, '');
  const values = new FormData(form);
  const file = values.get('file');
  if (!file || !file.size) return message(feedback, 'Choose a JPG, PNG, or WebP image first.', true);
  if (file.size > 12 * 1024 * 1024) return message(feedback, 'Choose an image smaller than 12 MB.', true);
  const button = form.querySelector('button[type="submit"]');
  try {
    await withButtonState(button, 'Uploading…', async () => {
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `uploads/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const upload = await client.storage.from('vl-body-lab-media').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) { message(feedback, upload.error.message, true); return; }
      const source_url = client.storage.from('vl-body-lab-media').getPublicUrl(path).data.publicUrl;
      const payload = {
        placement: values.get('placement').trim(),
        target_filename: values.get('target_filename').trim() || null,
        alt_text: values.get('alt_text').trim(),
        caption: values.get('caption').trim() || null,
        source_url,
        storage_path: path,
        published: values.get('published') === 'true',
        sort_order: Number(values.get('sort_order')) || 0,
      };
      const { error } = await client.from('vl_media_items').insert(payload);
      if (error) { await client.storage.from('vl-body-lab-media').remove([path]); message(feedback, error.message, true); return; }
      form.reset();
      form.elements.sort_order.value = '0';
      message(feedback, payload.published ? 'Uploaded and published. Check the live page.' : 'Uploaded as a private draft.');
      await loadMedia();
    });
  } catch (err) {
    message(feedback, err?.message || 'Something went wrong. Please try again.', true);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  $('#password-login-form').addEventListener('submit', signInWithPassword);
  $('#forgot-password-link').addEventListener('click', forgotPassword);
  $('#set-password-form').addEventListener('submit', setNewPassword);
  $('#content-form').addEventListener('submit', saveContent);
  $('#cancel-edit').addEventListener('click', () => $('#content-editor').close());
  $('#media-form').addEventListener('submit', uploadMedia);
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
  $$('[data-refresh]').forEach((button) => button.addEventListener('click', () => loadContent()));
  $('#sign-out').addEventListener('click', async () => { await client.auth.signOut(); location.reload(); });

  if (client) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        $('#login-shell').classList.remove('hidden');
        $('#console').classList.add('hidden');
        $('#password-login-form').classList.add('hidden');
        $('#set-password-form').classList.remove('hidden');
      }
    });
  }
  requireOperator();
});
