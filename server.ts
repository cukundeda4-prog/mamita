import express from "express";
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const app = express();
const server = createHttpServer(app);
const wss = new WebSocketServer({ server });
const db = new Database("stocks.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    balance REAL DEFAULT 100.0
  );
  CREATE TABLE IF NOT EXISTS holdings (
    user_id TEXT,
    block_id TEXT,
    amount INTEGER DEFAULT 0,
    avg_buy_price REAL DEFAULT 0,
    PRIMARY KEY (user_id, block_id)
  );
`);

// Market State
const blocks = [
  { id: "grass", name: "Grass Block", price: 1.2, volatility: 0.05 },
  { id: "stone", name: "Stone", price: 2.5, volatility: 0.03 },
  { id: "oak_log", name: "Oak Log", price: 5.0, volatility: 0.08 },
  { id: "iron_ore", name: "Iron Ore", price: 15.0, volatility: 0.12 },
  { id: "gold_ore", name: "Gold Ore", price: 45.0, volatility: 0.15 },
  { id: "diamond_ore", name: "Diamond Ore", price: 150.0, volatility: 0.20 },
  { id: "ancient_debris", name: "Ancient Debris", price: 500.0, volatility: 0.25 },
  { id: "obsidian", name: "Obsidian", price: 80.0, volatility: 0.10 },
  { id: "cobblestone", name: "Cobblestone", price: 0.8, volatility: 0.02 },
  { id: "dirt", name: "Dirt", price: 0.5, volatility: 0.01 },
];

let marketPrices = blocks.map(b => ({ ...b, lastPrice: b.price, trend: 0 }));

// Simulate Market
setInterval(() => {
  marketPrices = marketPrices.map(b => {
    const changePercent = (Math.random() - 0.5) * 2 * b.volatility;
    const newPrice = Math.max(0.1, b.price * (1 + changePercent));
    const trend = newPrice > b.price ? 1 : -1;
    return { ...b, lastPrice: b.price, price: parseFloat(newPrice.toFixed(2)), trend };
  });

  // Broadcast to all clients
  const data = JSON.stringify({ type: "MARKET_UPDATE", prices: marketPrices });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}, 3000);

app.use(express.json());

// API Routes
app.post("/api/login", (req, res) => {
  const { username } = req.body;
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user) {
    const id = Math.random().toString(36).substring(7);
    db.prepare("INSERT INTO users (id, username, balance) VALUES (?, ?, ?)").run(id, username, 100.0);
    user = { id, username, balance: 100.0 };
  }
  const holdings = db.prepare("SELECT * FROM holdings WHERE user_id = ?").all(user.id);
  res.json({ user, holdings });
});

app.post("/api/trade", (req, res) => {
  const { userId, blockId, amount, type } = req.body; // type: 'buy' or 'sell'
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const block = marketPrices.find(b => b.id === blockId);

  if (!user || !block) return res.status(404).json({ error: "User or block not found" });

  const totalCost = block.price * amount;

  if (type === "buy") {
    if (user.balance < totalCost) return res.status(400).json({ error: "Insufficient diamonds" });

    const existingHolding = db.prepare("SELECT * FROM holdings WHERE user_id = ? AND block_id = ?").get(userId, blockId) as any;
    
    if (existingHolding) {
      const newAmount = existingHolding.amount + amount;
      const newAvgPrice = ((existingHolding.avg_buy_price * existingHolding.amount) + totalCost) / newAmount;
      db.prepare("UPDATE holdings SET amount = ?, avg_buy_price = ? WHERE user_id = ? AND block_id = ?")
        .run(newAmount, newAvgPrice, userId, blockId);
    } else {
      db.prepare("INSERT INTO holdings (user_id, block_id, amount, avg_buy_price) VALUES (?, ?, ?, ?)")
        .run(userId, blockId, amount, block.price);
    }

    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(totalCost, userId);
  } else {
    const existingHolding = db.prepare("SELECT * FROM holdings WHERE user_id = ? AND block_id = ?").get(userId, blockId) as any;
    if (!existingHolding || existingHolding.amount < amount) return res.status(400).json({ error: "Insufficient blocks" });

    const newAmount = existingHolding.amount - amount;
    if (newAmount === 0) {
      db.prepare("DELETE FROM holdings WHERE user_id = ? AND block_id = ?").run(userId, blockId);
    } else {
      db.prepare("UPDATE holdings SET amount = ? WHERE user_id = ? AND block_id = ?").run(newAmount, userId, blockId);
    }

    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(totalCost, userId);
  }

  const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const updatedHoldings = db.prepare("SELECT * FROM holdings WHERE user_id = ?").all(userId);
  res.json({ user: updatedUser, holdings: updatedHoldings });
});

// Vite Middleware
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(process.cwd(), "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(process.cwd(), "dist", "index.html"));
  });
}

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
