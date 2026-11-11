
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET
  } = process.env;

  if (
    !UPSTASH_REDIS_REST_URL ||
    !UPSTASH_REDIS_REST_TOKEN ||
    !STRAVA_CLIENT_ID ||
    !STRAVA_CLIENT_SECRET
  ) {
    return res.status(500).json({ error: "Server configuration missing" });
  }

  const redisUrl = UPSTASH_REDIS_REST_URL.replace(/\/$/, "");

  async function redis(command) {
    const response = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      throw new Error("Database request failed");
    }

    return result.result;
  }

  try {
    const saved = await redis(["GET", "strava:tokens"]);

    if (!saved) {
      return res.status(401).json({
        error: "Strava is not connected"
      });
    }

    let tokens = JSON.parse(saved);

    if (tokens.expires_at * 1000 < Date.now() + 60000) {
      const refreshResponse = await fetch(
        "https://www.strava.com/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token
          })
        }
      );

      const refreshed = await refreshResponse.json();

      if (!refreshResponse.ok) {
        return res.status(401).json({
          error: "Could not refresh Strava connection"
        });
      }

      tokens = refreshed;

      await redis([
        "SET",
        "strava:tokens",
        JSON.stringify(tokens)
      ]);
    }

    const activityResponse = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=100&page=1",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      }
    );

    const activities = await activityResponse.json();

    if (!activityResponse.ok) {
      return res.status(502).json({
        error: "Could not retrieve Strava activities"
      });
    }

    return res.status(200).json(activities);

  } catch (error) {
    console.error("Activities error:", error.message);

    return res.status(500).json({
      error: "Could not load training data"
    });
  }
};
