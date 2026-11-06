(() => {
  "use strict";
  const target=document.getElementById("home-latest-grid");
  const api=String(window.ENGIADDA_CMS_API_BASE||"").replace(/\/$/,"");
  if(!target)return;
  const labels={recruitment:"RECRUITMENT",article:"ENGINEERING ARTICLE",exam_update:"EXAM UPDATE",result:"EXAM RESULT",syllabus:"EXAM RESOURCE",resource:"STUDY RESOURCE",tutorial:"TUTORIAL",career_guidance:"CAREER GUIDANCE"};
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const showEmpty=(message)=>{target.replaceChildren(make("p","home-empty",message));};
  if(!api){showEmpty("The EngiAdda publishing service is temporarily unavailable.");return;}
  fetch(api+"/api/content",{headers:{Accept:"application/json"}})
    .then(async response=>{if(!response.ok)throw new Error("Content service unavailable");return response.json();})
    .then(data=>{
      const items=Array.isArray(data.items)?data.items:[];
      if(!items.length){showEmpty("New articles and recruitment updates will appear here as they are published.");return;}
      target.replaceChildren();
      items.slice(0,3).forEach(item=>{
        const card=make("article","home-story");
        const type=make("span","home-story-type",labels[item.content_type]||"ENGIADDA UPDATE");
        const title=make("h3","",item.title||"EngiAdda update");
        const excerpt=make("p","",item.excerpt||"Open this update to read the published details.");
        const link=make("a","home-story-link");
        link.href="article.html?slug="+encodeURIComponent(item.slug||"");
        link.append(make("span","","Read update"),make("b","","↗"));
        card.append(type,title,excerpt,link);target.append(card);
      });
    })
    .catch(()=>showEmpty("We couldn't load published updates just now. Please visit the knowledge library."));
})();