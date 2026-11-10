
const https = require("https");

function postToken(body) {
  return new Promise((resolve, reject) => {
    const req = https.request("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, response => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); }
        catch { return reject(new Error("Ogiltigt svar från Strava.")); }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(parsed.message || "Strava-inloggningen misslyckades."));
        }
        resolve(parsed);
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function saveTokens(tokens) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!base || !token) {
    throw new Error("Upstash-miljövariabler saknas.");
  }

  const url = base.replace(/\/$/, "") +
    "/set/strava%3Atokens/" +
    encodeURIComponent(JSON.stringify(tokens));

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }, response => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error("Kunde inte spara Strava-token."));
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const query = req.query || {};
  const code = query.code;
  const state = query.state;
  const returnedError = query.error;

  if (returnedError) {
    return res.status(400).send("Strava-godkännandet avbröts.");
  }

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)strava_state=([^;]+)/);
  const savedState = match ? match[1] : null;

  res.setHeader("Set-Cookie",
    "strava_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/strava; Max-Age=0"
  );

  if (!code || !state || !savedState || state !== savedState) {
    return res.status(400).send("Ogiltig eller utgången Strava-inloggning. Försök igen.");
  }

  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, APP_URL } = process.env;

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !APP_URL) {
    return res.status(500).send("Strava-inställningar saknas i Vercel.");
  }

  try {
    const body = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code: String(code),
      grant_type: "authorization_code"
    }).toString();

    const tokens = await postToken(body);
    await saveTokens(tokens);

    res.writeHead(302, {
      Location: `${APP_URL.replace(/\/$/, "")}/?connected=1`
    });
    return res.end();
  } catch (error) {
    return res.status(500).send("Kunde inte ansluta Strava: " + error.message);
  }
};
