(() => {
  "use strict";
  const jobsApi = String(window.ENGIADDA_API_BASE || "").trim().replace(/\/$/, "");
  const cmsApi = String(window.ENGIADDA_CMS_API_BASE || "").trim().replace(/\/$/, "");
  const form = document.getElementById("job-filters");
  const list = document.getElementById("jobs-list");
  const status = document.getElementById("jobs-status");
  const loadMore = document.getElementById("jobs-load-more");
  if (!form || !list || !status || !loadMore) return;

  const state = { items: [], visible: 12, loading: false };
  const typeLabels = {
    job: "JOB OPENING", recruitment: "RECRUITMENT", result: "RESULT",
    admit_card: "ADMIT CARD", interview: "INTERVIEW / SELECTION", career: "CAREER UPDATE"
  };

  const node = (tag, value, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined && value !== null) el.textContent = String(value);
    return el;
  };
  const safeUrl = value => {
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
    catch { return ""; }
  };
  const formatDate = value => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
  };
  const dateOnly = value => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const categoryLabel = value => ({ government: "Government", psu: "PSU", private: "Private sector" }[String(value || "").toLowerCase()] || "Engineering");
  const inferSector = item => {
    const value = [item.category, item.metadata?.organization, item.company, item.title].filter(Boolean).join(" ").toLowerCase();
    if (/\bprivate\b|private sector/.test(value)) return "private";
    if (/\bpsu\b|public sector|powergrid|power grid|ntpc|nhpc|ongc|bhel|sail|gail|indian oil|iocl|bpcl|hpcl/.test(value)) return "psu";
    if (/\bgovernment\b|central govt|state govt|ssc|upsc|railway|rrb|isro|drdo/.test(value)) return "government";
    return "";
  };
  const inferType = item => {
    if (item.kind === "job") return "job";
    const type = String(item.content_type || "").toLowerCase();
    const title = [item.title, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase();
    if (type === "result" || /\b(result|merit list|score card)\b/.test(title)) return "result";
    if (/\b(admit card|hall ticket|call letter)\b/.test(title) || item.recruitment_links?.admitCard) return "admit_card";
    if (/\b(interview|shortlist|selection list|document verification)\b/.test(title)) return "interview";
    if (type === "recruitment") return "recruitment";
    if (["exam_update", "syllabus"].includes(type)) return "recruitment";
    return "career";
  };
  const classifyStatus = item => {
    if (item.kind === "job") return "open";
    const type = inferType(item);
    if (["result", "admit_card", "interview"].includes(type)) return "published";
    const endValue = item.metadata?.applicationEnd;
    const end = dateOnly(endValue);
    const start = dateOnly(item.metadata?.applicationStart);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expired = end && (String(endValue).includes("T") ? end < now : end < today);
    if (expired) return "closed";
    if (start && start > now) return "open";
    if (item.content_type === "recruitment") return "open";
    return "published";
  };
  const statusLabel = item => {
    if (item.kind === "job") return item.deadline ? "Applications open" : "Open · deadline not listed";
    const type = inferType(item);
    if (type === "result") return "Result published";
    if (type === "admit_card") return "Admit card released";
    if (type === "interview") return "Selection update";
    const state = classifyStatus(item);
    if (state === "closed") return "Deadline passed";
    if (item.metadata?.applicationStart && dateOnly(item.metadata.applicationStart) > new Date()) return "Applications upcoming";
    if (state === "open") return "Applications open";
    return "Published update";
  };
  const searchableText = item => [
    item.title, item.company, item.department, item.source, item.location, item.category,
    item.subject, item.exam, item.metadata?.organization, item.metadata?.postName,
    item.metadata?.authority, item.metadata?.qualification, item.metadata?.jobLocation,
    ...(Array.isArray(item.tags) ? item.tags : []),
    ...(Array.isArray(item.disciplines) ? item.disciplines : []),
    item.engineering_discipline
  ].filter(Boolean).join(" ").toLowerCase();

  function createCard(item) {
    const card = node("article", undefined, "job-card update-card");
    const top = node("div", undefined, "job-card-top");
    top.append(node("span", typeLabels[inferType(item)], "job-category"));
    top.append(node("span", statusLabel(item), "job-status-badge " + classifyStatus(item)));
    if (item.official === true) top.append(node("span", "Verified job feed", "job-verified"));
    card.append(top);
    card.append(node("h3", item.title || "EngiAdda update", "job-title"));
    card.append(node("p", item.company || item.metadata?.organization || item.department || item.metadata?.authority || item.source || item.category || "Recruiting organisation", "job-company"));

    const meta = node("div", undefined, "job-meta");
    const sector = item.category && ["government", "psu", "private"].includes(String(item.category).toLowerCase()) ? item.category : inferSector(item);
    if (sector) meta.append(node("span", categoryLabel(sector)));
    const disciplines = Array.isArray(item.disciplines) ? item.disciplines : [];
    if (disciplines.length) disciplines.slice(0, 3).forEach(value => meta.append(node("span", value)));
    else if (item.engineering_discipline) meta.append(node("span", item.engineering_discipline));
    if (item.metadata?.postName) meta.append(node("span", item.metadata.postName));
    if (item.metadata?.vacancies) meta.append(node("span", item.metadata.vacancies + " vacancies"));
    if (item.experience_level) meta.append(node("span", item.experience_level));
    if (item.location || item.metadata?.jobLocation) meta.append(node("span", item.location || item.metadata.jobLocation));
    if (meta.childNodes.length) card.append(meta);

    const excerpt = item.excerpt || item.qualification || item.metadata?.qualification || item.metadata?.selectionProcess;
    if (excerpt) card.append(node("p", excerpt, "job-qualification"));

    const dates = node("div", undefined, "job-dates");
    if (item.published_at) dates.append(node("span", "Published: " + formatDate(item.published_at)));
    if (item.metadata?.applicationStart) dates.append(node("span", "Starts: " + formatDate(item.metadata.applicationStart)));
    if (item.metadata?.applicationEnd || item.deadline) dates.append(node("span", "Last date: " + formatDate(item.metadata?.applicationEnd || item.deadline)));
    if (item.metadata?.eventDate) dates.append(node("span", "Event date: " + formatDate(item.metadata.eventDate)));
    if (!dates.childNodes.length) dates.append(node("span", "Date not specified in the published record"));
    card.append(dates);

    const footer = node("div", undefined, "job-card-footer");
    const sourceText = item.source ? "Source: " + item.source : (item.category && !sector ? item.category : "Check the official source");
    footer.append(node("span", sourceText, "job-source"));
    const links = item.recruitment_links || {};
    const linkCandidates = item.kind === "job"
      ? [{ label: "View opportunity", url: item.url }]
      : [
          { label: "Official notification", url: links.notification || item.metadata?.sourceUrl },
          { label: "Apply online", url: links.apply },
          { label: "Admit card", url: links.admitCard },
          { label: "Result", url: links.result || item.metadata?.actionUrl },
          { label: "Official website", url: links.officialWebsite }
        ];
    const linkGroup = node("div", undefined, "update-links");
    linkCandidates.forEach(candidate => {
      const url = safeUrl(candidate.url);
      if (!url) return;
      const anchor = node("a", candidate.label, "update-link");
      anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
      linkGroup.append(anchor);
    });
    if (item.kind !== "job" && item.slug) {
      const detail = node("a", "Read full update", "update-link update-detail-link");
      detail.href = "article.html?slug=" + encodeURIComponent(item.slug);
      linkGroup.append(detail);
    }
    if (linkGroup.childNodes.length) footer.append(linkGroup);
    card.append(footer);
    return card;
  }

  function currentItems() {
    const query = form.elements.search.value.trim().toLowerCase();
    const type = form.elements.type.value;
    const sector = form.elements.category.value;
    const discipline = form.elements.discipline.value.toLowerCase();
    const statusFilter = form.elements.status.value;
    return state.items.filter(item => {
      if (query && !searchableText(item).includes(query)) return false;
      if (type && inferType(item) !== type) return false;
      if (sector && inferSector(item) !== sector) return false;
      if (discipline) {
        const values = [item.engineering_discipline, item.subject, ...(Array.isArray(item.disciplines) ? item.disciplines : [])].filter(Boolean).join(" ").toLowerCase();
        if (!values.includes(discipline)) return false;
      }
      if (statusFilter && classifyStatus(item) !== statusFilter) return false;
      return true;
    }).sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));
  }

  function render(reset = false) {
    const filtered = currentItems();
    if (reset) state.visible = 12;
    const visible = filtered.slice(0, state.visible);
    list.replaceChildren(...visible.map(createCard));
    status.textContent = filtered.length
      ? "Showing " + visible.length + " of " + filtered.length + " matching career updates and opportunities."
      : state.items.length ? "No matching updates found. Try changing your search or filters." : "No career updates are currently available. New verified jobs and published recruitment updates will appear here.";
    loadMore.hidden = filtered.length <= state.visible;
    loadMore.disabled = false;
  }

  async function loadFeed() {
    if (state.loading) return;
    state.loading = true;
    status.textContent = "Loading jobs and published career updates…";
    loadMore.disabled = true;
    const requests = [];
    if (jobsApi) requests.push(fetch(jobsApi + "/api/jobs?limit=50&offset=0", { headers: { Accept: "application/json" } }).then(r => { if (!r.ok) throw new Error("Job feed unavailable"); return r.json(); }));
    else requests.push(Promise.reject(new Error("Job API not configured")));
    if (cmsApi) requests.push(fetch(cmsApi + "/api/content", { headers: { Accept: "application/json" } }).then(r => { if (!r.ok) throw new Error("Publishing feed unavailable"); return r.json(); }));
    else requests.push(Promise.reject(new Error("CMS API not configured")));
    const [jobsResult, cmsResult] = await Promise.allSettled(requests);
    const items = [];
    if (jobsResult.status === "fulfilled" && Array.isArray(jobsResult.value.jobs)) {
      jobsResult.value.jobs.forEach(job => items.push({ ...job, kind: "job" }));
    }
    if (cmsResult.status === "fulfilled" && Array.isArray(cmsResult.value.items)) {
      cmsResult.value.items.filter(item => ["recruitment", "exam_update", "result", "syllabus", "career_guidance"].includes(item.content_type))
        .forEach(item => items.push({ ...item, kind: "cms" }));
    }
    const seen = new Set();
    state.items = items.filter(item => {
      const key = [String(item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, ""), String(item.company || item.metadata?.organization || "").toLowerCase().replace(/[^a-z0-9]+/g, "")].join("|");
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    state.loading = false;
    loadMore.disabled = false;
    if (!state.items.length && (jobsResult.status === "rejected" || cmsResult.status === "rejected")) {
      status.textContent = "We couldn't connect to the career update services. Please try again shortly.";
      return;
    }
    render(true);
  }

  form.addEventListener("submit", event => { event.preventDefault(); render(true); });
  form.addEventListener("input", event => { if (event.target.matches('input[type="search"]')) render(true); });
  loadMore.addEventListener("click", () => { state.visible += 12; render(false); });
  loadFeed();
})();
