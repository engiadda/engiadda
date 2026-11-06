(() => {
  "use strict";
  const api=String(window.ENGIADDA_CMS_API_BASE||"").replace(/\/$/,"");
  const grid=document.getElementById("public-content"),filter=document.getElementById("public-category"),status=document.getElementById("public-status"),articleTitle=document.getElementById("article-title");
  const labels={article:"Technical article",recruitment:"Recruitment / vacancy",exam_update:"Exam update",result:"Exam result",syllabus:"Syllabus / exam pattern",resource:"Study resource",tutorial:"Tutorial",career_guidance:"Career guidance"};
  const esc=value=>String(value??"");
  const displayValue=value=>{
    if(value===undefined||value===null||value==="")return "";
    if(Array.isArray(value))return value.map(displayValue).filter(Boolean).join(", ");
    if(typeof value==="object")return Object.entries(value).map(([key,val])=>val===undefined||val===null||val===""?null:key+": "+displayValue(val)).filter(Boolean).join(" · ");
    return String(value);
  };
  const dateLabel=value=>{if(!value)return"";const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:typeof value==="string"&&value.includes("T")?"short":undefined}).format(d);};
  function detailCard(title,value){const formatted=displayValue(value);if(!formatted)return null;const card=document.createElement("div");card.className="cms-detail-card";const label=document.createElement("b"),text=document.createElement("span");label.textContent=title;text.textContent=formatted;card.append(label,text);return card;}
  function setArticleNavigation(item){
    const back=document.getElementById("article-back-link"),section=document.getElementById("article-nav-link"),main=document.getElementById("article-main");
    const type=item.content_type||"article";
    const config={
      recruitment:{label:"Recruitment & Careers",href:"careers.html",nav:"Recruitment"},
      exam_update:{label:"Exam Updates",href:"content.html",nav:"Exam Updates"},
      result:{label:"Exam Results",href:"content.html",nav:"Exam Results"},
      syllabus:{label:"Syllabus & Exam Pattern",href:"content.html",nav:"Exam Resources"},
      resource:{label:"Study Resources",href:"content.html",nav:"Study Resources"},
      tutorial:{label:"Tutorials",href:"content.html",nav:"Tutorials"},
      career_guidance:{label:"Career Guidance",href:"content.html",nav:"Career Guidance"},
      article:{label:"Engineering Articles",href:"content.html",nav:"Engineering Articles"}
    }[type]||{label:"Engineering Articles",href:"content.html",nav:"Engineering Articles"};
    if(back){back.href=config.href;back.textContent="← "+config.label;}
    if(section){section.href=config.href;section.textContent=config.nav;}
    if(main)main.dataset.contentType=type;
  }
  function renderRecruitment(item,container){
    const m=item.metadata||{};
    const branchVacancies=m.branchVacancies??m.branch_vacancies??(m.vacancies&&typeof m.vacancies==="object"?m.vacancies:null);
    const vacancyTotal=m.total_vacancies??m.totalVacancies??(typeof m.vacancies==="number"?m.vacancies:null)??(branchVacancies?Object.values(branchVacancies).reduce((sum,value)=>sum+(Number(value)||0),0):null);
    const applicationStart=m.applicationStart??m.application_start;
    const applicationEnd=m.applicationEnd??m.application_end;
    const cards=[
      ["Organisation",m.organization],["Advertisement number",m.advertisementNumber??m.advertisement_number??m.advertisement],["Post",m.postName??m.post_name],["Total vacancies",vacancyTotal],
      ["Application starts",dateLabel(applicationStart)],["Last date to apply",dateLabel(applicationEnd)],["Qualification",m.qualification],
      ["Age limit",m.ageLimit??m.age_limit],["Age relaxation",m.ageRelaxation??m.age_relaxation],["Salary / pay scale",m.salary],
      ["Application fee",m.applicationFee??m.application_fee],["Selection process",m.selectionProcess??m.selection_process],["Job location",m.jobLocation??m.job_location],
      ["GATE / qualifying exam",m.qualifyingExam??m.qualifying_exam],["Branch-wise vacancies",branchVacancies]
    ];
    const now=Date.now(),start=applicationStart?new Date(applicationStart).getTime():null,end=applicationEnd?new Date(applicationEnd).getTime():null;
    const applicationState=start!==null&&now<start?"Upcoming":end!==null&&now>end?"Closed":start!==null||end!==null?"Open":null;
    if(applicationState)cards.unshift(["Application status",applicationState]);
    const summary=document.createElement("div");summary.className="cms-recruitment-summary";
    for(const [label,value] of cards){const card=detailCard(label,value);if(card)summary.append(card);}
    if(summary.childElementCount)container.append(summary);
  }
  function renderExam(item,container){
    const m=item.metadata||{},summary=document.createElement("div");summary.className="cms-recruitment-summary";
    for(const [label,value] of [["Exam / event date",dateLabel(m.eventDate)],["Exam year",m.examYear],["Authority",m.authority],["Reference number",m.referenceNumber]]){const card=detailCard(label,value);if(card)summary.append(card);}
    if(summary.childElementCount)container.append(summary);
    for(const [label,url] of [["Official source",m.sourceUrl],["Official action / result",m.actionUrl]])if(url){try{const u=new URL(url);if(["http:","https:"].includes(u.protocol)){const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.className="btn small secondary";a.textContent=label;container.append(a);}}catch{}}
  }
  function renderLinks(item,container){
    const links=item.recruitment_links||{},linkLabels={apply:"Apply online",notification:"Official notification",admitCard:"Admit card",result:"Result",officialWebsite:"Official website"};
    const heading=document.createElement("p");heading.className="cms-action-heading";heading.textContent="Official links";let count=0;
    for(const [key,label] of Object.entries(linkLabels)){const url=links[key];if(!url)continue;try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))continue;const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.className="btn small "+(key==="apply"?"cms-action-primary":"cms-action-secondary");a.textContent=label;container.append(a);count++;}catch{}}
    if(count){container.prepend(heading);container.hidden=false;}else container.hidden=true;
  }
  function renderAttachments(item){
    const container=document.getElementById("content-attachments");if(!container)return;
    const files=Array.isArray(item.attachments)?item.attachments.slice():[];
    if(item.file_url&&!files.some(x=>x.fileName===item.file_name))files.unshift({fileName:item.file_name||"Download resource",url:item.file_url});
    let count=0;
    for(const file of files){if(!file.url)continue;try{const u=new URL(file.url);if(!["http:","https:"].includes(u.protocol))continue;const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent=(file.label||file.fileName||"Download attachment")+" · Open / download";container.append(a);count++;}catch{}}
    if(count){const heading=document.createElement("h2");heading.textContent="Official documents & attachments";container.prepend(heading);container.hidden=false;}else container.hidden=true;
  }
  async function loadList(){
    if(!grid)return;grid.textContent="Loading EngiAdda content…";
    try{
      const category=filter?.value||"",response=await fetch(api+"/api/content"+(category?"?category="+encodeURIComponent(category):""));
      if(!response.ok)throw new Error("Unable to load content right now.");
      const data=await response.json();grid.replaceChildren();
      if(!data.items?.length){grid.textContent="No published content in this category yet.";return;}
      for(const item of data.items){
        const card=document.createElement("article");card.className="cms-public-card";
        const label=document.createElement("span");label.className="eyebrow";label.textContent=item.category+(item.disciplines?.length?" / "+item.disciplines.join(", "):"");
        const title=document.createElement("h3");title.textContent=item.title;
        const excerpt=document.createElement("p");excerpt.textContent=item.excerpt||"";
        const meta=document.createElement("p");meta.className="cms-help";meta.textContent=[item.exam,labels[item.content_type]||"Article",item.author].filter(Boolean).join(" · ");
        const link=document.createElement("a");link.className="text-link";link.href="article.html?slug="+encodeURIComponent(item.slug);link.textContent=item.content_type==="resource"&&item.file_url?"View resource details →":"Read more →";
        card.append(label,title,excerpt,meta,link);grid.append(card);
      }
      if(status)status.textContent=data.items.length+" published item(s)";
    }catch(error){grid.textContent=error.message;}
  }
  filter?.addEventListener("change",loadList);if(grid&&api)loadList();else if(grid)grid.textContent="The EngiAdda content service is not configured.";
  if(articleTitle){
    const slug=new URLSearchParams(location.search).get("slug");
    if(!slug||!api){articleTitle.textContent="Article not found";return;}
    fetch(api+"/api/content/"+encodeURIComponent(slug)).then(async response=>{const data=await response.json();if(!response.ok||!data.item)throw new Error(data.error||"Article not found");const item=data.item;
      document.title=(item.seo_title||item.title||"Article")+" | EngiAdda";articleTitle.textContent=item.title;setArticleNavigation(item);
      document.getElementById("article-meta").textContent=[item.category,...(item.disciplines||[]),item.exam,labels[item.content_type],item.author].filter(Boolean).join(" / ");
      document.getElementById("article-excerpt").textContent=item.excerpt||"";
      if(item.featured_image_url){try{const u=new URL(item.featured_image_url);if(["http:","https:"].includes(u.protocol)){const img=document.createElement("img");img.className="cms-featured-image";img.src=u.href;img.alt=item.title;document.getElementById("article-excerpt").after(img);}}catch{}}
      const linkBox=document.getElementById("recruitment-links");renderLinks(item,linkBox);
      const details=document.getElementById("content-details");
      if(item.content_type==="recruitment")renderRecruitment(item,details);
      if(["exam_update","result","syllabus"].includes(item.content_type))renderExam(item,details);
      renderAttachments(item);
      if(item.content_type==="resource"&&item.file_url){const a=document.createElement("a");a.href=item.file_url;a.target="_blank";a.rel="noopener noreferrer";a.className="btn";a.textContent="Open / download resource";document.getElementById("resource-download").append(a);}
      if(item.content_type!=="resource"){const body=document.getElementById("article-body");if(window.marked&&window.DOMPurify)body.innerHTML=DOMPurify.sanitize(marked.parse(item.body_markdown||""));else body.textContent=item.body_markdown||"";}
    }).catch(error=>{articleTitle.textContent=error.message;});
  }
})();