// Shared behaviour: mobile menu, footer year, and the contact form.
(function () {
  var btn = document.querySelector('.menu-btn');
  var links = document.getElementById('navlinks');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        links.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Menu';
      }
    });
  }
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();

// Contact form: any [data-contact] link opens it; it posts to the contact Azure Function,
// which emails sales@ or support@ depending on the topic.
(function () {
  var API = 'https://func-threefivesix-contact.azurewebsites.net/api/contact';
  var dlg = document.getElementById('cf');
  if (!dlg || !dlg.showModal) return; // without <dialog> support the links fall back to #contact
  var form = document.getElementById('cf-form');
  var err = dlg.querySelector('.cf-err');
  var send = form.querySelector('button[type=submit]');
  var opened = 0, from = null;
  function mailbox(t) { return t === 'support' ? 'support@threefivesixtech.com' : 'sales@threefivesixtech.com'; }
  function open(link) {
    from = link;
    dlg.classList.remove('sent');
    err.style.display = 'none';
    if (link.dataset.contact) form.topic.value = link.dataset.contact;
    if (link.dataset.message && !form.message.value) form.message.value = link.dataset.message;
    opened = Date.now();
    dlg.showModal();
    document.body.classList.add('modal-open');
    setTimeout(function () { form.email.focus(); }, 30);
  }
  dlg.addEventListener('close', function () {
    document.body.classList.remove('modal-open');
    if (dlg.classList.contains('sent')) form.reset();
    if (from) from.focus();
  });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-contact]');
    if (!a) return;
    e.preventDefault();
    open(a);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.style.display = 'none';
    if (!form.email.checkValidity()) {
      err.textContent = 'Enter a valid email address so we can reply.';
      err.style.display = 'block';
      form.email.focus();
      return;
    }
    var body = Object.fromEntries(new FormData(form));
    body.elapsed = Date.now() - opened;
    send.disabled = true;
    send.textContent = 'Sending…';
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ''); }); })
      .then(function () {
        dlg.querySelector('.cf-to').textContent = body.email;
        dlg.classList.add('sent');
      })
      .catch(function (x) {
        var m = mailbox(body.topic);
        var msg = x.message && x.message.indexOf('Please') === 0 ? x.message : 'That didn’t go through.';
        err.innerHTML = msg + ' You can also email <a href="mailto:' + m + '">' + m + '</a>.';
        err.style.display = 'block';
      })
      .finally(function () { send.disabled = false; send.textContent = 'Send message'; });
  });
})();

// Polish: quiet scroll reveal, and the EDI field-to-source highlight.
(function () {
  var els = document.querySelectorAll('.rv');
  if (els.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('rvjs');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }
  // EDI example: point at a sales order field to light up its source in the 850
  document.querySelectorAll('.snip.edi tr[data-k]').forEach(function (tr) {
    var hits = tr.closest('.snip').querySelectorAll('.hit[data-k="' + tr.dataset.k + '"]');
    function on(v) { tr.classList.toggle('on', v); hits.forEach(function (h) { h.classList.toggle('on', v); }); }
    tr.addEventListener('mouseenter', function () { on(true); });
    tr.addEventListener('mouseleave', function () { on(false); });
  });
})();
