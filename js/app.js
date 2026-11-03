(() => {
  const phone = '523221273314';
  const toast = document.querySelector('.dialog-toast');
  const form = document.querySelector('#reservation-form');
  const serviceField = document.querySelector('#reservation-service');
  const dateField = document.querySelector('#reservation-date');
  let hideTimer;

  if (dateField) {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    dateField.min = today;
  }

  const boundReserveTriggers = new WeakSet();
  function bindReserveTriggers() {
    document.querySelectorAll('.reserve-trigger').forEach((link) => {
      if (boundReserveTriggers.has(link)) return;
      boundReserveTriggers.add(link);
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (link.dataset.service && serviceField) serviceField.value = link.dataset.service;
        document.querySelector('#reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  bindReserveTriggers();

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const data = new FormData(form);
      const date = new Date(`${data.get('date')}T00:00:00`).toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const observations = String(data.get('observations') || '').trim() || 'Sin observaciones.';
      const message = [
        `Hola Antonio Studio, deseo reservar el día ${date} a las ${data.get('time')} para ${data.get('service')}.`,
        `Observaciones: ${observations}`,
        '¿Me confirman si hay disponibilidad?'
      ].join('\n');

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      if (toast) {
        toast.textContent = 'Tu mensaje está listo en WhatsApp. Revísalo y presiona Enviar.';
        toast.classList.add('show');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => toast.classList.remove('show'), 4200);
      }
    });
  }

  async function loadPublicCatalog() {
    const config = window.ANTONIO_STUDIO_SUPABASE || {};
    if (!config.url || !config.anonKey) return;
    if (!window.supabase?.createClient) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      }).catch(() => null);
    }
    if (!window.supabase?.createClient) return;

    try {
      const client = window.supabase.createClient(config.url, config.anonKey);
      const [serviceResult, galleryResult] = await Promise.all([
        client.from('antonio_services').select('id,title,category,description,image_url,image_style,sort_order').eq('active', true).order('sort_order'),
        client.from('antonio_gallery').select('id,title,category,image_url,image_style,sort_order').eq('active', true).order('sort_order')
      ]);
      if (serviceResult.error || galleryResult.error) return;
      const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
      const services = serviceResult.data || [];
      const works = galleryResult.data || [];
      const imageStyle = (value) => /^[a-z-]+$/.test(String(value || '')) ? String(value) : 'cover';

      if (services.length) {
        const serviceList = document.querySelector('.services-list');
        serviceList.innerHTML = services.map((service, index) => `<article class="service-card reveal visible">
          <div class="service-number">${String(index + 1).padStart(2, '0')} <span>${escape(service.category)}</span></div>
          <div class="service-photo ${imageStyle(service.image_style)}"><img src="${escape(service.image_url)}" alt="${escape(service.title)}" loading="lazy"></div>
          <div class="service-copy"><h3>${escape(service.title)}</h3><p>${escape(service.description)}</p></div>
          <a class="button button-outline reserve-trigger" data-service="${escape(service.title)}" href="#reservar">RESERVAR <span aria-hidden="true">↗</span></a>
        </article>`).join('');
        if (serviceField) {
          serviceField.innerHTML = '<option value="" selected disabled>Selecciona un servicio</option>' + services.map((service) => `<option value="${escape(service.title)}">${escape(service.title)}</option>`).join('');
        }
        bindReserveTriggers();
      }

      if (works.length) {
        const workGrid = document.querySelector('.work-grid');
        workGrid.innerHTML = works.map((work, index) => `<article class="work-card reveal visible">
          <div class="work-image ${imageStyle(work.image_style)}"><img src="${escape(work.image_url)}" alt="${escape(work.title)}" loading="lazy"><span class="work-index">${String(index + 1).padStart(2, '0')} / ${escape(work.category)}</span></div>
          <div class="work-caption"><span>${escape(work.title)}</span><span>↗</span></div>
        </article>`).join('');
      }
    } catch (error) {
      // La versión estática inicial sigue visible si no hay red o Supabase todavía no está listo.
    }
  }
  loadPublicCatalog();

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('visible'));
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
