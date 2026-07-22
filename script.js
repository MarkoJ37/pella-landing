// Before/after drag reveal (signature)
  (function(){
    const ba = document.getElementById('ba');
    if(!ba) return;
    const before = ba.querySelector('.before');
    const fog = ba.querySelector('.fog');
    const handle = ba.querySelector('.handle');
    const knob = ba.querySelector('.knob');
    let dragging = false;
    function setPos(clientX){
      const r = ba.getBoundingClientRect();
      let p = ((clientX - r.left) / r.width) * 100;
      p = Math.max(4, Math.min(96, p));
      before.style.clipPath = `inset(0 ${100-p}% 0 0)`;
      fog.style.clipPath = `inset(0 ${100-p}% 0 0)`;
      handle.style.left = p + '%';
      knob.style.left = p + '%';
    }
    const start = () => dragging = true;
    const end = () => dragging = false;
    const move = e => { if(!dragging) return; setPos(e.touches ? e.touches[0].clientX : e.clientX); };
    ba.addEventListener('mousedown', e=>{start();setPos(e.clientX);});
    ba.addEventListener('touchstart', e=>{start();setPos(e.touches[0].clientX);},{passive:true});
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move,{passive:true});
  })();

  // Hero video — korisnik pokreće, dalje kontroliše nativnim kontrolama
  (function(){
    const video = document.getElementById('hero-video');
    const play = document.getElementById('hero-play');
    if(!video || !play) return;
    play.addEventListener('click', ()=>{
      video.controls = true;
      video.play().then(()=>{ play.hidden = true; }).catch(()=>{ /* korisnik može i preko kontrola */ });
    });
    video.addEventListener('pause', ()=>{ if(video.currentTime === 0) play.hidden = false; });
    video.addEventListener('ended', ()=>{ play.hidden = false; video.currentTime = 0; });
  })();

  // Recenzije — slider screenshot-ova
  (function(){
    const slider = document.getElementById('rev-slider');
    if(!slider) return;
    const track = slider.querySelector('.rev-track');
    const slides = [...track.children];
    const dots = slider.querySelector('.rev-dots');
    if(slides.length < 2) return;

    slides.forEach((_, i)=>{
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'rev-dot';
      d.setAttribute('aria-label', `Recenzija ${i+1}`);
      d.addEventListener('click', ()=> scrollTo(i));
      dots.appendChild(d);
    });

    const step = () => slides[1].offsetLeft - slides[0].offsetLeft;
    const index = () => Math.round(track.scrollLeft / step());
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function scrollTo(i){
      const max = slides.length - 1;
      i = Math.max(0, Math.min(max, i));
      track.scrollTo({ left: i * step(), behavior: reduced ? 'auto' : 'smooth' });
    }
    function sync(){
      const i = index();
      [...dots.children].forEach((d, n)=> d.setAttribute('aria-current', n === i ? 'true' : 'false'));
      slider.querySelector('.rev-nav.prev').disabled = track.scrollLeft < 8;
      slider.querySelector('.rev-nav.next').disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8;
    }

    slider.querySelector('.rev-nav.prev').addEventListener('click', ()=> scrollTo(index() - 1));
    slider.querySelector('.rev-nav.next').addEventListener('click', ()=> scrollTo(index() + 1));
    track.addEventListener('scroll', ()=>{ clearTimeout(track._t); track._t = setTimeout(sync, 80); }, {passive:true});
    window.addEventListener('resize', sync);
    sync();
  })();

  // Plan buttons -> preselect package + scroll
  document.querySelectorAll('[data-plan]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const sel = document.getElementById('paket');
      const val = b.getAttribute('data-plan');
      [...sel.options].forEach(o=>{ if(o.value===val) sel.value=val; });
    });
  });

  // ---- Slanje porudžbine ----
  // TODO: postavi ORDER_ENDPOINT pre live-a.
  // Preporuka: Cloudflare Worker URL (worker/) — dodaje CORS, šalje Meta CAPI event
  // i prosleđuje porudžbinu Apps Script-u (Sheet + Telegram).
  const ORDER_ENDPOINT = ''; // npr. 'https://pella-capi.<tvoj>.workers.dev'

  (function(){
    const form = document.getElementById('pella-form');
    if(!form) return;
    const okBox = document.getElementById('form-ok');
    const errBox = document.getElementById('form-err');
    const demoBox = document.getElementById('form-demo');
    const btn = form.querySelector('button[type="submit"]');
    const btnText = btn.textContent;
    let sending = false;

    const cookie = n => (document.cookie.match('(^|; )'+n+'=([^;]*)') || [])[2];
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
      : 'ev-' + Date.now() + '-' + Math.random().toString(16).slice(2));

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      if(sending) return;

      const data = Object.fromEntries(new FormData(this).entries());
      // honeypot: pravi korisnik ovo polje ne vidi
      if(data.website){ okBox.classList.add('show'); form.style.display = 'none'; return; }
      delete data.website;

      // iznos iz izabranog paketa (Meta value + red u Sheet-u)
      const iznos = parseInt(((data.paket.match(/([\d.]+)\s*rsd/i) || [])[1] || '').replace(/\./g, '')) || 0;
      const eventId = uuid();

      if(!ORDER_ENDPOINT){
        console.warn('ORDER_ENDPOINT nije postavljen u script.js — porudžbina NIJE poslata.', data);
        demoBox.hidden = false;
        demoBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      sending = true;
      btn.disabled = true;
      btn.textContent = 'Šaljem…';
      errBox.hidden = true;

      const ctrl = new AbortController();
      const timer = setTimeout(()=> ctrl.abort(), 15000);

      try {
        const res = await fetch(ORDER_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            // COD: submit je Lead. Pravi Purchase ide server-side kad kurir potvrdi isporuku
            // (vidi backend/apps-script/Code.gs).
            event_name: 'Lead',
            event_id: eventId,
            value: iznos,
            currency: 'RSD',
            source_url: location.href,
            fbp: cookie('_fbp'),
            fbc: cookie('_fbc')
          }),
          signal: ctrl.signal
        });
        if(!res.ok) throw new Error('HTTP ' + res.status);
        const body = await res.json().catch(()=> ({}));
        if(body.ok === false) throw new Error(body.error || 'endpoint odbio porudžbinu');

        // Pixel Lead sa istim event_id -> deduplikacija sa CAPI eventom
        if(window.fbq) fbq('track', 'Lead', { value: iznos, currency: 'RSD' }, { eventID: eventId });

        form.style.display = 'none';
        okBox.classList.add('show');
        okBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch(err){
        console.error('Slanje porudžbine nije uspelo:', err);
        errBox.hidden = false;
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        clearTimeout(timer);
        sending = false;
        btn.disabled = false;
        btn.textContent = btnText;
      }
    });
  })();
