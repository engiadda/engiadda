document.addEventListener('DOMContentLoaded',()=>{
  const menu=document.querySelector('.menu');
  const nav=document.querySelector('.nav nav');
  if(menu&&nav){
    menu.addEventListener('click',()=>{
      const open=nav.classList.toggle('open');
      menu.setAttribute('aria-expanded',String(open));
      menu.textContent=open?'×':'☰';
    });
    nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
      nav.classList.remove('open');
      menu.setAttribute('aria-expanded','false');
      menu.textContent='☰';
    }));
    window.addEventListener('resize',()=>{
      if(window.innerWidth>1000){
        nav.classList.remove('open');
        menu.setAttribute('aria-expanded','false');
        menu.textContent='☰';
      }
    });
  }
  const form=document.getElementById('notifyForm');
  if(form){
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const msg=document.getElementById('formMsg');
      if(msg) msg.textContent='Thanks! You’re on the launch list.';
      const button=form.querySelector('button');
      if(button) button.textContent='Added ✓';
    });
  }
});
