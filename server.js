const http = require("http");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const NEWS_DATA_PATH = path.join(DATA_DIR, "news.json");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE_NAME = "acme_cms_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const DEFAULT_NEWS_ARTICLES = [
  {
    id: "welcome-to-the-acme-newsroom",
    title: "Welcome to the ACME Newsroom",
    summary:
      "ACME now has a dedicated newsroom where visitors can follow company updates, milestones, and new manufacturing capabilities.",
    content:
      "We launched this newsroom to make it easier for customers and partners to stay up to date with ACME.\n\nFuture posts can cover production milestones, new equipment, customer partnerships, and process improvements. Every article published through the CMS will appear here automatically.",
    author: "ACME Team",
    publishDate: "2026-03-19",
    imageUrl: "",
    createdAt: "2026-03-19T00:00:00.000Z",
    updatedAt: "2026-03-19T00:00:00.000Z",
  },
];
const MIME_TYPES = {
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};
const PAGE_ALIASES = new Map([
  ["/", "index.html"],
  ["/news", "news.html"],
  ["/cms", "cms-admin.html"],
  ["/cms-login", "cms-login.html"],
]);
const sessions = new Map();

function getCmsCredentials() {
  return {
    username: process.env.CMS_USERNAME || "admin",
    password: process.env.CMS_PASSWORD || "acme-news",
    usingDefaults: !process.env.CMS_USERNAME && !process.env.CMS_PASSWORD,
  };
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function sanitizeImageUrl(value) {
  const text = sanitizeText(value);
  if (!text) {
    return "";
  }

  if (/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(text)) {
    return text;
  }

  return "";
}

function slugify(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function createUniqueArticleId(baseValue, existingArticles) {
  const baseId = slugify(baseValue) || crypto.randomUUID();
  const existingIds = new Set(existingArticles.map((article) => article.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function normalizePublishDate(value) {
  const text = sanitizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return new Date().toISOString().slice(0, 10);
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function compareArticlesByDate(left, right) {
  return String(right.publishDate || "").localeCompare(String(left.publishDate || ""));
}

async function ensureNewsDataFile() {
  await fsPromises.mkdir(DATA_DIR, { recursive: true });

  try {
    await fsPromises.access(NEWS_DATA_PATH);
  } catch {
    await fsPromises.writeFile(NEWS_DATA_PATH, JSON.stringify(DEFAULT_NEWS_ARTICLES, null, 2));
  }
}

async function readNewsArticles() {
  await ensureNewsDataFile();
  const raw = await fsPromises.readFile(NEWS_DATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const articles = Array.isArray(parsed) ? parsed : [];
  return articles.slice().sort(compareArticlesByDate);
}

async function writeNewsArticles(articles) {
  await ensureNewsDataFile();
  const orderedArticles = articles.slice().sort(compareArticlesByDate);
  await fsPromises.writeFile(NEWS_DATA_PATH, `${JSON.stringify(orderedArticles, null, 2)}\n`);
}

function validateArticlePayload(payload) {
  const title = sanitizeText(payload.title);
  const summary = sanitizeText(payload.summary);
  const content = sanitizeText(payload.content);

  if (!title) {
    return { message: "A headline is required." };
  }

  if (!summary) {
    return { message: "A summary is required." };
  }

  if (!content) {
    return { message: "Article body content is required." };
  }

  return {
    title,
    summary,
    content,
    author: sanitizeText(payload.author) || "ACME Team",
    publishDate: normalizePublishDate(payload.publishDate),
    imageUrl: sanitizeImageUrl(payload.imageUrl),
  };
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, part) => {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
    return cookies;
  }, {});
}

function getSession(request) {
  cleanupExpiredSessions();

  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { sessionId, session };
}

function isAuthenticated(request) {
  return Boolean(getSession(request));
}

function setSessionCookie(response, sessionId) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function resolveFilePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const aliasedPath = PAGE_ALIASES.get(decodedPath) || decodedPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(ROOT_DIR, aliasedPath);
  const relativePath = path.relative(ROOT_DIR, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return absolutePath;
}

function parseRangeHeader(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;

  if (!startText && !endText) {
    return null;
  }

  let start;
  let end;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  end = Math.min(end, fileSize - 1);
  return { start, end };
}

async function serveStaticFile(request, response, requestPath) {
  const filePath = resolveFilePath(requestPath);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let stats;
  try {
    stats = await fsPromises.stat(filePath);
  } catch {
    sendText(response, 404, "Not Found");
    return;
  }

  if (!stats.isFile()) {
    sendText(response, 404, "Not Found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  const range = parseRangeHeader(request.headers.range, stats.size);

  if (request.headers.range && !range) {
    response.writeHead(416, {
      "Content-Range": `bytes */${stats.size}`,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });
    response.end();
    return;
  }

  if (range) {
    const { start, end } = range;
    const contentLength = end - start + 1;

    response.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": contentLength,
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Accept-Ranges": "bytes",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stats.size,
    "Accept-Ranges": "bytes",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

async function handleApiRequest(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/news") {
    const articles = await readNewsArticles();
    sendJson(response, 200, { articles });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/cms/session") {
    const sessionInfo = getSession(request);
    const { username } = getCmsCredentials();
    sendJson(response, 200, {
      authenticated: Boolean(sessionInfo),
      username: sessionInfo ? username : null,
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/cms/login") {
    const body = await readJsonBody(request);
    const { username, password } = getCmsCredentials();
    const usernameMatches = constantTimeEquals(body.username, username);
    const passwordMatches = constantTimeEquals(body.password, password);

    if (!usernameMatches || !passwordMatches) {
      sendJson(response, 401, { message: "Invalid username or password." });
      return true;
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    setSessionCookie(response, sessionId);
    sendJson(response, 200, { authenticated: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/cms/logout") {
    const sessionInfo = getSession(request);
    if (sessionInfo) {
      sessions.delete(sessionInfo.sessionId);
    }

    clearSessionCookie(response);
    sendJson(response, 200, { authenticated: false });
    return true;
  }

  if (!isAuthenticated(request) && url.pathname.startsWith("/api/cms/")) {
    clearSessionCookie(response);
    sendJson(response, 401, { message: "Authentication required." });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/cms/news") {
    const articles = await readNewsArticles();
    sendJson(response, 200, { articles });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/cms/news") {
    const body = await readJsonBody(request);
    const validatedArticle = validateArticlePayload(body);

    if (validatedArticle.message) {
      sendJson(response, 400, { message: validatedArticle.message });
      return true;
    }

    const articles = await readNewsArticles();
    const now = new Date().toISOString();
    const article = {
      id: createUniqueArticleId(validatedArticle.title, articles),
      ...validatedArticle,
      createdAt: now,
      updatedAt: now,
    };

    articles.unshift(article);
    await writeNewsArticles(articles);
    sendJson(response, 201, { article });
    return true;
  }

  if ((request.method === "PUT" || request.method === "DELETE") && url.pathname.startsWith("/api/cms/news/")) {
    const articleId = decodeURIComponent(url.pathname.replace("/api/cms/news/", ""));
    const articles = await readNewsArticles();
    const articleIndex = articles.findIndex((article) => article.id === articleId);

    if (articleIndex === -1) {
      sendJson(response, 404, { message: "Article not found." });
      return true;
    }

    if (request.method === "DELETE") {
      const [removedArticle] = articles.splice(articleIndex, 1);
      await writeNewsArticles(articles);
      sendJson(response, 200, { article: removedArticle });
      return true;
    }

    const body = await readJsonBody(request);
    const validatedArticle = validateArticlePayload(body);

    if (validatedArticle.message) {
      sendJson(response, 400, { message: validatedArticle.message });
      return true;
    }

    const previousArticle = articles[articleIndex];
    const updatedArticle = {
      ...previousArticle,
      ...validatedArticle,
      updatedAt: new Date().toISOString(),
    };

    articles[articleIndex] = updatedArticle;
    await writeNewsArticles(articles);
    sendJson(response, 200, { article: updatedArticle });
    return true;
  }

  return false;
}

async function requestHandler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  if (await handleApiRequest(request, response, url)) {
    return;
  }

  if (url.pathname === "/cms-admin.html" || url.pathname === "/cms") {
    if (!isAuthenticated(request)) {
      clearSessionCookie(response);
      redirect(response, "/cms-login.html");
      return;
    }
  }

  if ((url.pathname === "/cms-login.html" || url.pathname === "/cms-login") && isAuthenticated(request)) {
    redirect(response, "/cms-admin.html");
    return;
  }

  await serveStaticFile(request, response, url.pathname);
}

function createServer() {
  return http.createServer((request, response) => {
    requestHandler(request, response).catch((error) => {
      console.error(error);
      sendJson(response, 500, { message: "Internal server error." });
    });
  });
}

function startServer(port = PORT, host = HOST) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, host, () => resolve(server));
  });
}

if (require.main === module) {
  const { username, password, usingDefaults } = getCmsCredentials();
  if (usingDefaults) {
    console.log(
      `[cms] Using default local CMS credentials. Username: ${username} | Password: ${password}`
    );
  }

  startServer().then((server) => {
    const address = server.address();
    const hostname = typeof address === "object" && address ? address.address : HOST;
    const activePort = typeof address === "object" && address ? address.port : PORT;
    console.log(`ACME site available at http://${hostname}:${activePort}`);
  });
}

module.exports = {
  createServer,
  startServer,
};
