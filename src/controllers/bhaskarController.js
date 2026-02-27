const https = require("https");

const SCHEDULE_URL = "https://www.bhaskar.com/__widgets-api__/ipl/schedule-cards";
const STATE_NEWS_URL = "https://prod.bhaskarapi.com/api/1.0/web-backend/state-news/list";

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
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(err);
          }
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


