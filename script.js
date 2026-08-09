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

  /* Mobile polish: keep navigation clean and prevent accidental list numbering. */
  const mobileStyle=document.createElement('style');
  mobileStyle.textContent=`
    @media (max-width:600px){
      .nav nav.open{list-style:none!important;counter-reset:none!important;}
      .nav nav.open a{display:block!important;list-style:none!important;counter-increment:none!important;}
      .nav nav.open a::before,.nav nav.open a::after{content:none!important;}
      ol,ul{padding-left:0;}
      .notification-list,.notification-list a{list-style:none!important;}
      .notification-list a::before,.notification-list a::after{content:none!important;}
      .hero-panel{width:100%;}
      .hero-panel-head{flex-wrap:wrap;}
      .hero-panel-head span{font-size:10px;}
      .section-head p{max-width:100%;}
      .cards article,.feature,.career-box{overflow-wrap:anywhere;}
      .footer-grid{min-width:0;}
      .copyright{word-break:normal;overflow-wrap:anywhere;}
    }
  `;
  document.head.appendChild(mobileStyle);

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
