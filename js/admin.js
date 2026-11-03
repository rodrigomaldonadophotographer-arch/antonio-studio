(() => {
  const config = window.ANTONIO_STUDIO_SUPABASE || {};
  const loginPanel = document.querySelector('#login-panel');
  const dashboard = document.querySelector('#dashboard');
  const loginForm = document.querySelector('#login-form');
  const loginButton = document.querySelector('#login-button');
  const loginStatus = document.querySelector('#login-status');
  const dashboardStatus = document.querySelector('#dashboard-status');
  const serviceForm = document.querySelector('#service-form');
  const galleryForm = document.querySelector('#gallery-form');
  const servicesList = document.querySelector('#services-list');
  const galleryList = document.querySelector('#gallery-list');
  const setupHint = document.querySelector('#setup-hint');
  const bucket = 'antonio-media';
  let client = null;
  let services = [];
  let gallery = [];

  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    loginButton.disabled = true;
    setupHint.textContent = 'Conexión pendiente: agrega la URL y la clave pública del proyecto Supabase en js/supabase-config.js y ejecuta el SQL incluido en la carpeta supabase/.';
    return;
  }

  client = window.supabase.createClient(config.url, config.anonKey);

  function say(message, target = dashboardStatus) {
    if (target) target.textContent = message;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function safeImageUrl(value) {
    const url = String(value || '');
    return /^https?:\/\//i.test(url) || url.startsWith('images/') || url.startsWith('./images/') ? url : '';
  }

  async function verifyAdmin() {
    const { data, error } = await client.rpc('is_antonio_studio_admin');
    if (error || data !== true) {
      await client.auth.signOut();
      loginPanel.hidden = false;
      dashboard.hidden = true;
      say('Esta cuenta no tiene permiso de administración.', loginStatus);
      return false;
    }
    loginPanel.hidden = true;
    dashboard.hidden = false;
    await refreshLists();
    return true;
  }

  async function refreshLists() {
    say('Cargando contenido…');
    const [serviceResult, galleryResult] = await Promise.all([
      client.from('antonio_services').select('*').order('sort_order').order('created_at'),
      client.from('antonio_gallery').select('*').order('sort_order').order('created_at')
    ]);
    if (serviceResult.error || galleryResult.error) {
      say(`No pude leer el contenido. ${serviceResult.error?.message || galleryResult.error?.message || ''}`);
      return;
    }
    services = serviceResult.data || [];
    gallery = galleryResult.data || [];
    drawList(servicesList, services, 'service');
    drawList(galleryList, gallery, 'gallery');
    say('Contenido sincronizado.');
  }

  function drawList(container, items, kind) {
    if (!items.length) {
      container.innerHTML = '<p class="empty-list">Todavía no hay elementos guardados.</p>';
      return;
    }
    container.innerHTML = items.map((item) => {
      const image = safeImageUrl(item.image_url);
      return `<article class="record-item">
        <img src="${escapeHTML(image)}" alt="" loading="lazy">
        <div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.category)} · ${item.active ? 'Visible' : 'Oculto'}</small></div>
        <div class="record-actions"><button type="button" data-action="edit" data-kind="${kind}" data-id="${escapeHTML(item.id)}">EDITAR</button><button type="button" data-action="delete" data-kind="${kind}" data-id="${escapeHTML(item.id)}">BORRAR</button></div>
      </article>`;
    }).join('');
  }

  async function uploadImage(file, kind) {
    if (!file) return '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen JPG, PNG o WebP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 10 MB.');
    const cleanName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const path = `${kind}/${crypto.randomUUID()}-${cleanName}`;
    const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function saveRecord(form, table, kind) {
    const data = new FormData(form);
    const record = {
      title: String(data.get('title') || '').trim(),
      category: String(data.get('category') || '').trim().toUpperCase(),
      sort_order: Number(data.get('sort_order') || 0),
      active: form.elements.active.checked,
      image_style: String(data.get('image_style') || 'cover'),
      updated_at: new Date().toISOString()
    };
    if (kind === 'service') record.description = String(data.get('description') || '').trim();

    const selectedFile = form.elements.image.files[0];
    try {
      if (selectedFile) {
        record.image_url = await uploadImage(selectedFile, kind);
        record.image_style = 'cover';
      }
      else record.image_url = String(data.get('image_url') || '');
      if (!record.image_url) throw new Error('Selecciona una foto antes de guardar.');

      const id = String(data.get('id') || '');
      const query = id
        ? client.from(table).update(record).eq('id', id)
        : client.from(table).insert(record);
      const { error } = await query;
      if (error) throw error;
      form.reset();
      form.elements.id.value = '';
      form.elements.image_url.value = '';
      form.elements.image_style.value = 'cover';
      say(kind === 'service' ? 'Servicio guardado.' : 'Foto guardada.');
      await refreshLists();
    } catch (error) {
      say(error.message || 'No se pudo guardar el elemento.');
    }
  }

  function editRecord(form, item) {
    form.elements.id.value = item.id;
    form.elements.title.value = item.title || '';
    form.elements.category.value = item.category || '';
    form.elements.sort_order.value = item.sort_order ?? 0;
    form.elements.active.checked = item.active;
    form.elements.image_url.value = item.image_url || '';
    form.elements.image_style.value = item.image_style || 'cover';
    if (form.elements.description) form.elements.description.value = item.description || '';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    say('Editando. Si no eliges otra foto, se conserva la actual.');
  }

  function storagePath(imageUrl) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const position = String(imageUrl || '').indexOf(marker);
    return position < 0 ? '' : decodeURIComponent(imageUrl.slice(position + marker.length).split('?')[0]);
  }

  async function deleteRecord(table, kind, id) {
    const list = kind === 'service' ? services : gallery;
    const item = list.find((record) => record.id === id);
    if (!item || !window.confirm(`¿Borrar “${item.title}” del catálogo?`)) return;
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) {
      say(error.message);
      return;
    }
    const path = storagePath(item.image_url);
    if (path) await client.storage.from(bucket).remove([path]);
    say('Elemento borrado.');
    await refreshLists();
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    say('Validando acceso…', loginStatus);
    const data = new FormData(loginForm);
    const { error } = await client.auth.signInWithPassword({
      email: data.get('email'), password: data.get('password')
    });
    loginButton.disabled = false;
    if (error) {
      say('No pude iniciar sesión. Revisa el correo y la contraseña.', loginStatus);
      return;
    }
    await verifyAdmin();
  });

  serviceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRecord(serviceForm, 'antonio_services', 'service');
  });
  galleryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRecord(galleryForm, 'antonio_gallery', 'gallery');
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const kind = button.dataset.kind;
    const item = (kind === 'service' ? services : gallery).find((record) => record.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'edit') editRecord(kind === 'service' ? serviceForm : galleryForm, item);
    if (button.dataset.action === 'delete') deleteRecord(kind === 'service' ? 'antonio_services' : 'antonio_gallery', kind, item.id);
  });

  document.querySelector('#signout-button').addEventListener('click', async () => {
    await client.auth.signOut();
    dashboard.hidden = true;
    loginPanel.hidden = false;
    loginForm.reset();
    say('Sesión cerrada.', loginStatus);
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session) verifyAdmin();
  });
})();
