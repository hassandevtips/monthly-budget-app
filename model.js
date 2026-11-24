export const uid = () => globalThis.crypto.randomUUID();
export const localMonth = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const money = (n) => Number.isFinite(n) && n >= 0 && n <= 1e12;
const fixed = [
  ["Piya Masi", 15000],
  ["Household + milk", 65500],
  ["Car installment", 91000],
  ["House rent", 50000],
  ["Electricity & bills", 10000],
  ["Usman", 36000],
  ["Nadir", 15000],
  ["Internet", 4000],
  ["Samra", 20000],
  ["Committee", 20000],
];
const flex = [
  ["Car petrol", 0],
  ["Emergency fund", 15000],
  ["Guests / hospitality", 25000],
  ["Other expenses", 0],
];
export function initial() {
  return {
    version: 2,
    months: {},
    revisions: [
      {
        from: "0001-01",
        salary: 378000,
        items: [
          ...fixed.map(([name, amount]) => ({
            id: uid(),
            name,
            amount,
            category: "fixed",
            dueDay: 0,
          })),
          ...flex.map(([name, amount]) => ({
            id: uid(),
            name,
            amount,
            category: "flex",
            dueDay: 0,
          })),
        ],
      },
    ],
  };
}
export function template(db, m) {
  return [...db.revisions]
    .sort((a, b) => a.from.localeCompare(b.from))
    .filter((r) => r.from <= m)
    .at(-1);
}
export function ensureMonth(db, m) {
  if (!validMonth(m)) throw Error("Choose a valid month.");
  if (!db.months[m]) {
    const t = template(db, m);
    db.months[m] = {
      salary: t.salary,
      items: t.items.map((i) => ({
        ...i,
        templateId: i.id,
        paid: false,
        paidAt: null,
      })),
      events: [],
    };
  }
  return db.months[m];
}
export function setTemplate(db, m, items, salary) {
  db.revisions = db.revisions.filter((r) => r.from !== m);
  db.revisions.push({ from: m, salary, items: structuredClone(items) });
}
export function record(rec, action, item, detail = "") {
  rec.events.push({
    id: uid(),
    at: new Date().toISOString(),
    action,
    name: item?.name || "Monthly income",
    detail,
  });
}
export function togglePaid(rec, id, value) {
  const i = rec.items.find((i) => i.id === id);
  i.paid = value;
  i.paidAt = value ? new Date().toISOString() : null;
  record(rec, value ? "Marked paid" : "Marked unpaid", i);
}
export function validate(db) {
  if (
    !db ||
    db.version !== 2 ||
    !db.months ||
    typeof db.months !== "object" ||
    Array.isArray(db.months) ||
    !Array.isArray(db.revisions) ||
    !db.revisions.length
  )
    throw Error("Invalid budget backup.");
  const checkItems = (items) => {
    if (!Array.isArray(items) || items.length > 10000)
      throw Error("Invalid expenses.");
    const ids = new Set();
    for (const i of items) {
      if (
        !i ||
        typeof i.id !== "string" ||
        ids.has(i.id) ||
        typeof i.name !== "string" ||
        !i.name.trim() ||
        i.name.length > 120 ||
        !money(i.amount) ||
        !["fixed", "flex"].includes(i.category) ||
        !Number.isInteger(i.dueDay) ||
        i.dueDay < 0 ||
        i.dueDay > 31
      )
        throw Error("Invalid expense data.");
      ids.add(i.id);
    }
  };
  const dates = new Set();
  for (const r of db.revisions) {
    if (!validMonth(r.from) || dates.has(r.from) || !money(r.salary))
      throw Error("Invalid recurring plan.");
    dates.add(r.from);
    checkItems(r.items);
  }
  if (!db.revisions.some((r) => r.from === "0001-01"))
    throw Error("Missing initial plan.");
  for (const [m, r] of Object.entries(db.months)) {
    if (!validMonth(m) || !money(r.salary) || !Array.isArray(r.events))
      throw Error("Invalid monthly record.");
    checkItems(r.items);
    for (const i of r.items)
      if (
        typeof i.paid !== "boolean" ||
        (i.paidAt !== null && !Number.isFinite(Date.parse(i.paidAt)))
      )
        throw Error("Invalid payment date.");
    for (const e of r.events)
      if (
        !e ||
        typeof e.name !== "string" ||
        typeof e.action !== "string" ||
        typeof e.detail !== "string" ||
        !Number.isFinite(Date.parse(e.at))
      )
        throw Error("Invalid activity.");
  }
  return db;
}
export function migrateLegacy(months, salary = 378000) {
  const db = initial();
  for (const [m, r] of Object.entries(months)) {
    if (
      !validMonth(m) ||
      !r ||
      !Array.isArray(r.fixed) ||
      !Array.isArray(r.flex)
    )
      throw Error("Invalid legacy record.");
    db.months[m] = {
      salary,
      items: ["fixed", "flex"].flatMap((group) =>
        r[group].map((i) => ({
          id: uid(),
          name: i.name,
          amount: Number(i.amount),
          category: group,
          dueDay: 0,
          paid: !!i.paid,
          paidAt: null,
        })),
      ),
      events: [],
    };
  }
  return validate(db);
}
export function readBackup(input) {
  if (input?.version === 2) return validate(input);
  if (input?.months) return migrateLegacy(input.months, input.salary ?? 378000);
  throw Error("This is not a budget backup.");
}
