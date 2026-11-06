(() => {
  "use strict";
  const api=String(window.ENGIADDA_CMS_API_BASE||"").replace(/\/$/,"");
  const grid=document.getElementById("public-content"),filter=document.getElementById("public-category"),status=document.getElementById("public-status"),articleTitle=document.getElementById("article-title");
  const labels={article:"Technical article",recruitment:"Recruitment / vacancy",exam_update:"Exam update",result:"Exam result",syllabus:"Syllabus / exam pattern",resource:"Study resource",tutorial:"Tutorial",career_guidance:"Career guidance"};
  const esc=value=>String(value??"");
  const dateLabel=value=>{if(!value)return"";const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:value.includes("T")?"short":undefined}).format(d);};
  function detailCard(title,value){if(value===undefined||value===null||value==="")return null;const card=document.createElement("div");card.className="cms-detail-card";const label=document.createElement("b"),text=document.createElement("span");label.textContent=title;text.textContent=Array.isArray(value)?value.join(", "):String(value);card.append(label,text);return card;}
  function renderRecruitment(item,container){
    const m=item.metadata||{},cards=[
      ["Organisation",m.organization],["Advertisement number",m.advertisementNumber],["Post",m.postName],["Total vacancies",m.vacancies],
      ["Application starts",dateLabel(m.applicationStart)],["Last date to apply",dateLabel(m.applicationEnd)],["Qualification",m.qualification],
      ["Age limit",m.ageLimit],["Age relaxation",m.ageRelaxation],["Salary / pay scale",m.salary],["Application fee",m.applicationFee],
      ["Selection process",m.selectionProcess],["Job location",m.jobLocation],["GATE / qualifying exam",m.qualifyingExam],["Branch-wise vacancies",m.branchVacancies]
    ];
    const grid=document.createElement("div");grid.className="cms-recruitment-summary";
    for(const [label,value] of cards){const card=detailCard(label,value);if(card)grid.append(card);}
    if(grid.childElementCount)container.append(grid);
  }
  function renderExam(item,container){
    const m=item.metadata||{},grid=document.createElement("div");grid.className="cms-recruitment-summary";
    for(const [label,value] of [["Exam / event date",dateLabel(m.eventDate)],["Exam year",m.examYear],["Authority",m.authority],["Reference number",m.referenceNumber]]){const card=detailCard(label,value);if(card)grid.append(card);}
    if(grid.childElementCount)container.append(grid);
    for(const [label,url] of [["Official source",m.sourceUrl],["Official action / result",m.actionUrl]])if(url){try{const u=new URL(url);if(["http:","https:"].includes(u.protocol)){const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.className="btn small secondary";a.textContent=label;container.append(a);}}catch{}}
  }
  function renderLinks(item,container){
    const links=item.recruitment_links||{},labels={notification:"Official notification",apply:"Apply online",admitCard:"Admit card",result:"Result",officialWebsite:"Official website"};
    for(const [key,label] of Object.entries(labels)){const url=links[key];if(!url)continue;try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))continue;const a=document.createElement("a");a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";a.className="btn small";a.textContent=label;container.append(a);}catch{}}
    container.hidden=!container.childElementCount;
  }
  function renderAttachments(item){
    const container=document.getElementById("content-attachments");if(!container)return;
    const files=Array.isArray(item.attachments)?item.attachments:[];
    if(item.file_url&&!files.some(x=>x.fileKey===item.file_key))files.unshift({fileName:item.file_name||"Download resource",url:item.file_url});
    for(const file of files){if(!file.url)continue;const a=document.createElement("a");a.href=file.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=(file.label||file.fileName||"Download attachment")+" · Open / download";container.append(a);}
    container.hidden=!container.childElementCount;
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
    fetch(api+"/api/content/"+encodeURIComponent(slug)).then(async response=>{const data=await response.json();if(!response.ok||!data.item)throw new Error(data.error||"Article not found");const item=data.item,m=item.metadata||{};
      document.title=(item.seo_title||item.title||"Article")+" | EngiAdda";articleTitle.textContent=item.title;
      document.getElementById("article-meta").textContent=[item.category,...(item.disciplines||[]),item.exam,labels[item.content_type],item.author].filter(Boolean).join(" / ");
      document.getElementById("article-excerpt").textContent=item.excerpt||"";
      if(item.featured_image_url){try{const u=new URL(item.featured_image_url);if(["http:","https:"].includes(u.protocol)){const img=document.createElement("img");img.className="cms-featured-image";img.src=u.href;img.alt=item.title;document.getElementById("article-excerpt").after(img);}}catch{}}
      const details=document.getElementById("content-details");
      if(item.content_type==="recruitment")renderRecruitment(item,details);
      if(["exam_update","result","syllabus"].includes(item.content_type))renderExam(item,details);
      const linkBox=document.getElementById("recruitment-links");renderLinks(item,linkBox);
      renderAttachments(item);
      if(item.content_type==="resource"&&item.file_url){const a=document.createElement("a");a.href=item.file_url;a.target="_blank";a.rel="noopener noreferrer";a.className="btn";a.textContent="Open / download resource";document.getElementById("resource-download").append(a);}
      if(item.content_type!=="resource"){const body=document.getElementById("article-body");if(window.marked&&window.DOMPurify)body.innerHTML=DOMPurify.sanitize(marked.parse(item.body_markdown||""));else body.textContent=item.body_markdown||"";}
    }).catch(error=>{articleTitle.textContent=error.message;});
  }
})();