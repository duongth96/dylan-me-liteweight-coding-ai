const express = require("express");

const cities = [
  { id: "hn", name: "Hà Nội", country: "VN", lat: 21.0278, lon: 105.8342 },
  { id: "hcm", name: "TP. Hồ Chí Minh", country: "VN", lat: 10.8231, lon: 106.6297 },
  { id: "dn", name: "Đà Nẵng", country: "VN", lat: 16.0544, lon: 108.2022 },
  { id: "hp", name: "Hải Phòng", country: "VN", lat: 20.8449, lon: 106.6881 },
  { id: "ct", name: "Cần Thơ", country: "VN", lat: 10.0452, lon: 105.7469 }
];

const weatherByCityId = {
  hn: { condition: "Cloudy", tempC: 26, humidity: 78, windKph: 14 },
  hcm: { condition: "Sunny", tempC: 32, humidity: 65, windKph: 10 },
  dn: { condition: "Partly cloudy", tempC: 29, humidity: 70, windKph: 18 },
  hp: { condition: "Rain", tempC: 25, humidity: 85, windKph: 22 },
  ct: { condition: "Thunderstorm", tempC: 30, humidity: 80, windKph: 16 }
};

function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/cities", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const filtered = q
      ? cities.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      : cities;

    res.json({ data: filtered });
  });

  app.get("/api/cities/:cityId/weather", (req, res) => {
    const cityId = req.params.cityId;
    const city = cities.find((c) => c.id === cityId);
    if (!city) {
      res.status(404).json({ error: "CITY_NOT_FOUND" });
      return;
    }

    const weather = weatherByCityId[cityId] ?? {
      condition: "Unknown",
      tempC: 0,
      humidity: 0,
      windKph: 0
    };

    res.json({
      data: {
        city,
        weather: { ...weather, updatedAt: new Date().toISOString() }
      }
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) //|| 3000;
  const app = createApp();
  app.listen(port, () => {
    process.stdout.write(`Server listening on http://localhost:${port}\n`);
  });
}

module.exports = { createApp };
