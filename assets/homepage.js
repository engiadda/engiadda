(() => {
  "use strict";
  const target = document.getElementById("home-latest-grid");
  const api = String(window.ENGIADDA_CMS_API_BASE || "").replace(/\/$/, "");
  if (!target) return;

  const learningTypes = new Set(["article", "resource", "syllabus", "tutorial", "career_guidance"]);
  const labels = {
    article: "ENGINEERING ARTICLE",
    syllabus: "EXAM RESOURCE",
    resource: "STUDY RESOURCE",
    tutorial: "TUTORIAL",
    career_guidance: "CAREER GUIDANCE"
  };
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const showEmpty = message => target.replaceChildren(make("p", "home-empty", message));

  if (!api) {
    showEmpty("The EngiAdda publishing service is temporarily unavailable.");
    return;
  }

  fetch(api + "/api/content", { headers: { Accept: "application/json" } })
    .then(async response => {
      if (!response.ok) throw new Error("Content service unavailable");
      return response.json();
    })
    .then(data => {
      const items = (Array.isArray(data.items) ? data.items : [])
        .filter(item => learningTypes.has(String(item.content_type || "").toLowerCase()));
      if (!items.length) {
        showEmpty("No published learning resources are available yet. Recruitment notices and vacancies are listed in Careers.");
        return;
      }
      target.replaceChildren();
      items.slice(0, 3).forEach(item => {
        const card = make("a", "home-story");
        card.href = "article.html?slug=" + encodeURIComponent(item.slug || "");
        card.setAttribute("aria-label", "Read learning resource: " + (item.title || "EngiAdda resource"));
        card.append(
          make("span", "home-story-type", labels[item.content_type] || "LEARNING RESOURCE"),
          make("h3", "", item.title || "EngiAdda learning resource"),
          make("p", "", item.excerpt || "Open this resource to read the published details.")
        );
        const link = make("span", "home-story-link");
        link.append(make("span", "", "Read resource"), make("b", "", "↗"));
        card.append(link);
        target.append(card);
      });
    })
    .catch(() => showEmpty("We couldn't load published learning resources just now. Please visit the knowledge library."));
})();