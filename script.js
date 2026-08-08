const menu=document.querySelector('.menu');
const nav=document.querySelector('.nav nav');
if(menu) menu.addEventListener('click',()=>{nav.style.display=nav.style.display==='flex'?'none':'flex';nav.style.position='absolute';nav.style.top='68px';nav.style.left='0';nav.style.right='0';nav.style.background='#f5f5f3';nav.style.padding='20px 4%';nav.style.flexDirection='column';nav.style.borderBottom='1px solid #dcdcd8'});
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{if(window.innerWidth<=800&&nav)nav.style.display='none'}));
const form=document.getElementById('notifyForm');
form.addEventListener('submit',e=>{e.preventDefault();document.getElementById('formMsg').textContent='Thanks! You’re on the launch list.';form.querySelector('button').textContent='Added ✓';});
