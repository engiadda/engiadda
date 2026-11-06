(() => {
  "use strict";
  const api = String(window.ENGIADDA_CMS_API_BASE || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  const tokenKey = "engiadda_cms_session";
  let token = sessionStorage.getItem(tokenKey) || "";
  let currentAttachments = [];
  const headers = () => ({ "Content-Type":"application/json", Authorization:"Bearer " + token });
  const message = (id,value,error=false) => { $(id).textContent=value||""; $(id).classList.toggle("error",error); };
  async function request(path, options={}) {
    if (!api) throw new Error("CMS API is not configured.");
    const response = await fetch(api+path,options);
    const data = await response.json().catch(()=>({}));
    if (!response.ok) { if(response.status===401) signOut(false); throw new Error(data.error||"Request failed."); }
    return data;
  }
  function showWorkspace(){ $("login-panel").hidden=true; $("workspace").hidden=false; $("logout-btn").hidden=false; }
  function signOut(show=true){ token="";sessionStorage.removeItem(tokenKey);$("workspace").hidden=true;$("login-panel").hidden=false;$("logout-btn").hidden=true;if(show)message("login-message","You have signed out."); }
  async function checkSession(){if(!token)return;try{await request("/api/admin/session",{headers:headers()});showWorkspace();await loadItems();}catch{signOut(false);}}
  $("login-form").addEventListener("submit",async e=>{e.preventDefault();message("login-message","Signing in…");try{const data=await request("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("admin-password").value})});token=data.token;sessionStorage.setItem(tokenKey,token);$("admin-password").value="";showWorkspace();await loadItems();message("login-message","");}catch(error){message("login-message",error.message,true);}});
  $("logout-btn").addEventListener("click",()=>signOut());
  $("new-btn").addEventListener("click",resetForm);
  $("status-filter").addEventListener("change",loadItems);
  $("content-search").addEventListener("input",filterItems);
  $("content-type").addEventListener("change",toggleType);
  $("content-title").addEventListener("input",()=>{if(!$("content-id").value&&!$("content-slug").dataset.edited)$("content-slug").value=slugify($("content-title").value);});
  $("content-slug").addEventListener("input",()=>$("content-slug").dataset.edited="1");
  function slugify(value){return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,240);}
  function toggleType(){
    const type=$("content-type").value;
    $("recruitment-fields").hidden=type!=="recruitment";
    $("exam-fields").hidden=!["exam_update","result","syllabus"].includes(type);
    $("resource-file").required=type==="resource"&&!currentAttachments.length;
  }
  function resetForm(){
    $("content-form").reset();$("content-id").value="";$("content-slug").dataset.edited="";
    currentAttachments=[];renderAttachments();$("editor-heading").textContent="Create new content";
    $("preview-panel").hidden=true;message("editor-message","");message("upload-status","");toggleType();
  }
  function filterItems(){
    const q=$("content-search").value.trim().toLowerCase();
    document.querySelectorAll(".cms-item").forEach(card=>{card.hidden=!card.dataset.search.includes(q);});
  }
  async function loadItems(){
    $("content-list").textContent="Loading content…";
    try{
      const data=await request("/api/admin/content"+($("status-filter").value?"?status="+encodeURIComponent($("status-filter").value):""),{headers:headers()});
      if(!data.items.length){$("content-list").textContent="No content found. Create your first item.";return;}
      const list=$("content-list");list.replaceChildren();
      for(const item of data.items){
        const card=document.createElement("article");card.className="cms-item";card.dataset.search=(item.title+" "+item.category+" "+(item.content_type||"")).toLowerCase();
        const details=document.createElement("div"),title=document.createElement("b"),meta=document.createElement("span");
        title.textContent=item.title;meta.textContent=[item.category,item.content_type,item.scheduled_at && item.status==="published" ? "Scheduled · "+new Date(item.scheduled_at).toLocaleString("en-IN") : item.status].filter(Boolean).join(" · ");details.append(title,meta);
        const actions=document.createElement("div");actions.className="cms-item-actions";
        const edit=document.createElement("button");edit.type="button";edit.className="btn small secondary";edit.textContent="Edit";edit.addEventListener("click",()=>editItem(item));
        const toggle=document.createElement("button");toggle.type="button";toggle.className="btn small secondary";toggle.textContent=item.status==="published"?"Unpublish":"Archive";
        toggle.addEventListener("click",async()=>{const next=item.status==="published"?"draft":"archived";if(!confirm(next==="draft"?"Unpublish this item?":"Archive this item?"))return;try{await request("/api/admin/content/"+encodeURIComponent(item.id)+"/status",{method:"PATCH",headers:headers(),body:JSON.stringify({status:next})});await loadItems();}catch(e){message("editor-message",e.message,true);}});
        const del=document.createElement("button");del.type="button";del.className="btn small secondary";del.textContent="Delete";
        del.addEventListener("click",async()=>{if(!confirm('Permanently delete "'+item.title+'"?'))return;del.disabled=true;try{await request("/api/admin/content/"+encodeURIComponent(item.id),{method:"DELETE",headers:headers()});if($("content-id").value===item.id)resetForm();await loadItems();}catch(e){del.disabled=false;message("editor-message",e.message,true);}});
        actions.append(edit,toggle,del);card.append(details,actions);list.append(card);
      }
      filterItems();
    }catch(e){$("content-list").textContent=e.message;}
  }
  function setVal(id,value){$(id).value=value??"";}
  function toLocal(value){if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  async function editItem(item){
    try {
      const detail=await request("/api/admin/content/"+encodeURIComponent(item.id),{headers:headers()});
      item=detail.item;
    } catch(error) { message("editor-message","Unable to load content attachments: "+error.message,true); return; }
    $("content-id").value=item.id;setVal("content-type",item.content_type);setVal("content-title",item.title);setVal("content-slug",item.slug);$("content-slug").dataset.edited="1";
    setVal("content-excerpt",item.excerpt);setVal("content-category",item.category);setVal("content-author",item.author);setVal("content-subject",item.subject);setVal("content-exam",item.exam);setVal("content-tags",(item.tags||[]).join(", "));
    setVal("content-body",item.body_markdown);setVal("featured-image",item.featured_image_url);setVal("seo-title",item.seo_title);setVal("seo-description",item.seo_description);setVal("publish-schedule",toLocal(item.scheduled_at));
    const selected=new Set(item.disciplines||[]);document.querySelectorAll("#discipline-options input").forEach(x=>x.checked=selected.has(x.value));
    const m=item.metadata||{};
    const map={ "recruitment-organization":"organization","recruitment-ad-number":"advertisementNumber","recruitment-post":"postName","recruitment-vacancies":"vacancies","recruitment-start":"applicationStart","recruitment-end":"applicationEnd","recruitment-branch-vacancies":"branchVacancies","recruitment-qualification":"qualification","recruitment-age":"ageLimit","recruitment-relaxation":"ageRelaxation","recruitment-salary":"salary","recruitment-fee":"applicationFee","recruitment-selection":"selectionProcess","recruitment-location":"jobLocation","recruitment-gate":"qualifyingExam","exam-date":"eventDate","exam-year":"examYear","exam-authority":"authority","exam-reference":"referenceNumber","exam-source":"sourceUrl","exam-action":"actionUrl"};
    for(const [id,key] of Object.entries(map))setVal(id,id.endsWith("-start")||id.endsWith("-end")?toLocal(m[key]):m[key]);
    const links=item.recruitment_links||{};setVal("recruitment-notification",links.notification);setVal("recruitment-apply",links.apply);setVal("recruitment-admit-card",links.admitCard);setVal("recruitment-result",links.result);setVal("recruitment-website",links.officialWebsite);
    currentAttachments=Array.isArray(item.attachments)?item.attachments.map(x=>({...x})):[];if(item.file_key&&!currentAttachments.some(x=>x.fileKey===item.file_key))currentAttachments.unshift({fileKey:item.file_key,fileName:item.file_name||"Existing file",fileMime:item.file_mime||"application/pdf",fileSizeBytes:Number(item.file_size_bytes)||1,label:item.file_name||"Existing file"});
    renderAttachments();$("editor-heading").textContent="Edit content";toggleType();window.scrollTo({top:0,behavior:"smooth"});
  }
  function renderAttachments(){
    const box=$("attachment-list");box.replaceChildren();
    for(const file of currentAttachments){
      const row=document.createElement("div");row.className="cms-attachment";
      const name=document.createElement("span");name.textContent=file.label||file.fileName;
      row.append(name);
      if(typeof file.url==="string"&&file.url.startsWith("https://")){
        const download=document.createElement("a");download.className="btn small secondary";download.href=file.url;download.target="_blank";download.rel="noopener noreferrer";download.textContent="Download";row.append(download);
      }else{
        const pending=document.createElement("span");pending.className="cms-help";pending.textContent="Save draft to generate download link";row.append(pending);
      }
      const remove=document.createElement("button");remove.type="button";remove.className="btn small secondary";remove.textContent="Remove";remove.addEventListener("click",()=>{currentAttachments=currentAttachments.filter(x=>x!==file);renderAttachments();toggleType();});
      row.append(remove);box.append(row);
    }
    if(!currentAttachments.length)box.textContent="No attachments selected.";
  }
  async function uploadSelected(){
    const files=Array.from($("resource-file").files||[]);
    if(currentAttachments.length+files.length>12)throw new Error("A maximum of 12 attachments is allowed.");
    for(const file of files){
      if(file.size<1||file.size>50*1024*1024)throw new Error(file.name+" exceeds the 50 MB limit.");
      message("upload-status","Uploading "+file.name+"…");
      const signed=await request("/api/admin/uploads/presign",{method:"POST",headers:headers(),body:JSON.stringify({fileName:file.name,contentType:file.type,size:file.size})});
      const uploaded=await fetch(signed.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});
      if(!uploaded.ok)throw new Error("Upload failed for "+file.name+".");
      currentAttachments.push({fileKey:signed.fileKey,fileName:file.name,fileMime:file.type,fileSizeBytes:file.size,label:file.name});
    }
    $("resource-file").value="";renderAttachments();message("upload-status",files.length?"Files uploaded successfully.":"");
  }
  function metadataPayload(){
    const get=id=>$(id).value.trim();
    const meta={};
    const map={organization:"recruitment-organization",advertisementNumber:"recruitment-ad-number",postName:"recruitment-post",vacancies:"recruitment-vacancies",applicationStart:"recruitment-start",applicationEnd:"recruitment-end",branchVacancies:"recruitment-branch-vacancies",qualification:"recruitment-qualification",ageLimit:"recruitment-age",ageRelaxation:"recruitment-relaxation",salary:"recruitment-salary",applicationFee:"recruitment-fee",selectionProcess:"recruitment-selection",jobLocation:"recruitment-location",qualifyingExam:"recruitment-gate",eventDate:"exam-date",examYear:"exam-year",authority:"exam-authority",referenceNumber:"exam-reference",sourceUrl:"exam-source",actionUrl:"exam-action"};
    for(const [key,id] of Object.entries(map)){const value=get(id);if(value)meta[key]=id==="recruitment-vacancies"?Number(value):(["applicationStart","applicationEnd"].includes(key)?new Date(value).toISOString():value);}
    return meta;
  }
  async function save(status){
    message("editor-message","Saving…");
    try{
      await uploadSelected();
      const type=$("content-type").value;
      if(type==="resource"&&!currentAttachments.length)throw new Error("Upload at least one PDF or image for a resource.");
      const primary=currentAttachments[0]||null;
      const body={contentType:type,title:$("content-title").value,slug:$("content-slug").value,excerpt:$("content-excerpt").value,category:$("content-category").value,subject:$("content-subject").value,exam:$("content-exam").value,tags:$("content-tags").value.split(",").map(x=>x.trim()).filter(Boolean),disciplines:Array.from(document.querySelectorAll("#discipline-options input:checked")).map(x=>x.value),author:$("content-author").value,featuredImageUrl:$("featured-image").value,scheduledAt:$("publish-schedule").value?new Date($("publish-schedule").value).toISOString():null,metadata:metadataPayload(),attachments:currentAttachments.map(({fileKey,fileName,fileMime,fileSizeBytes,label})=>({fileKey,fileName,fileMime,fileSizeBytes,label})),bodyMarkdown:$("content-body").value,recruitmentLinks:{notification:$("recruitment-notification").value.trim(),apply:$("recruitment-apply").value.trim(),admitCard:$("recruitment-admit-card").value.trim(),result:$("recruitment-result").value.trim(),officialWebsite:$("recruitment-website").value.trim()},status,fileKey:type==="resource"?(primary?.fileKey||""):"",fileName:type==="resource"?(primary?.fileName||""):"",fileMime:type==="resource"?(primary?.fileMime||""):"",fileSizeBytes:type==="resource"?(primary?.fileSizeBytes||null):null,seoTitle:$("seo-title").value,seoDescription:$("seo-description").value};
      const id=$("content-id").value;
      const data=await request(id?"/api/admin/content/"+encodeURIComponent(id):"/api/admin/content",{method:id?"PATCH":"POST",headers:headers(),body:JSON.stringify(body)});
      $("content-id").value=data.item.id;
      currentAttachments=Array.isArray(data.item.attachments)?data.item.attachments.map(file=>({...file})):[];
      renderAttachments();
      $("editor-heading").textContent="Edit content";message("editor-message",status==="published"?"Content published successfully.":"Draft saved successfully. Download links are valid for one hour.");await loadItems();
    }catch(e){message("editor-message",e.message,true);}
  }
  $("content-form").addEventListener("submit",e=>{e.preventDefault();save($("content-status").value);});
  $("save-draft").addEventListener("click",()=>save("draft"));
  $("preview-btn").addEventListener("click",()=>{
    $("preview-panel").hidden=false;$("preview-title").textContent=$("content-title").value||"Untitled content";$("preview-excerpt").textContent=$("content-excerpt").value;
    const selected=Array.from(document.querySelectorAll("#discipline-options input:checked")).map(x=>x.value),meta=metadataPayload();
    const previewDetails=[$("content-category").value,...selected,meta.organization,meta.advertisementNumber,meta.vacancies?meta.vacancies+" vacancies":null,meta.applicationStart?"Starts "+new Date(meta.applicationStart).toLocaleString("en-IN"):null,meta.applicationEnd?"Closes "+new Date(meta.applicationEnd).toLocaleString("en-IN"):null].filter(Boolean);
    $("preview-meta").textContent=previewDetails.join(" · ");
    if(window.marked&&window.DOMPurify)$("preview-output").innerHTML=DOMPurify.sanitize(marked.parse($("content-body").value||""));else $("preview-output").textContent=$("content-body").value;
    $("preview-panel").scrollIntoView({behavior:"smooth",block:"nearest"});
  });
  document.querySelectorAll("[data-md]").forEach(button=>button.addEventListener("click",()=>{
    const area=$("content-body"),start=area.selectionStart,end=area.selectionEnd,selected=area.value.slice(start,end),before=area.value.slice(0,start),after=area.value.slice(end);
    const snippets={h2:"## "+(selected||"Heading"),bold:"**"+(selected||"bold text")+"**",list:"- "+(selected||"List item"),link:"["+(selected||"link text")+"](https://)",table:"| Column 1 | Column 2 |\n|---|---|\n| Value | Value |"};
    const insert=snippets[button.dataset.md];area.value=before+insert+after;area.focus();area.selectionStart=area.selectionEnd=start+insert.length;
  }));
  toggleType();checkSession();
})();