
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send("Strava connection cancelled.");
  }

  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const i = item.indexOf("=");
        return [
          item.slice(0, i),
          decodeURIComponent(item.slice(i + 1))
        ];
      })
  );

  if (!state || state !== cookies.strava_state) {
    return res.status(400).send("Invalid security state.");
  }

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const {
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    APP_URL
  } = process.env;

  if (
    !STRAVA_CLIENT_ID ||
    !STRAVA_CLIENT_SECRET ||
    !UPSTASH_REDIS_REST_URL ||
    !UPSTASH_REDIS_REST_TOKEN ||
    !APP_URL
  ) {
    return res.status(500).send("Server configuration missing.");
  }

  try {
    const tokenResponse = await fetch(
      "https://www.strava.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code"
        })
      }
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || !tokens.refresh_token) {
      return res.status(400).send("Strava authorization failed.");
    }

    const redisUrl = UPSTASH_REDIS_REST_URL.replace(/\/$/, "");

    const saveResponse = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        "SET",
        "strava:tokens",
        JSON.stringify(tokens)
      ])
    });

    if (!saveResponse.ok) {
      return res.status(500).send("Could not save Strava connection.");
    }

    res.setHeader("Set-Cookie",
      "strava_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    );

    return res.redirect(302, `${APP_URL}/?strava=connected`);

  } catch (err) {
    console.error("Strava callback failed:", err.message);
    return res.status(500).send("Connection error.");
  }
};
