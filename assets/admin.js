(() => {
  const api = String(window.ENGIADDA_CMS_API_BASE || "").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  const tokenKey = "engiadda_cms_session";
  let token = sessionStorage.getItem(tokenKey) || "";
  let currentFile = null;
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const message = (id, value, error = false) => { $(id).textContent = value || ""; $(id).classList.toggle("error", error); };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  async function request(path, options = {}) {
    if (!api) throw new Error("CMS API is not configured yet.");
    const response = await fetch(api + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401) signOut(false); throw new Error(data.error || "Request failed."); }
    return data;
  }
  function showWorkspace() { $("login-panel").hidden = true; $("workspace").hidden = false; $("logout-btn").hidden = false; }
  function signOut(show = true) { token = ""; sessionStorage.removeItem(tokenKey); $("workspace").hidden = true; $("login-panel").hidden = false; $("logout-btn").hidden = true; if (show) message("login-message", "You have signed out."); }
  async function checkSession() {
    if (!token) return;
    try { await request("/api/admin/session", { headers: headers() }); showWorkspace(); await loadItems(); }
    catch { signOut(false); }
  }
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); message("login-message", "Signing in…");
    try {
      const data = await request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("admin-password").value }) });
      token = data.token; sessionStorage.setItem(tokenKey, token); $("admin-password").value = ""; showWorkspace(); await loadItems(); message("login-message", "");
    } catch (error) { message("login-message", error.message, true); }
  });
  $("logout-btn").addEventListener("click", () => signOut());
  $("new-btn").addEventListener("click", resetForm);
  $("status-filter").addEventListener("change", loadItems);
  $("content-type").addEventListener("change", toggleType);
  $("content-title").addEventListener("input", () => { if (!$("content-id").value && !$("content-slug").dataset.edited) $("content-slug").value = slugify($("content-title").value); });
  $("content-slug").addEventListener("input", () => { $("content-slug").dataset.edited = "1"; });
  function slugify(value) { return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,240); }
  function toggleType() { const type = $("content-type").value; const resource = type === "resource"; const recruitment = type === "recruitment"; $("article-fields").hidden = resource; $("recruitment-fields").hidden = !recruitment; $("resource-fields").hidden = !resource; }
  function resetForm() {
    $("content-form").reset(); $("content-id").value = ""; $("content-slug").dataset.edited = ""; currentFile = null; $("editor-heading").textContent = "Create content"; $("upload-status").textContent = ""; message("editor-message", ""); toggleType();
  }
  async function loadItems() {
    $("content-list").innerHTML = "<p>Loading content…</p>";
    try {
      const data = await request("/api/admin/content" + ($("status-filter").value ? "?status=" + encodeURIComponent($("status-filter").value) : ""), { headers: headers() });
      if (!data.items.length) { $("content-list").innerHTML = "<p>No content yet. Create your first article or resource.</p>"; return; }
      const list = $("content-list"); list.replaceChildren();
      for (const item of data.items) {
        const card = document.createElement("article"); card.className = "cms-item";
        const details = document.createElement("div");
        const title = document.createElement("b"); title.textContent = item.title;
        const meta = document.createElement("span"); meta.textContent = item.category + " · " + item.content_type + " · " + item.status;
        details.append(title, meta);
        const actions = document.createElement("div"); actions.className = "cms-item-actions";
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn small secondary"; edit.textContent = "Edit"; edit.addEventListener("click", () => editItem(item));
        const nextStatus = item.status === "published" ? "draft" : "archived";
        const change = document.createElement("button"); change.type = "button"; change.className = "btn small secondary"; change.textContent = item.status === "published" ? "Unpublish" : "Archive";
        change.addEventListener("click", async () => {
          if (!confirm(nextStatus === "archived" ? "Archive this item?" : "Unpublish this item?")) return;
          try { await request("/api/admin/content/" + encodeURIComponent(item.id) + "/status", { method:"PATCH", headers:headers(), body:JSON.stringify({ status:nextStatus }) }); await loadItems(); }
          catch (error) { message("editor-message", error.message, true); }
        });
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn small secondary"; remove.textContent = "Delete"; remove.setAttribute("aria-label", "Delete " + item.title);
        remove.addEventListener("click", async () => {
          if (!confirm('Permanently delete "' + item.title + '"? This cannot be undone.')) return;
          remove.disabled = true; remove.textContent = "Deleting…";
          try {
            const result = await request("/api/admin/content/" + encodeURIComponent(item.id), { method:"DELETE", headers:headers() });
            if ($("content-id").value === item.id) resetForm();
            message("editor-message", result.storageCleanupPending ? "Content deleted; private file cleanup is pending." : "Content deleted.");
            await loadItems();
          } catch (error) {
            remove.disabled = false; remove.textContent = "Delete";
            message("editor-message", error.message, true);
          }
        });
        actions.append(edit, change, remove); card.append(details, actions); list.append(card);
      }
    } catch (error) { $("content-list").textContent = error.message; }
  }
  function editItem(item) {
    if (!item) return;
    $("content-id").value = item.id; $("content-type").value = item.content_type; $("content-title").value = item.title; $("content-slug").value = item.slug; $("content-slug").dataset.edited = "1";
    $("content-excerpt").value = item.excerpt || ""; $("content-category").value = item.category; $("content-subject").value = item.subject || ""; $("content-exam").value = item.exam || ""; $("content-tags").value = (item.tags || []).join(", ");
    $("content-body").value = item.body_markdown || ""; const links = item.recruitment_links || {}; $("recruitment-notification").value = links.notification || ""; $("recruitment-apply").value = links.apply || ""; $("recruitment-admit-card").value = links.admitCard || ""; $("recruitment-result").value = links.result || ""; $("recruitment-website").value = links.officialWebsite || ""; $("seo-title").value = item.seo_title || ""; $("seo-description").value = item.seo_description || "";
    currentFile = item.file_key ? { fileKey:item.file_key, fileName:item.file_name, fileMime:item.file_mime, fileSizeBytes:item.file_size_bytes } : null;
    $("editor-heading").textContent = "Edit content"; $("upload-status").textContent = currentFile ? "Attached file: " + currentFile.fileName : ""; toggleType(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function uploadIfSelected() {
    const file = $("resource-file").files[0];
    if (!file) return currentFile;
    message("upload-status", "Preparing secure upload…");
    const signed = await request("/api/admin/uploads/presign", { method:"POST", headers:headers(), body:JSON.stringify({ fileName:file.name, contentType:file.type, size:file.size }) });
    const uploaded = await fetch(signed.uploadUrl, { method:"PUT", headers:{ "Content-Type":file.type }, body:file });
    if (!uploaded.ok) throw new Error("File upload failed. Please retry.");
    currentFile = { fileKey:signed.fileKey, fileName:file.name, fileMime:file.type, fileSizeBytes:file.size };
    message("upload-status", "File uploaded successfully.");
    return currentFile;
  }
  async function save(status) {
    message("editor-message", "Saving…");
    try {
      const resource = $("content-type").value === "resource";
      const file = resource ? await uploadIfSelected() : null;
      if (resource && !file) throw new Error("Select a file before saving a resource.");
      const body = {
        contentType:$("content-type").value, title:$("content-title").value, slug:$("content-slug").value,
        excerpt:$("content-excerpt").value, category:$("content-category").value, subject:$("content-subject").value,
        exam:$("content-exam").value, tags:$("content-tags").value.split(",").map(x=>x.trim()).filter(Boolean),
        bodyMarkdown:$("content-body").value, recruitmentLinks: { notification:$("recruitment-notification").value.trim(), apply:$("recruitment-apply").value.trim(), admitCard:$("recruitment-admit-card").value.trim(), result:$("recruitment-result").value.trim(), officialWebsite:$("recruitment-website").value.trim() }, status, fileKey:file?.fileKey || "", fileName:file?.fileName || "",
        fileMime:file?.fileMime || "", fileSizeBytes:file?.fileSizeBytes || null, seoTitle:$("seo-title").value, seoDescription:$("seo-description").value
      };
      const id = $("content-id").value;
      const data = await request(id ? "/api/admin/content/" + encodeURIComponent(id) : "/api/admin/content", {
        method:id ? "PATCH" : "POST", headers:headers(), body:JSON.stringify(body)
      });
      $("content-id").value = data.item.id; $("editor-heading").textContent = "Edit content";
      message("editor-message", status === "published" ? "Content published." : "Draft saved.");
      await loadItems();
    } catch (error) { message("editor-message", error.message, true); }
  }
  $("content-form").addEventListener("submit", (event) => { event.preventDefault(); save("published"); });
  $("save-draft").addEventListener("click", () => save("draft"));
  $("preview-btn").addEventListener("click", () => {
    const panel = $("preview-panel"); panel.hidden = false;
    $("preview-title").textContent = $("content-title").value || "Untitled content";
    $("preview-excerpt").textContent = $("content-excerpt").value;
    if ($("content-type").value === "article" || $("content-type").value === "recruitment") {
      if (window.marked && window.DOMPurify) $("preview-output").innerHTML = DOMPurify.sanitize(marked.parse($("content-body").value || ""));
      else $("preview-output").textContent = $("content-body").value || "";
    } else { $("preview-output").textContent = currentFile ? "Resource file: " + currentFile.fileName : "Resource preview will be available after upload."; }
    panel.scrollIntoView({ behavior:"smooth", block:"nearest" });
  });
  toggleType(); checkSession();
})();