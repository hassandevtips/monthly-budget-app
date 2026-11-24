import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  ensureMonth,
  setTemplate,
  template,
  togglePaid,
  validate,
  readBackup,
} from "../model.js";
test("recurring edits preserve saved months and have an effective start month", () => {
  const db = initial(),
    nov = ensureMonth(db, "2026-11"),
    dec = ensureMonth(db, "2026-12");
  const before = structuredClone(dec);
  setTemplate(
    db,
    "2026-11",
    [{ ...template(db, "2026-11").items[0], amount: 99 }],
    100,
  );
  assert.deepEqual(dec, before);
  assert.equal(ensureMonth(db, "2027-01").items[0].amount, 99);
  assert.equal(ensureMonth(db, "2026-10").salary, 378000);
  assert.equal(nov.salary, 378000);
  validate(db);
});
test("every check and uncheck remains in dated activity", () => {
  const r = ensureMonth(initial(), "2026-11"),
    id = r.items[0].id;
  togglePaid(r, id, true);
  assert.ok(r.items[0].paidAt);
  togglePaid(r, id, false);
  assert.equal(r.items[0].paidAt, null);
  assert.deepEqual(
    r.events.map((e) => e.action),
    ["Marked paid", "Marked unpaid"],
  );
  assert.ok(r.events.every((e) => Number.isFinite(Date.parse(e.at))));
});
test("backup roundtrip preserves history and rejects corrupt amounts", () => {
  const db = initial();
  ensureMonth(db, "2026-11");
  assert.deepEqual(readBackup(JSON.parse(JSON.stringify(db))), db);
  db.months["2026-11"].items[0].amount = -1;
  assert.throws(() => readBackup(db));
});
test("legacy migration preserves names, amounts, paid flags without inventing dates", () => {
  const db = readBackup({
    salary: 378000,
    months: {
      "2026-10": {
        fixed: [{ name: "Rent", amount: 50000, paid: true }],
        flex: [],
      },
    },
  });
  const i = db.months["2026-10"].items[0];
  assert.equal(i.name, "Rent");
  assert.equal(i.amount, 50000);
  assert.equal(i.paid, true);
  assert.equal(i.paidAt, null);
});
