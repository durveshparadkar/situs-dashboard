import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 4000 });

console.log("✅ WS Server running on ws://localhost:4000");

setInterval(() => {
  const fakeAlert = {
    id: Math.random().toString(),
    title: "Test Alert",
    message: "This is a real-time alert",
    company: "Demo Corp",
    severity: "critical",
    status: "new",
    impact: 50000,
    detectedAt: new Date().toISOString(),
    action: "Check deal",
    detail: "Something changed",
  };

  const payload = JSON.stringify({ data: [fakeAlert] });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}, 5000);