
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "AI-coachen är inte konfigurerad ännu."
    });
  }

  const { question, activities } = req.body || {};

  if (!Array.isArray(activities) || activities.length > 30) {
    return res.status(400).json({
      error: "Ogiltiga träningsdata."
    });
  }

  const trainingData = activities.map(a => ({
    name: a.name,
    sport: a.sport_type || a.type,
    distance_km: Number(a.distance || 0) / 1000,
    duration_minutes: Number(a.moving_time || 0) / 60,
    average_speed: a.average_speed,
    average_heartrate: a.average_heartrate,
    average_watts: a.average_watts
  }));

  const prompt = `
Du är en professionell triathloncoach.
Du hjälper en atlet som tränar inför Ironman 70.3 Jönköping 2027.

Analysera träningspassen nedan.

Ge:
1. Sammanfattning av prestationen.
2. Vad som gick bra.
3. Vad som behöver förbättras.
4. Rekommendationer för nästa pass.
5. Återhämtningsråd.

Var försiktig med slutsatser om puls, form och belastning
om underlaget inte räcker.

Atletens fråga:
${String(question || "Analysera mina senaste träningspass.").slice(0, 1000)}

Träningsdata:
${JSON.stringify(trainingData)}
`;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-6",
          input: prompt
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("AI request failed:", result);
      return res.status(502).json({
        error: "Kunde inte analysera träningen."
      });
    }

    const answer = (result.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    return res.status(200).json({ answer });

  } catch (error) {
    console.error("Coach error:", error.message);
    return res.status(500).json({
      error: "Ett fel uppstod i coachen."
    });
  }
};
