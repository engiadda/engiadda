(() => {
  const api = String(window.ENGIADDA_CMS_API_BASE || "").replace(/\/$/, "");
  const grid = document.getElementById("public-content");
  const filter = document.getElementById("public-category");
  const status = document.getElementById("public-status");
  const articleTitle = document.getElementById("article-title");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  if (!api) {
    if (grid) grid.textContent = "The EngiAdda knowledge library is being connected.";
    return;
  }
  async function loadList() {
    if (!grid) return;
    grid.textContent = "Loading EngiAdda content…";
    try {
      const category = filter?.value || "";
      const response = await fetch(api + "/api/content" + (category ? "?category=" + encodeURIComponent(category) : ""));
      if (!response.ok) throw new Error("Unable to load content right now.");
      const data = await response.json();
      grid.replaceChildren();
      if (!data.items?.length) { grid.textContent = "No published resources in this category yet."; return; }
      for (const item of data.items) {
        const card = document.createElement("article"); card.className = "cms-public-card";
        const label = document.createElement("span"); label.className = "eyebrow"; label.textContent = item.category + (item.subject ? " / " + item.subject : "");
        const title = document.createElement("h3"); title.textContent = item.title;
        const excerpt = document.createElement("p"); excerpt.textContent = item.excerpt || "";
        const meta = document.createElement("p"); meta.className = "cms-help"; meta.textContent = [item.exam, item.content_type === "resource" ? "Study resource" : item.content_type === "recruitment" ? "Recruitment update" : "Technical article"].filter(Boolean).join(" · ");
        const link = document.createElement("a"); link.className = "text-link";
        if (item.content_type === "resource" && item.file_url) { link.href = item.file_url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open resource →"; }
        else { link.href = "article.html?slug=" + encodeURIComponent(item.slug); link.textContent = "Read article →"; }
        card.append(label, title, excerpt, meta, link); grid.append(card);
      }
      if (status) status.textContent = data.items.length + " published item(s)";
    } catch (error) { grid.textContent = error.message; }
  }
  filter?.addEventListener("change", loadList);
  if (grid) loadList();

  if (articleTitle) {
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug) { articleTitle.textContent = "Article not found"; return; }
    fetch(api + "/api/content/" + encodeURIComponent(slug)).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.item) throw new Error(data.error || "Article not found");
      const item = data.item;
      document.title = (item.title || "Article") + " | EngiAdda";
      articleTitle.textContent = item.title;
      document.getElementById("article-meta").textContent = [item.category, item.subject, item.exam].filter(Boolean).join(" / ");
      document.getElementById("article-excerpt").textContent = item.excerpt || "";
      if (item.content_type === "recruitment") {
        const labels = { notification:"Official notification", apply:"Apply online", admitCard:"Admit card", result:"Result", officialWebsite:"Official recruitment website" };
        const container = document.getElementById("recruitment-links");
        for (const [key, label] of Object.entries(labels)) {
          const url = item.recruitment_links?.[key];
          if (!url) continue;
          const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "btn small"; link.textContent = label;
          container.append(link);
        }
        container.hidden = !container.childElementCount;
      }
      if (item.content_type === "article" || item.content_type === "recruitment") {
        if (window.marked && window.DOMPurify) {
          document.getElementById("article-body").innerHTML = DOMPurify.sanitize(marked.parse(item.body_markdown || ""));
        } else {
          document.getElementById("article-body").textContent = item.body_markdown || "";
        }
      } else if (item.file_url) {
        const link = document.createElement("a"); link.href = item.file_url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "btn"; link.textContent = "Open / download resource";
        document.getElementById("resource-download").append(link);
      }
    }).catch(error => { articleTitle.textContent = error.message; });
  }
})();