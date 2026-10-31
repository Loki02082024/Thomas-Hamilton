/* THOMAS HAMILTON — interactions & visual effects.
   Everything here is an enhancement: pages work with JS disabled. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const html = document.documentElement;
  const I18N = JSON.parse($('#i18n')?.textContent || '{}');
  const REDUCED = html.classList.contains('reduced');
  const FINE = matchMedia('(pointer: fine)').matches;
  const DESKTOP = matchMedia('(min-width: 961px)');
  const hasGsap = typeof window.gsap !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger, ...(window.SplitText ? [SplitText] : []));

  /* ───────────── smooth scroll ───────────── */
  let lenis = null;
  if (!REDUCED && window.Lenis && hasGsap) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const lockScroll = (on) => { if (lenis) on ? lenis.stop() : lenis.start(); document.body.style.overflow = on ? 'hidden' : ''; };

  /* ───────────── header ───────────── */
  const header = $('[data-header]');
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    header.classList.toggle('is-hidden', y > 400 && y > lastY && !html.classList.contains('menu-open'));
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ───────────── mobile menu ───────────── */
  const menu = $('[data-menu]'), menuBtn = $('[data-menu-open]');
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    html.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    lockScroll(open);
    (open ? $('a', menu) : menuBtn).focus({ preventScroll: true });
  };
  menuBtn?.addEventListener('click', () => setMenu(true));
  $('[data-menu-close]')?.addEventListener('click', () => setMenu(false));

  /* ───────────── shoji page transitions ───────────── */
  const shoji = $('[data-shoji]');
  const openShoji = () => {
    if (!html.classList.contains('shoji-in')) return;
    shoji.classList.add('is-closed', 'is-instant');
    html.classList.remove('shoji-in');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      shoji.classList.remove('is-instant', 'is-closed');
    }));
  };
  openShoji();
  addEventListener('pageshow', (e) => { if (e.persisted) shoji.classList.remove('is-closed'); });
  if (!REDUCED) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download') || a.dataset.cartOpen !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/admin')) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash
      e.preventDefault();
      if (html.classList.contains('menu-open')) setMenu(false);
      shoji.classList.add('is-closed');
      try { sessionStorage.setItem('th-shoji', '1'); } catch { /* ignore */ }
      setTimeout(() => { location.href = url.href; }, 720);
    });
  }

  /* ───────────── brush cursor trail ───────────── */
  if (FINE && !REDUCED) {
    const c = document.createElement('canvas');
    c.className = 'ink-trail';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    addEventListener('resize', size);
    const pts = [];
    let raf = 0;
    const LIFE = 600;
    const draw = () => {
      const now = performance.now();
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const life = 1 - (now - b.t) / LIFE;
        const speed = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 40);
        ctx.strokeStyle = `rgba(201,164,92,${0.5 * life})`;
        ctx.lineWidth = Math.max(0.4, (1 - speed) * 5 * life + 0.6); // fast strokes thin out like a dry brush
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      raf = pts.length ? requestAnimationFrame(draw) : 0;
    };
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pts.length > 60) pts.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
  }

  /* ───────────── gold dust in the hero ───────────── */
  const dust = $('[data-dust]');
  if (dust && !REDUCED) {
    const ctx = dust.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w, h, parts = [], running = false, raf = 0;
    const size = () => {
      w = dust.clientWidth; h = dust.clientHeight;
      dust.width = w * dpr; dust.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 16000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + 0.3,
        vy: -(Math.random() * 0.25 + 0.05), vx: (Math.random() - 0.5) * 0.15, p: Math.random() * Math.PI * 2,
      }));
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of parts) {
        d.x += d.vx; d.y += d.vy; d.p += 0.02;
        if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
        const a = 0.25 + Math.sin(d.p) * 0.25;
        ctx.fillStyle = `rgba(230,200,138,${a})`;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = running ? requestAnimationFrame(tick) : 0;
    };
    size();
    addEventListener('resize', size);
    new IntersectionObserver(([en]) => {
      running = en.isIntersecting;
      if (running && !raf) raf = requestAnimationFrame(tick);
    }).observe(dust);
  }

  /* ───────────── GSAP choreography ───────────── */
  if (hasGsap && !REDUCED) {
    // Hero: title lines rise, kakejiku unrolls, ink bleeds the chair onto the paper
    const hero = $('[data-hero]');
    if (hero) {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.15 });
      tl.from('[data-hero-line]', { yPercent: 115, duration: 1.4, stagger: 0.12 })
        .from('[data-hero-fade]', { opacity: 0, y: 24, duration: 1.1, stagger: 0.1 }, '-=1.0');
      const paper = $('[data-kakejiku-paper]');
      if (paper) {
        const inks = $$('[data-ink]');
        gsap.set(inks, { attr: { r: 0 } });
        tl.from('[data-kakejiku]', { opacity: 0, y: -40, duration: 1 }, 0.2)
          .from(paper, { clipPath: 'inset(0 0 100% 0)', duration: 1.6, ease: 'power3.inOut' }, 0.5)
          .to(inks, { attr: { r: 420 }, duration: 2.6, stagger: 0.35, ease: 'power2.out' }, 1.5)
          .from('.kakejiku__seal', { scale: 1.6, opacity: 0, rotate: -12, duration: 0.5, ease: 'back.out(3)' }, 2.9);
        // gentle sway, like a scroll hanging in a draught
        gsap.to('[data-kakejiku]', { rotate: 0.6, transformOrigin: '50% -60px', duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      }
    }

    // Split headings reveal line by line
    $$('[data-split]').forEach((el) => {
      if (!window.SplitText) return;
      const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      gsap.from(split.lines, {
        yPercent: 105, duration: 1.2, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // Generic fade-up
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%', once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
    });

    // Manifesto: each word is "inked" as you scroll through it
    $$('[data-words]').forEach((el) => {
      const text = el.textContent.trim();
      const cjk = /[぀-ヿ一-鿿]/.test(text);
      const tokens = cjk ? [...text] : text.split(/(\s+)/);
      el.innerHTML = '';
      const words = [];
      tokens.forEach((tok) => {
        if (/^\s+$/.test(tok)) { el.append(tok); return; }
        const s = document.createElement('span');
        s.className = 'w'; s.textContent = tok;
        el.append(s); words.push(s);
      });
      el.setAttribute('aria-label', text);
      ScrollTrigger.create({
        trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true,
        onUpdate: (st) => {
          const n = Math.round(st.progress * words.length);
          words.forEach((w, i) => w.classList.toggle('on', i < n));
        },
      });
    });

    // Brush strokes draw themselves (ensō)
    const drawPath = (path, trigger, opts = {}) => {
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger, start: opts.start || 'top 85%', end: opts.end || 'center 45%', scrub: 1 },
      });
    };
    $$('[data-draw]').forEach((p) => drawPath(p, p.closest('section')));
    $$('[data-enso-path]').forEach((p) => drawPath(p, $('[data-enso]'), { start: 'top 80%', end: 'bottom 60%' }));

    // Numbers count up
    $$('[data-count-to]').forEach((el) => {
      const to = Number(el.dataset.countTo), o = { v: 0 };
      gsap.to(o, {
        v: to, duration: 2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });

    // Ritual progress line
    const ritual = $('[data-ritual]');
    if (ritual) {
      gsap.to('[data-ritual-line]', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: ritual, start: 'top 70%', end: 'bottom 60%', scrub: true } });
    }

    // Decorative parallax only (never on text)
    $$('[data-parallax]').forEach((el) => {
      gsap.to(el, { yPercent: Number(el.dataset.parallax), ease: 'none', scrollTrigger: { trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // Featured: horizontal scroll, pinned (desktop only)
    const hs = $('[data-hscroll]');
    if (hs) {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 961px)', () => {
        const track = $('[data-hscroll-track]', hs);
        const dist = () => Math.max(0, track.scrollWidth - innerWidth);
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: {
            trigger: hs, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true,
            onUpdate: (st) => gsap.set('[data-hscroll-progress]', { scaleX: st.progress }),
          },
        });
      });
    }

    addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    $$('[data-reveal]').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; });
  }

  /* ───────────── pointer-reactive cards & pillars ───────────── */
  if (FINE) {
    $$('[data-tilt]').forEach((card) => {
      const media = $('.card__media', card);
      card.addEventListener('pointermove', (e) => {
        const r = media.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        media.style.setProperty('--mx', x * 100 + '%');
        media.style.setProperty('--my', y * 100 + '%');
        if (!REDUCED) {
          media.style.setProperty('--ry', (x - 0.5) * 8 + 'deg');
          media.style.setProperty('--rx', (0.5 - y) * 8 + 'deg');
        }
      });
      card.addEventListener('pointerleave', () => { media.style.setProperty('--rx', '0deg'); media.style.setProperty('--ry', '0deg'); });
    });
    $$('[data-glow]').forEach((el) => el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
    }));
  }

  /* ───────────── product gallery ───────────── */
  const gallery = $('[data-gallery]');
  if (gallery) {
    const main = $('[data-gallery-main]', gallery);
    const img = $('img', main);
    const thumbs = $$('[data-gallery-thumb]', gallery);
    let idx = 0;
    const show = (i) => {
      if (!thumbs.length) return;
      idx = (i + thumbs.length) % thumbs.length;
      main.classList.remove('is-zoom');
      img.classList.add('is-leaving');
      setTimeout(() => {
        img.src = thumbs[idx].dataset.galleryThumb;
        img.onload = () => img.classList.remove('is-leaving');
      }, 200);
      thumbs.forEach((t, k) => t.setAttribute('aria-current', k === idx));
    };
    thumbs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    $('[data-gallery-prev]', gallery)?.addEventListener('click', (e) => { e.stopPropagation(); show(idx - 1); });
    $('[data-gallery-next]', gallery)?.addEventListener('click', (e) => { e.stopPropagation(); show(idx + 1); });
    main.addEventListener('click', () => main.classList.toggle('is-zoom'));
    main.addEventListener('pointermove', (e) => {
      const r = main.getBoundingClientRect();
      main.style.setProperty('--zx', ((e.clientX - r.left) / r.width) * 100 + '%');
      main.style.setProperty('--zy', ((e.clientY - r.top) / r.height) * 100 + '%');
    });
    main.addEventListener('mouseleave', () => main.classList.remove('is-zoom'));
    gallery.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  // variant → price
  $$('[data-variant-price]').forEach((r) => r.addEventListener('change', () => {
    const out = $('[data-price]');
    if (out) out.textContent = r.dataset.variantPrice;
  }));

  /* ───────────── steppers ───────────── */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = $('input', b.closest('[data-stepper]'));
    const v = Math.min(Number(input.max || 10), Math.max(Number(input.min || 0), Number(input.value || 0) + Number(b.dataset.step)));
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ───────────── cart drawer ───────────── */
  const drawer = $('[data-drawer]');
  const countEls = $$('[data-cart-count]');
  const toast = $('[data-toast]');
  let lastFocus = null;
  const post = (url, body) => fetch(url, {
    method: 'POST', body: new URLSearchParams(body),
    headers: { Accept: 'application/json', 'X-CSRF-Token': I18N.csrf },
  });
  const setCount = (n) => countEls.forEach((el) => {
    el.textContent = n; el.dataset.count = n;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  });
  const showToast = (msg) => {
    $('span', toast).textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => toast.classList.remove('is-on'), 2600);
  };
  async function renderDrawer() {
    const res = await fetch(I18N.base + '/cart/drawer', { headers: { Accept: 'text/html' } });
    const tpl = document.createElement('div');
    tpl.innerHTML = await res.text();
    const part = (n) => $(`template[data-part="${n}"]`, tpl).content;
    $('[data-drawer-body]', drawer).replaceChildren(part('body'));
    $('[data-drawer-foot]', drawer).replaceChildren(part('foot'));
    setCount(part('count').textContent.trim());
  }
  const openDrawer = async () => {
    lastFocus = document.activeElement;
    await renderDrawer();
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    lockScroll(true);
    $('.drawer__panel', drawer).focus();
  };
  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    lastFocus?.focus?.();
  };
  $$('[data-cart-open]').forEach((a) => a.addEventListener('click', (e) => {
    if (document.body.dataset.page === 'cart' || document.body.dataset.page === 'checkout') return;
    e.preventDefault();
    openDrawer().catch(() => { location.href = a.href; });
  }));
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawer.classList.contains('is-open')) closeDrawer();
    if (html.classList.contains('menu-open')) setMenu(false);
  });

  // add to cart (Buy now keeps the normal POST → checkout)
  $$('[data-add-to-cart]').forEach((form) => form.addEventListener('submit', async (e) => {
    if (e.submitter?.name === 'buyNow') return;
    e.preventDefault();
    const btn = e.submitter;
    btn?.setAttribute('aria-busy', 'true');
    try {
      const res = await post(form.action, new FormData(form));
      if (!res.ok) throw new Error();
      showToast(I18N.added);
      await openDrawer();
    } catch {
      form.submit();
    } finally {
      btn?.removeAttribute('aria-busy');
    }
  }));

  // qty change / remove: inside the drawer via fetch, on the cart page via normal submit
  document.addEventListener('change', (e) => {
    const form = e.target.closest('[data-cart-update]');
    if (form && e.target.name === 'qty') form.requestSubmit();
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-cart-update]');
    if (!form || !form.closest('[data-drawer]')) return;
    e.preventDefault();
    const data = new FormData(form);
    if (e.submitter?.name === 'remove') data.set('remove', '1');
    await post(form.action, data);
    await renderDrawer();
  });

  /* ───────────── forms ───────────── */
  $$('[data-ajax-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.parentElement.querySelector('[data-form-status]');
    try {
      const res = await post(form.action, new FormData(form));
      if (!res.ok) throw new Error();
      form.reset();
      if (status) status.textContent = '✓ ' + I18N.sent;
    } catch {
      if (status) status.textContent = I18N.error;
    }
  }));

  $$('[data-autosubmit] select').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  const topic = $('[data-topic]');
  if (topic) {
    const toggle = () => { $('[data-experience-only]').hidden = topic.value !== 'experience'; };
    topic.addEventListener('change', toggle);
    toggle();
  }

  // prevent double submits on checkout / contact
  $$('[data-checkout], [data-contact]').forEach((form) => form.addEventListener('submit', () => {
    const b = $('[data-submit]', form);
    if (b) { b.setAttribute('aria-busy', 'true'); setTimeout(() => { b.disabled = true; }, 0); }
  }));
  $('[data-error-summary]')?.focus();
})();
