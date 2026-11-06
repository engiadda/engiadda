(() => {
  "use strict";
  const target = document.getElementById("home-latest-grid");
  const cmsApi = String(window.ENGIADDA_CMS_API_BASE || "").trim().replace(/\/$/, "");
  const jobsApi = String(window.ENGIADDA_API_BASE || "").trim().replace(/\/$/, "");
  if (!target) return;

  const make = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
  };
  const formatDate = value => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", year: "numeric"
    }).format(date);
  };
  const safeDate = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  };
  const labelFor = item => {
    if (item.kind === "job") return "VERIFIED JOB OPENING";
    const type = String(item.content_type || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    if (type === "recruitment") return "RECRUITMENT NOTICE";
    if (type === "exam_update") return "EXAM UPDATE";
    if (type === "result" || /\b(result|merit list|score card)\b/.test(title)) return "RESULT UPDATE";
    if (/\b(admit card|hall ticket)\b/.test(title)) return "ADMIT CARD";
    if (/\b(interview|shortlist|selection list)\b/.test(title)) return "SELECTION UPDATE";
    if (["resource", "syllabus"].includes(type)) return "STUDY RESOURCE";
    if (type === "tutorial") return "TUTORIAL";
    if (type === "career_guidance") return "CAREER GUIDANCE";
    if (String(item.category || "").toLowerCase().includes("technology")) return "TECHNOLOGY";
    return "ENGINEERING ARTICLE";
  };
  const makeCard = item => {
    const isJob = item.kind === "job";
    const card = make("a", "home-story");
    card.href = isJob ? "careers.html#opportunities" : "article.html?slug=" + encodeURIComponent(item.slug || "");
    card.setAttribute("aria-label", "Open " + labelFor(item).toLowerCase() + ": " + (item.title || "EngiAdda update"));
    const type = make("span", "home-story-type", labelFor(item));
    const publishedValue = item.published_at || item.created_at;
    const date = formatDate(publishedValue);
    const metaLine = make("div", "home-story-meta");
    const meta = make("span", "home-story-date", date ? "Published " + date : "Recently published");
    metaLine.append(meta);
    const publishedTime = safeDate(publishedValue);
    const isNew = publishedTime > 0 && (Date.now() - publishedTime) >= 0 && (Date.now() - publishedTime) <= 7 * 24 * 60 * 60 * 1000;
    if (isNew) metaLine.append(make("span", "home-story-new", "NEW"));
    const heading = make("h3", "", item.title || "EngiAdda update");
    const detail = item.company || item.metadata?.organization || item.category || item.subject || "";
    const excerpt = item.excerpt || item.qualification || (isJob ? [detail, item.location].filter(Boolean).join(" · ") : detail) || "Open this update to read the published details.";
    const summary = make("p", "", excerpt);
    const link = make("span", "home-story-link");
    link.append(make("span", "", isJob ? "Explore careers" : "Read update"), make("b", "", "↗"));
    card.append(type, metaLine, heading, summary, link);
    return card;
  };
  const showMessage = message => target.replaceChildren(make("p", "home-empty", message));

  const requests = [];
  if (cmsApi) requests.push(fetch(cmsApi + "/api/content", { headers: { Accept: "application/json" } })
    .then(response => { if (!response.ok) throw new Error("CMS unavailable"); return response.json(); })
    .then(data => (Array.isArray(data.items) ? data.items : []).map(item => ({ ...item, kind: "cms" }))));
  if (jobsApi) requests.push(fetch(jobsApi + "/api/jobs?limit=50&offset=0", { headers: { Accept: "application/json" } })
    .then(response => { if (!response.ok) throw new Error("Jobs unavailable"); return response.json(); })
    .then(data => (Array.isArray(data.jobs) ? data.jobs : []).map(item => ({ ...item, kind: "job" }))));

  if (!requests.length) {
    showMessage("The EngiAdda updates feed is temporarily unavailable.");
    return;
  }

  Promise.allSettled(requests).then(results => {
    const items = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    const unique = new Map();
    items.forEach(item => {
      const key = item.kind === "job" ? "job:" + item.id : "cms:" + (item.id || item.slug);
      if (key && !unique.has(key)) unique.set(key, item);
    });
    const latest = [...unique.values()]
      .sort((a, b) => safeDate(b.published_at || b.created_at) - safeDate(a.published_at || a.created_at))
      .slice(0, 6);
    if (!latest.length) {
      const anyFailure = results.some(result => result.status === "rejected");
      showMessage(anyFailure
        ? "The latest updates could not be loaded just now. Please visit Careers or the Knowledge Library."
        : "No updates have been published yet. New EngiAdda articles, resources and career notices will appear here automatically.");
      return;
    }
    target.replaceChildren(...latest.map(makeCard));
    if (results.every(result => result.status === "rejected")) {
      showMessage("We couldn't load the latest updates just now. Please visit Careers or the Knowledge Library.");
    }
  });
})();