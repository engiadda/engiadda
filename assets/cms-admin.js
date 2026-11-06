(() => {
  "use strict";
  const base = String(window.ENGIADDA_CMS_API_BASE || "").replace(/\/$/, "");
  const tokenKey = "engiadda_cms_session";
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(tokenKey) || "";
  const headers = (json = false) => ({
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
  });
  async function api(path, options = {}) {
    if (!base) throw new Error("CMS API is not configured yet. Deployment will be completed after approval.");
    const response = await fetch(base + path, { ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function message(id, text) { $(id).textContent = text || ""; }
  function showDashboard(admin) {
    $("loginPanel").classList.add("cms-hidden");
    $("dashboard").classList.remove("cms-hidden");
    $("adminIdentity").textContent = admin.email;
    loadContent();
  }
  async function checkSession() {
    if (!base || !token()) return;
    try { const data = await api("/api/cms/auth/me"); showDashboard(data.admin); }
    catch { sessionStorage.removeItem(tokenKey); }
  }
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault(); message("loginMessage", "Signing in…");
    try {
      const data = await api("/api/cms/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
      sessionStorage.setItem(tokenKey, data.session_token);
      $("password").value = "";
      showDashboard(data.admin); message("loginMessage", "");
    } catch (error) { message("loginMessage", error.message); }
  });
  $("logoutButton").addEventListener("click", async () => {
    try { await api("/api/cms/auth/logout", { method: "POST" }); } catch {}
    sessionStorage.removeItem(tokenKey); $("dashboard").classList.add("cms-hidden"); $("loginPanel").classList.remove("cms-hidden");
  });
  function resetForm() {
    $("contentForm").reset(); $("contentId").value = ""; $("slug").dataset.edited = ""; $("editorHeading").textContent = "Create content"; message("editorMessage", "");
  }
  $("resetButton").addEventListener("click", resetForm);
  $("newButton").addEventListener("click", resetForm);
  $("title").addEventListener("input", () => {
    if (!$("contentId").value && !$("slug").dataset.edited) $("slug").value = $("title").value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
  });
  $("slug").addEventListener("input", () => { $("slug").dataset.edited = "true"; });
  $("contentForm").addEventListener("submit", async (event) => {
    event.preventDefault(); message("editorMessage", "Saving…");
    const payload = {
      title: $("title").value, slug: $("slug").value, content_type: $("contentType").value,
      status: $("status").value, subject: $("subject").value, topic: $("topic").value,
      summary: $("summary").value, body_markdown: $("body").value,
      cover_image_url: $("cover").value, seo_title: $("seoTitle").value,
      seo_description: $("seoDescription").value,
    };
    const id = $("contentId").value;
    try {
      await api(id ? `/api/cms/admin/content/${encodeURIComponent(id)}` : "/api/cms/admin/content", {
        method: id ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      message("editorMessage", "Saved successfully."); resetForm(); await loadContent();
    } catch (error) { message("editorMessage", error.message); }
  });
  function addText(parent, tag, text, className) {
    const node = document.createElement(tag); node.textContent = text || ""; if (className) node.className = className; parent.appendChild(node); return node;
  }
  async function loadContent() {
    const list = $("contentList"); list.replaceChildren(addText(document.createElement("div"), "p", "Loading…", "cms-muted"));
    try {
      const data = await api("/api/cms/admin/content");
      list.replaceChildren();
      if (!data.content.length) { addText(list, "p", "No content yet. Create your first article or resource above.", "cms-muted"); return; }
      for (const item of data.content) {
        const row = document.createElement("div"); row.className = "cms-item";
        const info = document.createElement("div"); addText(info, "h3", item.title); addText(info, "p", `${item.content_type} · ${item.status} · ${item.slug}`, "cms-muted");
        const actions = document.createElement("div"); actions.className = "cms-actions";
        const edit = addText(actions, "button", "Edit", "cms-btn secondary"); edit.type = "button";
        edit.addEventListener("click", () => editContent(item.id));
        const del = addText(actions, "button", "Delete", "cms-btn danger"); del.type = "button";
        del.addEventListener("click", () => deleteContent(item.id, item.title));
        row.append(info, actions); list.appendChild(row);
      }
    } catch (error) { list.replaceChildren(); addText(list, "p", error.message, "cms-status"); }
  }
  async function editContent(id) {
    try {
      const data = await api(`/api/cms/admin/content/${encodeURIComponent(id)}`);
      const item = data.content;
      if (!item) { message("editorMessage", "Content not found."); return; }
      $("contentId").value = item.id; $("title").value = item.title; $("slug").value = item.slug;
      $("summary").value = item.summary || ""; $("body").value = item.body_markdown || "";
      $("contentType").value = item.content_type; $("status").value = item.status;
      $("subject").value = item.subject || ""; $("topic").value = item.topic || "";
      $("cover").value = item.cover_image_url || ""; $("seoTitle").value = item.seo_title || ""; $("seoDescription").value = item.seo_description || ""; $("editorHeading").textContent = "Edit content";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { message("editorMessage", error.message); }
  }
  async function deleteContent(id, title) {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    try { await api(`/api/cms/admin/content/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadContent(); }
    catch (error) { message("editorMessage", error.message); }
  }
  if (!base) message("loginMessage", "CMS foundation is being prepared. The dashboard will connect after the CMS Function is deployed.");
  checkSession();
})();
