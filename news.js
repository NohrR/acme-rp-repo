(function () {
  const statusEl = document.getElementById("news-status");
  const listEl = document.getElementById("news-list");
  const detailEl = document.getElementById("news-detail");
  const longDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });
  let activeArticleId = null;
  let currentArticles = [];

  if (!statusEl || !listEl || !detailEl) {
    return;
  }

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

  function getExcerpt(content, maxLength) {
    const paragraphs = String(content || "")
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    const firstParagraph = paragraphs[0] || "";
    const normalized = firstParagraph.replace(/\s+/g, " ").trim();

    if (!normalized) {
      return "";
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength).trimEnd()}...`;
  }

  function createMeta(article) {
    const meta = document.createElement("div");
    meta.className = "news-meta";

    const date = document.createElement("span");
    date.textContent = formatDate(article.publishDate);
    meta.appendChild(date);

    if (article.author) {
      const author = document.createElement("span");
      author.textContent = article.author;
      meta.appendChild(author);
    }

    return meta;
  }

  function createImageWrap(article, wrapClassName, imageClassName) {
    if (!article.imageUrl) {
      return null;
    }

    const imageWrap = document.createElement("div");
    imageWrap.className = wrapClassName;

    const image = document.createElement("img");
    image.className = imageClassName;
    image.src = article.imageUrl;
    image.alt = "";
    image.loading = "lazy";

    imageWrap.appendChild(image);
    return imageWrap;
  }

  function buildEmptyCard(message) {
    const empty = document.createElement("div");
    empty.className = "news-empty";
    empty.textContent = message;
    return empty;
  }

  function buildFeedItem(article, isActive) {
    const button = document.createElement("button");
    button.className = "news-feed-item";
    button.type = "button";
    button.dataset.articleId = article.id || "";
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.classList.toggle("is-active", isActive);

    const imageWrap = createImageWrap(article, "news-feed-image-wrap", "news-feed-image");
    if (imageWrap) {
      button.appendChild(imageWrap);
    }

    button.appendChild(createMeta(article));

    const title = document.createElement("h2");
    title.className = "news-feed-title";
    title.textContent = article.title || "Untitled article";
    button.appendChild(title);

    const summary = document.createElement("p");
    summary.className = "news-feed-summary";
    summary.textContent =
      article.summary || getExcerpt(article.content, 140) || "No summary has been added yet.";
    button.appendChild(summary);

    button.addEventListener("click", () => {
      activeArticleId = article.id || null;
      renderFeed(currentArticles);
      renderDetail(getActiveArticle(currentArticles));
    });

    return button;
  }

  function buildDetail(article) {
    const fragment = document.createDocumentFragment();

    const imageWrap = createImageWrap(article, "news-detail-image-wrap", "news-detail-image");
    if (imageWrap) {
      fragment.appendChild(imageWrap);
    }

    fragment.appendChild(createMeta(article));

    const title = document.createElement("h1");
    title.className = "news-detail-title";
    title.id = "news-detail-title";
    title.textContent = article.title || "Untitled article";
    fragment.appendChild(title);

    const summary = document.createElement("p");
    summary.className = "news-detail-summary";
    summary.textContent = article.summary || "No summary has been added yet.";
    fragment.appendChild(summary);

    const body = document.createElement("div");
    body.className = "news-detail-body";

    const paragraphs = String(article.content || "")
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (!paragraphs.length) {
      const fallbackParagraph = document.createElement("p");
      fallbackParagraph.textContent = "No article body has been added yet.";
      body.appendChild(fallbackParagraph);
    } else {
      for (const paragraphText of paragraphs) {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        body.appendChild(paragraph);
      }
    }

    fragment.appendChild(body);
    return fragment;
  }

  function getActiveArticle(articles) {
    if (!articles.length) {
      return null;
    }

    if (activeArticleId) {
      const matchedArticle = articles.find((article) => article.id === activeArticleId);
      if (matchedArticle) {
        return matchedArticle;
      }
    }

    activeArticleId = articles[0].id || null;
    return articles[0];
  }

  function renderFeed(articles) {
    listEl.replaceChildren();

    if (!articles.length) {
      listEl.appendChild(buildEmptyCard("No articles have been published yet."));
      return;
    }

    const activeArticle = getActiveArticle(articles);

    for (const article of articles) {
      listEl.appendChild(buildFeedItem(article, article === activeArticle));
    }
  }

  function renderDetail(article) {
    detailEl.replaceChildren();

    if (!article) {
      detailEl.appendChild(buildEmptyCard("Select an article to read it here."));
      return;
    }

    detailEl.appendChild(buildDetail(article));
  }

  function renderEmptyState(message, statusMessage) {
    listEl.replaceChildren(buildEmptyCard(message));
    detailEl.replaceChildren(buildEmptyCard(message));
    statusEl.textContent = statusMessage;
  }

  function renderArticles(articles) {
    if (!Array.isArray(articles) || !articles.length) {
      currentArticles = [];
      activeArticleId = null;
      renderEmptyState(
        "No articles have been published yet. Sign in to the CMS to add the first update.",
        "No news articles are live yet."
      );
      return;
    }

    currentArticles = articles;
    const activeArticle = getActiveArticle(articles);
    renderFeed(articles);
    renderDetail(activeArticle);
    statusEl.textContent = `${articles.length} article${articles.length === 1 ? "" : "s"} published recently.`;
  }

  async function loadArticles() {
    statusEl.textContent = "Loading the latest articles...";

    try {
      const response = await fetch("/api/news", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load news (${response.status})`);
      }

      const payload = await response.json();
      renderArticles(payload.articles || []);
    } catch (error) {
      console.error(error);
      currentArticles = [];
      activeArticleId = null;
      renderEmptyState(
        "The news feed is currently unavailable. Start the local server to load CMS content.",
        "The news feed is currently unavailable."
      );
    }
  }

  loadArticles();
})();
