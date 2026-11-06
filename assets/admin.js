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
  function toggleType() { const resource = $("content-type").value === "resource"; $("article-fields").hidden = resource; $("resource-fields").hidden = !resource; }
  function resetForm() {
    $("content-form").reset(); $("content-id").value = ""; $("content-slug").dataset.edited = ""; currentFile = null; $("editor-heading").textContent = "Create content"; $("upload-status").textContent = ""; message("editor-message", ""); toggleType();
  }
  async function loadItems() {
    $("content-list").innerHTML = "<p>Loading content…</p>";
    try {
      const data = await request("/api/admin/content" + ($("status-filter").value ? "?status=" + encodeURIComponent($("status-filter").value) : ""), { headers: headers() });
      if (!data.items.length) { $("content-list").innerHTML = "<p>No content yet. Create your first article or resource.</p>"; return; }
      $("content-list").innerHTML = data.items.map(item => `<article class="cms-item"><div><b>${esc(item.title)}</b><span>${esc(item.category)} · ${esc(item.content_type)} · ${esc(item.status)}</span></div><button type="button" data-edit="${esc(item.id)}" class="btn small secondary">Edit</button></article>`).join("");
      $("content-list").querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => editItem(data.items.find(item => item.id === button.dataset.edit))));
    } catch (error) { $("content-list").textContent = error.message; }
  }
  function editItem(item) {
    if (!item) return;
    $("content-id").value = item.id; $("content-type").value = item.content_type; $("content-title").value = item.title; $("content-slug").value = item.slug; $("content-slug").dataset.edited = "1";
    $("content-excerpt").value = item.excerpt || ""; $("content-category").value = item.category; $("content-subject").value = item.subject || ""; $("content-exam").value = item.exam || ""; $("content-tags").value = (item.tags || []).join(", ");
    $("content-body").value = item.body_markdown || ""; $("seo-title").value = item.seo_title || ""; $("seo-description").value = item.seo_description || "";
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
        bodyMarkdown:$("content-body").value, status, fileKey:file?.fileKey || "", fileName:file?.fileName || "",
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
  toggleType(); checkSession();
})();