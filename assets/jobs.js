(() => {
  const apiBase = String(window.ENGIADDA_API_BASE || "").trim().replace(/\/$/, "");
  const form = document.getElementById("job-filters");
  const list = document.getElementById("jobs-list");
  const status = document.getElementById("jobs-status");
  const loadMore = document.getElementById("jobs-load-more");
  const count = document.getElementById("jobs-count");

  if (!form || !list || !status || !loadMore) return;

  const state = { offset: 0, limit: 12, loading: false, hasMore: false };

  function text(tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null || value === "" ? "" : String(value);
    return node;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function categoryLabel(value) {
    const labels = { government: "Government", psu: "PSU", private: "Private sector" };
    return labels[String(value || "").toLowerCase()] || String(value || "Engineering role");
  }

  function createJobCard(job) {
    const card = document.createElement("article");
    card.className = "job-card";

    const top = document.createElement("div");
    top.className = "job-card-top";
    top.append(text("span", categoryLabel(job.category), "job-category"));
    if (job.official === true) top.append(text("span", "Verified source", "job-verified"));
    card.append(top);

    card.append(text("h3", job.title, "job-title"));
    card.append(text("p", job.company || job.department || job.source || "Recruiting organisation", "job-company"));

    const meta = document.createElement("div");
    meta.className = "job-meta";
    if (job.location) meta.append(text("span", job.location));
    if (job.engineering_discipline) meta.append(text("span", job.engineering_discipline));
    if (job.experience_level) meta.append(text("span", job.experience_level));
    if (job.employment_type) meta.append(text("span", job.employment_type));
    card.append(meta);

    if (job.qualification) {
      const qualification = text("p", job.qualification, "job-qualification");
      card.append(qualification);
    }

    const dates = document.createElement("div");
    dates.className = "job-dates";
    if (job.published_at) dates.append(text("span", `Published: ${formatDate(job.published_at)}`));
    if (job.deadline) dates.append(text("span", `Last date: ${formatDate(job.deadline)}`));
    else dates.append(text("span", "Deadline not specified"));
    card.append(dates);

    const footer = document.createElement("div");
    footer.className = "job-card-footer";
    footer.append(text("span", job.source ? `Source: ${job.source}` : "", "job-source"));
    const link = document.createElement("a");
    link.className = "btn small";
    link.href = job.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View opportunity";
    footer.append(link);
    card.append(footer);

    return card;
  }

  async function loadJobs(append = false) {
    if (!apiBase) {
      status.textContent = "The live job feed is being connected. Please check back shortly.";
      loadMore.hidden = true;
      return;
    }
    if (state.loading) return;

    state.loading = true;
    loadMore.disabled = true;
    status.textContent = append ? "Loading more opportunities…" : "Loading verified opportunities…";
    if (!append) list.replaceChildren();

    const params = new URLSearchParams({
      limit: String(state.limit),
      offset: String(state.offset),
    });
    const query = form.elements.search.value.trim();
    const category = form.elements.category.value;
    const discipline = form.elements.discipline.value;
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (discipline) params.set("discipline", discipline);

    try {
      const response = await fetch(`${apiBase}/api/jobs?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("The job service is temporarily unavailable.");
      const data = await response.json();
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];

      jobs.forEach((job) => list.append(createJobCard(job)));
      state.offset += jobs.length;
      state.hasMore = jobs.length === state.limit;
      status.textContent = jobs.length
        ? `Showing ${state.offset} opportunity${state.offset === 1 ? "" : "ies"} from the verified job feed.`
        : append ? "No more opportunities to show." : "No matching active opportunities found.";
      if (count) count.textContent = String(state.offset);
      loadMore.hidden = !state.hasMore;
    } catch (error) {
      status.textContent = error.message || "Unable to load jobs. Please try again.";
      loadMore.hidden = true;
    } finally {
      state.loading = false;
      loadMore.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.offset = 0;
    loadJobs(false);
  });

  loadMore.addEventListener("click", () => loadJobs(true));
  loadJobs(false);
})();
