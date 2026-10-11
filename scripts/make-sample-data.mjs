// Makes one year of fake bank data for the demo and for testing.
// Everything here is made up. Run it with: npm run sample-data
//
// It writes two CSV files in different layouts (like two different banks),
// plus a text file of statement fine print. Same seed = same data every time.

import { mkdirSync, writeFileSync } from "node:fs";

const OUT_DIR = "public/sample-data";
const START = new Date("2025-10-01");
const END = new Date("2026-09-30");

// Simple seeded random numbers, so the data never changes between runs.
let seed = 42;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => Math.round((min + random() * (max - min)) * 100); // in cents

// Bank descriptions are messy on purpose: the same store shows up written
// different ways. Cleaning that up is one of the jobs RAG does in this app.
const EVERYDAY = [
  { names: ["SQ *BLUE BTL 0423 OAKLAND CA", "BLUE BOTTLE COFFEE #12", "SQ *BLUEBOTTLE OAKLAND"], cat: "Food & Drink", min: 4, max: 9, perMonth: 8 },
  { names: ["TST* JOES CAFE BROOKLYN", "JOE'S CAFE 0098"], cat: "Food & Drink", min: 3, max: 7, perMonth: 4 },
  { names: ["STARBUCKS STORE 08812", "STARBUCKS #0912 NEW YORK"], cat: "Food & Drink", min: 5, max: 11, perMonth: 3 },
  { names: ["TRADER JOE S #548 BROOKLYN", "TRADER JOES #548"], cat: "Groceries", min: 35, max: 120, perMonth: 4 },
  { names: ["WHOLEFDS BKN 10233", "WHOLE FOODS MKT #102"], cat: "Groceries", min: 20, max: 90, perMonth: 2 },
  { names: ["UBER *TRIP HELP.UBER.COM", "UBER TRIP 8XK2"], cat: "Transportation", min: 12, max: 38, perMonth: 3 },
  { names: ["MTA*NYCT PAYGO", "OMNY MTA NEW YORK"], cat: "Transportation", min: 3, max: 3, perMonth: 10 },
  { names: ["AMAZON MKTPL*2K4L19", "AMZN Mktp US*RT5Q2", "AMAZON.COM*HG7YT"], cat: "Shopping", min: 12, max: 85, perMonth: 3 },
  { names: ["DOORDASH*THAI VILLA", "DOORDASH*SWEETGREEN"], cat: "Food & Drink", min: 22, max: 48, perMonth: 3 },
  { names: ["CVS/PHARMACY #04412"], cat: "Health", min: 8, max: 40, perMonth: 1 },
];

// Same day every month, so the app can spot them as subscriptions.
const SUBSCRIPTIONS = [
  { name: "NETFLIX.COM", cat: "Entertainment", amount: 1799, day: 3 },
  { name: "SPOTIFY USA", cat: "Entertainment", amount: 1199, day: 7 },
  { name: "APPLE.COM/BILL ICLOUD", cat: "Shopping", amount: 299, day: 12 },
  { name: "EQUINOX BROOKLYN HTS", cat: "Health", amount: 26500, day: 1 },
  { name: "NYTIMES DIGITAL", cat: "Entertainment", amount: 400, day: 20 },
];

const card = []; // credit card rows
const checking = []; // checking account rows, before running balances

const addCard = (date, description, category, cents) =>
  card.push({ date, post: addDays(date, 1), description, category, cents });
const addChecking = (date, description, cents) => checking.push({ date, description, cents });

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
const day = (y, m, d) => new Date(Date.UTC(y, m, d));

// ---- Everyday spending on the credit card ----
for (let m = new Date(START); m <= END; m = day(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)) {
  const y = m.getUTCFullYear();
  const mo = m.getUTCMonth();
  for (const shop of EVERYDAY) {
    for (let i = 0; i < shop.perMonth; i++) {
      addCard(day(y, mo, 1 + Math.floor(random() * 28)), pick(shop.names), shop.cat, -between(shop.min, shop.max));
    }
  }
  for (const sub of SUBSCRIPTIONS) addCard(day(y, mo, sub.day), sub.name, sub.cat, -sub.amount);
}

// ---- A summer trip to Lisbon (foreign fees explained in the fine print) ----
const trip = [
  ["2026-07-08", "TAP AIR PORTUGAL 0472", "Travel", 84200],
  ["2026-07-09", "HOTEL ALFAMA LISBOA", "Travel", 112000],
  ["2026-07-10", "PASTEIS DE BELEM LISBOA", "Food & Drink", 1450],
  ["2026-07-11", "TIME OUT MARKET LISBOA", "Food & Drink", 4820],
  ["2026-07-12", "UBER *TRIP LISBOA", "Transportation", 1630],
  ["2026-07-13", "A CEVICHERIA LISBOA", "Food & Drink", 7340],
];
for (const [date, name, cat, cents] of trip) {
  addCard(new Date(date), name, cat, -cents);
  // 3% fee on purchases made in another currency (the flight was booked in USD).
  if (!name.startsWith("TAP")) addCard(new Date(date), "FOREIGN TRANSACTION FEE", "Fees", -Math.round(cents * 0.03));
}

