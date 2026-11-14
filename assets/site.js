// Shared script for every page: footer year, mobile menu, nav indicator, contact form
document.getElementById('yr').textContent=new Date().getFullYear();
(()=>{
const btn=document.querySelector('.menu-btn'),links=document.getElementById('links');if(!links)return;
const ind=links.querySelector('.ind');
btn.addEventListener('click',()=>{const o=links.classList.toggle('open');btn.setAttribute('aria-expanded',o)});
const navA=[...links.querySelectorAll('a')];let current=null;
function move(a){if(!a){ind.style.opacity=0;return}const li=a.parentElement;ind.style.left=li.offsetLeft+'px';ind.style.width=li.offsetWidth+'px';ind.style.opacity=1}
function setActive(a){current=a;navA.forEach(x=>x.classList.toggle('active',x===a));move(a)}
navA.forEach(a=>{a.addEventListener('mouseenter',()=>{navA.forEach(x=>x.classList.toggle('hover',x===a));move(a)});a.addEventListener('click',()=>{links.classList.remove('open');if(a.getAttribute('href').startsWith('#'))setActive(a)})});
links.addEventListener('mouseleave',()=>{navA.forEach(x=>x.classList.remove('hover'));move(current)});
window.addEventListener('resize',()=>move(current));
const page=document.body.dataset.page;
if(page){setActive(navA.find(x=>x.dataset.sec===page)||null);return}
// home page: highlight the section in view
const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;if(e.target.id==='top'){setActive(null);return}setActive(navA.find(x=>x.dataset.sec===e.target.id)||null)}),{rootMargin:'-45% 0px -50% 0px'});
['top','services','process','apps','about'].forEach(id=>{const el=document.getElementById(id);if(el)io.observe(el)});
})();
// contact form: opens from any [data-contact] link, posts to our Azure Function
(()=>{
const API='https://func-threefivesix-contact.azurewebsites.net/api/contact';
const dlg=document.getElementById('cf');if(!dlg)return;
const form=document.getElementById('cf-form'),err=dlg.querySelector('.err'),send=form.querySelector('button[type=submit]');
let opened=0,from=null;
const mailbox=t=>t==='support'?'support@threefivesixtech.com':'sales@threefivesixtech.com';
function open(topic,trigger){if(!dlg.showModal)return false;from=trigger;dlg.classList.remove('sent');err.style.display='none';if(topic)form.topic.value=topic;opened=Date.now();dlg.showModal();document.body.classList.add('modal-open');setTimeout(()=>form.email.focus(),30);return true}
dlg.addEventListener('close',()=>{document.body.classList.remove('modal-open');if(dlg.classList.contains('sent'))form.reset();if(from)from.focus()});
dlg.addEventListener('click',e=>{if(e.target===dlg||e.target.closest('[data-close]'))dlg.close()});
document.querySelectorAll('[data-contact]').forEach(a=>a.addEventListener('click',e=>{if(open(a.dataset.contact,a))e.preventDefault()}));
form.addEventListener('submit',async e=>{
  e.preventDefault();err.style.display='none';
  if(!form.email.checkValidity()){err.textContent='Please enter a valid email address so we can reply.';err.style.display='block';form.email.focus();return}
  const body=Object.fromEntries(new FormData(form));body.elapsed=Date.now()-opened;
  send.disabled=true;send.textContent='Sending…';
  try{
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.error||'');
    dlg.querySelector('.to').textContent=body.email;dlg.classList.add('sent');
  }catch(x){
    const m=mailbox(body.topic);
    err.innerHTML=(x.message&&x.message.startsWith('Please')?x.message:'Sorry, that didn’t go through.')+' You can also email <a href="mailto:'+m+'">'+m+'</a>.';
    err.style.display='block';
  }finally{send.disabled=false;send.textContent='Send message'}
});
})();
