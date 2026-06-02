import { WebSocketServer, WebSocket } from "ws";
import { generateAlerts } from "@/lib/alert-engine";
import { connectDB } from "@/lib/db";
import Deal from "@/app/models/deal";
import Lead from "@/app/models/lead";

/* ================= SERVER ================= */

const PORT = 4000;

const wss = new WebSocketServer({ port: PORT });

console.log(" WebSocket running on ws://localhost:${PORT}");

/* ================= SAFE FETCH ================= */

async function getAlerts() {
  try {
    await connectDB();

    const [leadsRaw, dealsRaw] = await Promise.all([
      Lead.find().lean().limit(500),
      Deal.find().lean().limit(1000),
    ]);

    return generateAlerts(leadsRaw || [], dealsRaw || []);
  } catch (err) {
    console.error("WS FETCH ERROR:", err);
    return [];
  }
}

/* ================= BROADCAST ================= */

async function broadcastAlerts() {
  const alerts = await getAlerts();
  const payload = JSON.stringify({ data: alerts });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/* ================= CONNECTION ================= */

wss.on("connection", (ws: WebSocket) => {
  console.log("✅ Client connected");

  // send immediately
  getAlerts().then((alerts) => {
    ws.send(JSON.stringify({ data: alerts }));
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

/* ================= REAL-TIME LOOP ================= */

// 🔁 shared loop instead of per-client loop (better performance)
setInterval(() => {
  broadcastAlerts();
}, 5000);