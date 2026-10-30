(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Header: solid on scroll, hide on scroll down ----------
  const header = $('[data-header]');
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    const menuOpen = document.body.classList.contains('menu-open');
    header.classList.toggle('is-hidden', !menuOpen && y > 400 && y > lastY + 4);
    if (y < lastY - 4 || y < 400) header.classList.remove('is-hidden');
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Mobile drawer ----------
  const toggle = $('[data-menu-toggle]');
  const drawer = $('[data-drawer]');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
    if (open) $('a', drawer)?.focus();
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });

  // ---------- Scroll reveal ----------
  const revealEls = $$('.reveal, .reveal-line');
  if ('IntersectionObserver' in window && !reduceMotion) {
    // A fully clip-path'd element never reports as intersecting, so .reveal-line watches its parent
    const targets = new Map();
    revealEls.forEach((el) => {
      const watch = el.classList.contains('reveal-line') ? el.parentElement : el;
      if (!targets.has(watch)) targets.set(watch, []);
      targets.get(watch).push(el);
    });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) {
          targets.get(en.target).forEach((el) => el.classList.add('is-in'));
          io.unobserve(en.target);
        }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    targets.forEach((_, watch) => io.observe(watch));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  // ---------- Count-up stats ----------
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    const run = (el) => {
      const raw = el.dataset.count;
      const target = parseFloat(raw.replace(/[^\d]/g, ''));
      const suffix = raw.replace(/[\d.,]/g, '');
      const sep = raw.includes('.') ? '.' : raw.includes(',') ? ',' : '';
      const fmt = (n) => (sep ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep) : Math.round(n)) + suffix;
      const start = performance.now();
      const dur = 1600;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = fmt(target * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
    }), { threshold: 0.5 });
    counters.forEach((c) => io.observe(c));
  }

  // ---------- Product colour selector ----------
  $$('[data-colors]').forEach((group) => {
    const stage = $(group.dataset.colors);
    const label = $('[data-color-name]');
    $$('button', group).forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('button', group).forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        if (stage) stage.style.setProperty('--leather', btn.dataset.hex);
        $$('stop[data-leather]', stage).forEach((s) => s.setAttribute('stop-color', btn.dataset.hex));
        if (label) label.textContent = btn.dataset.name;
      });
    });
  });

  // ---------- Compare selects: navigate on change ----------
  const compareForm = $('[data-compare]');
  compareForm?.addEventListener('change', () => {
    const slugs = $$('select', compareForm).map((s) => s.value).filter(Boolean);
    window.location.search = '?m=' + [...new Set(slugs)].join(',');
  });

  // ---------- AJAX forms with inline validation ----------
  const showErrors = (form, errors = {}) => {
    $$('.field', form).forEach((f) => {
      const name = f.dataset.field;
      const msg = name && errors[name];
      f.classList.toggle('has-error', Boolean(msg));
      const out = $('.field-error', f);
      if (out) out.textContent = msg || '';
      const input = name && form.elements[name];
      const target = input instanceof RadioNodeList ? input[0] : input;
      if (target && target.setAttribute) target.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
    const firstBad = $('.field.has-error input, .field.has-error select, .field.has-error textarea', form);
    firstBad?.focus();
  };

  $$('form[data-ajax]').forEach((form) => {
    // Clear a field's error as soon as the user fixes it
    form.addEventListener('input', (e) => {
      const f = e.target.closest('.field');
      if (f?.classList.contains('has-error')) {
        f.classList.remove('has-error');
        const out = $('.field-error', f);
        if (out) out.textContent = '';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      const status = $('[data-form-status]', form);
      const original = btn.innerHTML;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = btn.dataset.sending || '…';
      if (status) status.hidden = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          const success = $(form.dataset.success);
          form.hidden = true;
          if (success) {
            success.hidden = false;
            success.setAttribute('tabindex', '-1');
            success.focus();
            success.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
          }
        } else if (data.errors) {
          showErrors(form, data.errors);
        } else {
          throw new Error('Request failed');
        }
      } catch {
        if (status) status.hidden = false;
      } finally {
        btn.removeAttribute('aria-busy');
        btn.innerHTML = original;
      }
    });
  });

  // ---------- Newsletter ----------
  $$('[data-newsletter]').forEach((form) => {
    const msg = $('.newsletter-msg', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.elements.email;
      if (!email.checkValidity() || !email.value) {
        msg.style.color = 'var(--danger)';
        msg.textContent = msg.dataset.err;
        email.focus();
        return;
      }
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)),
        });
        msg.style.color = res.ok ? '' : 'var(--danger)';
        msg.textContent = res.ok ? msg.dataset.ok : msg.dataset.err;
        if (res.ok) form.reset();
      } catch {
        msg.style.color = 'var(--danger)';
        msg.textContent = msg.dataset.err;
      }
    });
  });
})();
