const https = require("https");

const SCHEDULE_URL = "https://www.bhaskar.com/__widgets-api__/ipl/schedule-cards";
const STATE_NEWS_URL = "https://prod.bhaskarapi.com/api/1.0/web-backend/state-news/list";
const CRICKET_FEED_URL =
  "https://www.bhaskar.com/__api__/api/2.0/feed/category/listingUrl/sports/cricket/";

// Simple in-memory cache to avoid hammering Bhaskar endpoints
const CACHE = new Map(); // key -> { data, expiresAt }
function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}
function cacheSet(key, data, ttlMs) {
  CACHE.set(key, { data, expiresAt: Date.now() + ttlMs });
}
const TTL_SHORT = 2 * 60 * 1000; // 2 minutes

// Headers based on user's working curl for state-news endpoint
const STATE_NEWS_HEADERS = {
  "a-ver-code": "1",
  "a-ver-name": "1.0.0-web",
  accept: "*/*",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
  cid: "521",
  dtyp: "web",
  uid: "2027305697270911000",
  "x-aut-t": "a6oaq3edtz59",
  at: "Gu3m3gVhYiR8d_iSCfG8yj7TJeyZ0ZhbQvhpD_MCTbHBiZo9uWTfG6spPjcl3hhri52cVY5hs4-BUjo7RE-OQRpvxlpoH6D6q0DqONj7yBscc6LsjLD35D_4k5NNq6GGTWsXq8rvjZsHS07cUICeYttx5t2py7g3X6woBx6X7U6v6CHQPt21LoU233urTNpCr1Cg3d1sDU6CSSjdEZMcsla1jTGz1tOemRJQmtRYXPw8I1BBzu6RmEZw40NJ5bbX",
  rt: "d009eea8bc4048c687f7d31362b76dbb",
  // These are safe to send from the backend
  origin: "https://www.bhaskar.com",
  referer: "https://www.bhaskar.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
};

// Headers for Bhaskar cricket category feed (kept close to the user's curl)
// NOTE: tokens like `at/rt/uid` may expire; keep them configurable via env in production.
const CRICKET_FEED_HEADERS = {
  accept: "*/*",
  "accept-language": STATE_NEWS_HEADERS["accept-language"],
  cid: STATE_NEWS_HEADERS.cid,
  dtyp: STATE_NEWS_HEADERS.dtyp,
  uid: process.env.BHASKAR_UID || STATE_NEWS_HEADERS.uid,
  at: process.env.BHASKAR_AT || STATE_NEWS_HEADERS.at,
  rt: process.env.BHASKAR_RT || STATE_NEWS_HEADERS.rt,
  origin: "https://www.bhaskar.com",
  referer: "https://www.bhaskar.com/sports/cricket/",
  "user-agent": STATE_NEWS_HEADERS["user-agent"],
  // Some Bhaskar endpoints also accept these tokens in cookies
  cookie: `at=${process.env.BHASKAR_AT || STATE_NEWS_HEADERS.at}; rt=${process.env.BHASKAR_RT || STATE_NEWS_HEADERS.rt}; uid=${process.env.BHASKAR_UID || STATE_NEWS_HEADERS.uid}`,
  ...(process.env.BHASKAR_X_AUT_WEB_T ? { "x-aut-web-t": process.env.BHASKAR_X_AUT_WEB_T } : {}),
};

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 0;
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = null;
          }

          if (statusCode < 200 || statusCode >= 300) {
            const err = new Error(`Upstream responded ${statusCode}`);
            err.statusCode = statusCode;
            err.payload = parsed || { raw: data };
            return reject(err);
          }

          if (parsed == null) {
            const err = new Error("Invalid JSON from upstream");
            err.statusCode = 502;
            err.payload = { raw: data };
            return reject(err);
          }

          resolve(parsed);
        });
      }
    );

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

// GET /api/v1/bhaskar/schedule
exports.getHindiSchedule = async (req, res) => {
  try {
    const json = await fetchJson(SCHEDULE_URL, { accept: "*/*" });
    res.status(200).json(json);
  } catch (error) {
    console.error("Error fetching Bhaskar schedule:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Hindi schedule from Bhaskar",
      error: error.message,
    });
  }
};

// GET /api/v1/bhaskar/states
exports.getStateNews = async (req, res) => {
  try {
    const json = await fetchJson(STATE_NEWS_URL, STATE_NEWS_HEADERS);
    res.status(200).json(json);
  } catch (error) {
    console.error("Error fetching Bhaskar state news:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch state news from Bhaskar",
      error: error.message,
    });
  }
};

// GET /api/v1/bhaskar/cricket?cursor=...
exports.getCricketFeed = async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : "";
    const url = cursor ? `${CRICKET_FEED_URL}?cursor=${encodeURIComponent(cursor)}` : CRICKET_FEED_URL;

    const cacheKey = `cricket_feed:${cursor || "first"}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.setHeader("x-cache", "HIT");
      return res.status(200).json(cached);
    }

    // Allow overriding tokens per-request (useful when tokens rotate)
    const at = typeof req.query.at === "string" ? req.query.at : "";
    const rt = typeof req.query.rt === "string" ? req.query.rt : "";
    const uid = typeof req.query.uid === "string" ? req.query.uid : "";
    const xAutWebT =
      typeof req.query.xAutWebT === "string"
        ? req.query.xAutWebT
        : typeof req.query["x-aut-web-t"] === "string"
          ? req.query["x-aut-web-t"]
          : "";

    const headers = { ...CRICKET_FEED_HEADERS };
    if (uid) headers.uid = uid;
    if (at) headers.at = at;
    if (rt) headers.rt = rt;
    if (xAutWebT) headers["x-aut-web-t"] = xAutWebT;
    if (uid || at || rt) {
      headers.cookie = `at=${at || headers.at}; rt=${rt || headers.rt}; uid=${uid || headers.uid}`;
    }

    const json = await fetchJson(url, headers);
    cacheSet(cacheKey, json, TTL_SHORT);
    res.setHeader("x-cache", "MISS");
    res.status(200).json(json);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    const payload = error.payload || null;
    console.error("Error fetching Bhaskar cricket feed:", error.message);
    res.status(status).json(
      payload || {
        success: false,
        message: "Failed to fetch cricket feed from Bhaskar",
        error: error.message,
      }
    );
  }
};


