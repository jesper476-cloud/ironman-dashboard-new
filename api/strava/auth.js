
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.APP_URL;

  if (!clientId || !appUrl) {
    return res.status(500).send("Strava configuration missing");
  }

  const state = crypto.randomBytes(24).toString("hex");

  res.setHeader("Set-Cookie",
    `strava_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  );

  const redirectUri = `${appUrl}/api/strava/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state
  });

  return res.redirect(
    302,
    `https://www.strava.com/oauth/authorize?${params}`
  );
};
