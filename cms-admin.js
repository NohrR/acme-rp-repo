(function () {
  const form = document.getElementById("cms-article-form");
  const sessionStatusEl = document.getElementById("cms-session-status");
  const formStatusEl = document.getElementById("cms-form-status");
  const listEl = document.getElementById("cms-article-list");
  const countEl = document.getElementById("cms-article-count");
  const saveButton = document.getElementById("cms-save-button");
  const resetButton = document.getElementById("cms-reset-button");
  const logoutButton = document.getElementById("cms-logout");
  const publishDateInput = document.getElementById("article-publish-date");
  const articleIdInput = document.getElementById("article-id");
  const titleInput = document.getElementById("article-title");
  const authorInput = document.getElementById("article-author");
  const summaryInput = document.getElementById("article-summary");
  const imageUrlInput = document.getElementById("article-image-url");
  const contentInput = document.getElementById("article-content");
  const longDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

  const state = {
    articles: [],
    editingId: null,
  };

  function formatDate(dateValue) {
    if (!dateValue) {
      return "Date unavailable";
    }

    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return longDateFormatter.format(parsed);
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function setFormBusy(isBusy) {
    saveButton.disabled = isBusy;
    resetButton.disabled = isBusy;
    logoutButton.disabled = isBusy;
    saveButton.textContent = isBusy
      ? state.editingId
        ? "Saving..."
        : "Publishing..."
      : state.editingId
        ? "Save Changes"
        : "Publish Article";
  }

  function setFormStatus(message) {
    formStatusEl.textContent = message;
  }

  function resetForm() {
    state.editingId = null;
    articleIdInput.value = "";
    form.reset();
    publishDateInput.value = getTodayDate();
    saveButton.textContent = "Publish Article";
    setFormStatus("Ready to publish a new article.");
  }

  function fillForm(article) {
    state.editingId = article.id;
    articleIdInput.value = article.id;
    titleInput.value = article.title || "";
    authorInput.value = article.author || "";
    summaryInput.value = article.summary || "";
    imageUrlInput.value = article.imageUrl || "";
    contentInput.value = article.content || "";
    publishDateInput.value = article.publishDate || getTodayDate();
    saveButton.textContent = "Save Changes";
    setFormStatus(`Editing "${article.title}".`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    listEl.replaceChildren();

    if (!state.articles.length) {
      const empty = document.createElement("div");
      empty.className = "cms-list-empty";
      empty.textContent = "No articles have been published yet.";
      listEl.appendChild(empty);
      countEl.textContent = "0 articles published.";
      return;
    }

    countEl.textContent = `${state.articles.length} article${state.articles.length === 1 ? "" : "s"} published.`;

    for (const article of state.articles) {
      const card = document.createElement("article");
      card.className = "cms-article-card";

      const meta = document.createElement("div");
      meta.className = "cms-article-meta";

      const date = document.createElement("span");
      date.textContent = formatDate(article.publishDate);
      meta.appendChild(date);

      const author = document.createElement("span");
      author.textContent = article.author || "ACME Team";
      meta.appendChild(author);

      card.appendChild(meta);

      const title = document.createElement("h3");
      title.className = "cms-article-title";
      title.textContent = article.title;
      card.appendChild(title);

      const summary = document.createElement("p");
      summary.className = "cms-article-summary";
      summary.textContent = article.summary;
      card.appendChild(summary);

      const actions = document.createElement("div");
      actions.className = "cms-article-actions";

      const editButton = document.createElement("button");
      editButton.className = "cms-button-secondary";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => fillForm(article));

      const deleteButton = document.createElement("button");
      deleteButton.className = "cms-button-secondary";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteArticle(article));

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      card.appendChild(actions);

      listEl.appendChild(card);
    }
  }

  async function ensureSession() {
    try {
      const response = await fetch("/api/cms/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to verify your session.");
      }

      const payload = await response.json();
      if (!payload.authenticated) {
        window.location.href = "./cms-login.html";
        return false;
      }

      sessionStatusEl.textContent = `Signed in as ${payload.username}.`;
      return true;
    } catch (error) {
      console.error(error);
      sessionStatusEl.textContent = "The CMS session could not be verified. Please sign in again.";
      window.location.href = "./cms-login.html";
      return false;
    }
  }

  async function loadArticles() {
    countEl.textContent = "Loading articles...";

    const response = await fetch("/api/cms/news", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load CMS articles.");
    }

    const payload = await response.json();
    state.articles = Array.isArray(payload.articles) ? payload.articles : [];
    renderList();
  }

  async function saveArticle(event) {
    event.preventDefault();

    const wasEditing = Boolean(state.editingId);
    const formData = new FormData(form);
    const payload = {
      title: String(formData.get("title") || "").trim(),
      author: String(formData.get("author") || "").trim(),
      publishDate: String(formData.get("publishDate") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      imageUrl: String(formData.get("imageUrl") || "").trim(),
      content: String(formData.get("content") || "").trim(),
    };

    setFormBusy(true);
    setFormStatus(wasEditing ? "Saving your article..." : "Publishing your article...");

    try {
      const url = wasEditing ? `/api/cms/news/${state.editingId}` : "/api/cms/news";
      const method = wasEditing ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Unable to save the article.");
      }

      await loadArticles();
      resetForm();
      setFormStatus(wasEditing ? "Article updated." : "Article published.");
    } catch (error) {
      console.error(error);
      setFormStatus(error.message || "Unable to save the article.");
    } finally {
      setFormBusy(false);
    }
  }

  async function deleteArticle(article) {
    const confirmed = window.confirm(`Delete "${article.title}" from the News page?`);
    if (!confirmed) {
      return;
    }

    setFormStatus(`Deleting "${article.title}"...`);
    setFormBusy(true);

    try {
      const response = await fetch(`/api/cms/news/${article.id}`, {
        method: "DELETE",
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Unable to delete the article.");
      }

      if (state.editingId === article.id) {
        resetForm();
      }

      await loadArticles();
      setFormStatus(`Deleted "${article.title}".`);
    } catch (error) {
      console.error(error);
      setFormStatus(error.message || "Unable to delete the article.");
    } finally {
      setFormBusy(false);
    }
  }

  async function logout() {
    logoutButton.disabled = true;
    sessionStatusEl.textContent = "Signing out...";

    try {
      await fetch("/api/cms/logout", { method: "POST" });
    } catch (error) {
      console.error(error);
    } finally {
      window.location.href = "./cms-login.html";
    }
  }

  form.addEventListener("submit", saveArticle);
  resetButton.addEventListener("click", resetForm);
  logoutButton.addEventListener("click", logout);

  (async function init() {
    publishDateInput.value = getTodayDate();
    setFormStatus("Ready to publish a new article.");

    const hasSession = await ensureSession();
    if (!hasSession) {
      return;
    }

    try {
      await loadArticles();
    } catch (error) {
      console.error(error);
      countEl.textContent = "The CMS could not load articles.";
      setFormStatus(error.message || "Unable to load articles.");
    }
  })();
})();