// ---- Card interest ----
// Paying late in February means an interest charge that month (see fine print).
addCard(day(2026, 1, 28), "INTEREST CHARGE ON PURCHASES", "Fees", -1874);

// ---- Paying off the card from checking ----
// Due on the 15th. February is paid late on purpose, which triggers a late fee.
for (let m = day(2025, 10, 1); m <= END; m = day(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)) {
  const y = m.getUTCFullYear();
  const mo = m.getUTCMonth();
  const lastMonthTotal = card
    .filter((r) => r.date.getUTCFullYear() === (mo === 0 ? y - 1 : y) && r.date.getUTCMonth() === (mo + 11) % 12 && r.cents < 0)
    .reduce((sum, r) => sum - r.cents, 0);
  const late = y === 2026 && mo === 1;
  const payDay = day(y, mo, late ? 22 : 14);
  if (late) addCard(day(y, mo, 16), "LATE PAYMENT FEE", "Fees", -2900);
  addCard(payDay, "PAYMENT THANK YOU - WEB", "Payment", lastMonthTotal);
  addChecking(payDay, "SUMMIT CARD AUTOPAY PMT", -lastMonthTotal);
}

// ---- Checking: paychecks, rent, bills ----
for (let d = day(2025, 9, 3); d <= END; d = addDays(d, 14)) {
  addChecking(d, "ACME DESIGN CO PAYROLL DIR DEP", 275000);
}
for (let m = new Date(START); m <= END; m = day(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)) {
  const y = m.getUTCFullYear();
  const mo = m.getUTCMonth();
  addChecking(day(y, mo, 1), "ZELLE TO BROOKLYN HEIGHTS MGMT RENT", -295000);
  addChecking(day(y, mo, 18), "CON ED OF NY ONLINE PMT", -between(70, 160));
  addChecking(day(y, mo, 22), "SPECTRUM INTERNET AUTOPAY", -7999);
  // Investing pauses June through September 2026 to recover from the car repair.
  const paused = y === 2026 && mo >= 5 && mo <= 8;
  if (!paused) addChecking(day(y, mo, 25), "VANGUARD BUY INVESTMENT", -100000);
}
// An unexpected car repair right before payday, which overdraws the account.
addChecking(day(2026, 5, 11), "MIDAS AUTO SERVICE #2214", -815000);

// ---- Work out checking balances and bank fees ----
checking.sort((a, b) => a.date - b.date);
let balance = 300000;
const checkingRows = [];
let lowestThisMonth = balance;
let month = checking[0].date.getUTCMonth();
for (const row of checking) {
  // Monthly fee if the balance dipped under $1,500 last month (see fine print).
  if (row.date.getUTCMonth() !== month) {
    if (lowestThisMonth < 150000) {
      balance -= 1200;
      checkingRows.push({ date: day(row.date.getUTCFullYear(), row.date.getUTCMonth(), 1), description: "MONTHLY MAINTENANCE FEE", cents: -1200, balance });
    }
    month = row.date.getUTCMonth();
    lowestThisMonth = balance;
  }
  balance += row.cents;
  checkingRows.push({ ...row, balance });
  if (balance < 0 && row.cents < 0) {
    balance -= 3500;
    checkingRows.push({ date: row.date, description: "OVERDRAFT FEE", cents: -3500, balance });
  }
  lowestThisMonth = Math.min(lowestThisMonth, balance);
}

// ---- Write the files ----
const money = (cents) => (cents / 100).toFixed(2);
const usDate = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
const isoDate = (d) => d.toISOString().slice(0, 10);
const csvCell = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

mkdirSync(OUT_DIR, { recursive: true });

// "Harbor Bank" checking: US dates, one signed Amount column, running Balance.
writeFileSync(
  `${OUT_DIR}/harbor-bank-checking.csv`,
  ["Date,Description,Amount,Balance", ...checkingRows.map((r) => [usDate(r.date), csvCell(r.description), money(r.cents), money(r.balance)].join(","))].join("\n") + "\n",
);

// "Summit Card" credit card: ISO dates, a category column, and no balance.
card.sort((a, b) => a.date - b.date);
writeFileSync(
  `${OUT_DIR}/summit-card.csv`,
  ["Transaction Date,Post Date,Description,Category,Amount", ...card.map((r) => [isoDate(r.date), isoDate(r.post), csvCell(r.description), r.category, money(r.cents)].join(","))].join("\n") + "\n",
);

console.log(`Wrote ${checkingRows.length} checking rows and ${card.length} card rows to ${OUT_DIR}/`);
