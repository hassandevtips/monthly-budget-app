import {
  uid,
  localMonth,
  validMonth,
  money,
  initial,
  ensureMonth,
  template,
  setTemplate,
  record,
  togglePaid,
  validate,
  migrateLegacy,
  readBackup,
} from "./model.js";
const $ = (s) => document.querySelector(s),
  KEY = "my-budget-v2-data",
  PIN = "budget-app-pin-v1";
const fmt = (n) =>
  "Rs. " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
const date = (s) =>
  new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
let db,
  stored,
  selected = localMonth(),
  filter = "all",
  editing = null,
  scope = "month",
  allActivity = false,
  toastTimer,
  hiddenAt = 0;
$("#month").value = selected;
function notify(message) {
  $("#status").textContent = message;
  $("#status").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#status").classList.add("hidden"), 4500);
}
function storageError(e) {
  $("#storageError").classList.remove("hidden");
  $("#storageError").textContent =
    `Your latest change was not saved: ${e.message}. Free storage or reopen the app. Existing data has been kept.`;
}
function initialize() {
  stored = localStorage.getItem(KEY);
  if (stored) {
    db = validate(JSON.parse(stored));
  } else {
    const legacy = {};
    for (const k of Object.keys(localStorage))
      if (/^budget-v1-\d{4}-\d{2}$/.test(k))
        legacy[k.slice(10)] = JSON.parse(localStorage.getItem(k));
    db = Object.keys(legacy).length ? migrateLegacy(legacy) : initial();
  }
  return mutate((d) => ensureMonth(d, selected));
}
function mutate(fn) {
  try {
    if (localStorage.getItem(KEY) !== stored)
      throw Error("Records changed in another tab; reload before editing");
    const draft = structuredClone(db);
    fn(draft);
    validate(draft);
    const next = JSON.stringify(draft);
    localStorage.setItem(KEY, next);
    stored = next;
    db = draft;
    $("#storageError").classList.add("hidden");
    return true;
  } catch (e) {
    storageError(e);
    return false;
  }
}
const rec = () => db.months[selected];
function button(text, fn, cls = "compact") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.className = cls;
  b.onclick = fn;
  return b;
}
function empty(box, text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  box.append(p);
}
function dueDate(i) {
  if (!i.dueDay) return null;
  const [y, m] = selected.split("-").map(Number);
  return new Date(
    y,
    m - 1,
    Math.min(i.dueDay, new Date(y, m, 0).getDate()),
    23,
    59,
    59,
  );
}
const overdue = (i) => !i.paid && dueDate(i) && dueDate(i) < new Date();
function renderRow(i) {
  const row = document.createElement("div");
  row.className = "item" + (i.paid ? " paid" : "");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = i.paid;
  cb.setAttribute("aria-label", `Mark ${i.name} paid`);
  cb.onchange = () => {
    mutate((d) => togglePaid(d.months[selected], i.id, cb.checked));
    render();
  };
  const name = document.createElement("div");
  name.className = "name";
  const b = document.createElement("b");
  b.textContent = i.name;
  const sm = document.createElement("small");
  sm.textContent = i.paid
    ? i.paidAt
      ? `Paid ${date(i.paidAt)}`
      : "Paid · date unavailable (older record)"
    : (overdue(i) ? "Overdue · " : "") +
      (i.dueDay
        ? `Due ${dueDate(i).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : "Mark when paid");
  name.append(b, sm);
  const amount = document.createElement("strong");
  amount.textContent = fmt(i.amount);
  amount.style.fontSize = "14px";
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const hint = document.createElement("small");
  hint.textContent = i.templateId ? "From recurring plan" : "This month only";
  actions.append(
    hint,
    button("Edit", () => openEditor("month", i)),
    button("Remove", () => removeExpense(i), "compact danger"),
  );
  row.append(cb, name, amount, actions);
  return row;
}
function render() {
  if (!db) return;
  const r = rec(),
    items = r.items,
    planned = items.reduce((s, i) => s + i.amount, 0),
    paid = items.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0),
    count = items.filter((i) => i.paid).length;
  $("#salary").value = r.salary;
  for (const [id, value] of [
    ["plannedLeft", r.salary - planned],
    ["cashLeft", r.salary - paid],
    ["plannedTotal", planned],
    ["paidTotal", paid],
  ]) {
    $("#" + id).textContent = fmt(value);
    $("#" + id).className =
      "value " +
      (value < 0
        ? "red"
        : id === "plannedLeft"
          ? "green"
          : id === "cashLeft"
            ? "blue"
            : "");
  }
  const pct = items.length ? Math.round((count / items.length) * 100) : 0;
  $("#progress").style.width = pct + "%";
  $("#progressTrack").setAttribute("aria-valuenow", pct);
  $("#progressText").textContent = `${count} of ${items.length} marked paid`;
  const late = items.filter(overdue).length;
  $("#smartNote").textContent =
    `${fmt(planned - paid)} still unpaid` +
    (late ? ` · ${late} overdue` : "") +
    (r.salary < planned ? " · Your plan exceeds your income." : "") +
    (!items.length ? " · Add your first expense." : "");
  for (const category of ["fixed", "flex"]) {
    const box = $("#" + category + "List");
    box.replaceChildren();
    const list = items
      .filter((i) => i.category === category)
      .filter(
        (i) =>
          filter === "all" ||
          (filter === "paid" && i.paid) ||
          (filter === "unpaid" && !i.paid) ||
          (filter === "overdue" && overdue(i)),
      );
    list.forEach((i) => box.append(renderRow(i)));
    if (!list.length)
      empty(
        box,
        "No " +
          (filter === "all" ? "expenses" : filter + " expenses") +
          " here.",
      );
  }
  const t = template(db, selected);
  $("#recurringSummary").textContent =
    `${t.items.length} recurring expenses · ${fmt(t.items.reduce((s, i) => s + i.amount, 0))} planned`;
  const history = $("#historyList");
  history.replaceChildren();
  Object.keys(db.months)
    .sort()
    .reverse()
    .forEach((m) => {
      const r = db.months[m];
      const b = button("", () => switchMonth(m), "historyrow");
      const label = document.createElement("span");
      label.textContent = m + (m === selected ? " · Selected" : "");
      const value = document.createElement("span");
      value.textContent = `${fmt(r.items.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0))} paid / ${fmt(r.items.reduce((s, i) => s + i.amount, 0))}`;
      b.append(label, value);
      history.append(b);
    });
  const activity = $("#activityList");
  activity.replaceChildren();
  const events = [...r.events].reverse();
  (allActivity ? events : events.slice(0, 12)).forEach((e) => {
    const p = document.createElement("div");
    p.className = "activity";
    p.textContent = `${e.action} · ${e.name}`;
    const small = document.createElement("small");
    small.textContent = date(e.at) + (e.detail ? " · " + e.detail : "");
    p.append(small);
    activity.append(p);
  });
  if (!events.length) empty(activity, "No activity yet for this month.");
  $("#moreActivity").classList.toggle(
    "hidden",
    allActivity || events.length <= 12,
  );
  if ($("#recurringDialog").open) renderRecurring();
}
function switchMonth(m) {
  if (!validMonth(m)) {
    $("#month").value = selected;
    return;
  }
  if (mutate((d) => ensureMonth(d, m))) {
    selected = m;
    $("#month").value = m;
    allActivity = false;
  } else $("#month").value = selected;
  render();
}
$("#month").onchange = (e) => switchMonth(e.target.value);
for (const b of document.querySelectorAll("[data-filter]"))
  b.onclick = () => {
    filter = b.dataset.filter;
    for (const x of document.querySelectorAll("[data-filter]"))
      x.setAttribute("aria-pressed", String(x === b));
    render();
  };
$("#moreActivity").onclick = () => {
  allActivity = true;
  render();
};
function confirmAction(title, text, yes) {
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  $("#confirmYes").onclick = () => {
    $("#confirmDialog").close();
    yes();
  };
  $("#confirmDialog").showModal();
}
$("#confirmCancel").onclick = () => $("#confirmDialog").close();
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => $("#" + b.dataset.close).close();
function openEditor(where, item = null) {
  scope = where;
  editing = item?.id || null;
  $("#expenseForm").reset();
  $("#editorTitle").textContent =
    (item ? "Edit" : "Add") +
    (where === "plan" ? " recurring expense" : " expense");
  $("#expenseName").value = item?.name || "";
  $("#expenseAmount").value = item?.amount ?? "";
  $("#expenseCategory").value = item?.category || "flex";
  $("#expenseDue").value = item?.dueDay || "";
  $("#repeatLabel").classList.toggle("hidden", !!item || where === "plan");
  $("#editScope").textContent =
    where === "plan"
      ? `Applies from ${selected} to future unsaved months. Saved months keep their existing expenses.`
      : "Changes affect only " +
        selected +
        ". Manage the recurring plan separately to change future months.";
  $("#editor").showModal();
}
$("#addExpense").onclick = () => openEditor("month");
$("#addRecurring").onclick = () => openEditor("plan");
$("#expenseForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("#expenseName").value.trim(),
    amount = Number($("#expenseAmount").value),
    category = $("#expenseCategory").value,
    dueDay = Number($("#expenseDue").value) || 0;
  if (
    !name ||
    !money(amount) ||
    !Number.isInteger(dueDay) ||
    dueDay < 0 ||
    dueDay > 31
  )
    return;
  const repeat = !editing && scope === "month" && $("#expenseRepeat").checked;
  const ok = mutate((d) => {
    const fields = { name, amount, category, dueDay };
    const r = d.months[selected];
    if (scope === "plan") {
      const t = structuredClone(template(d, selected));
      if (editing)
        Object.assign(
          t.items.find((i) => i.id === editing),
          fields,
        );
      else t.items.push({ id: uid(), ...fields });
      setTemplate(d, selected, t.items, t.salary);
      record(
        r,
        editing ? "Updated recurring expense" : "Added recurring expense",
        fields,
        `Effective ${selected}; saved months unchanged`,
      );
    } else {
      if (editing) {
        const i = r.items.find((i) => i.id === editing);
        const before = `${i.name}, ${fmt(i.amount)}`;
        Object.assign(i, fields);
        record(r, "Edited expense", i, `${before} → ${name}, ${fmt(amount)}`);
      } else {
        const id = uid();
        r.items.push({
          id,
          ...fields,
          paid: false,
          paidAt: null,
          ...(repeat ? { templateId: id } : {}),
        });
        record(r, "Added expense", fields);
        if (repeat) {
          const t = template(d, selected);
          setTemplate(d, selected, [...t.items, { id, ...fields }], t.salary);
          record(r, "Added recurring expense", fields, `Effective ${selected}`);
        }
      }
    }
  });
  if (ok) {
    $("#editor").close();
    render();
    notify("Expense saved.");
  }
};
function removeExpense(i) {
  confirmAction(
    "Remove this expense?",
    `Remove “${i.name}” from ${selected}? Its past activity stays in the history. The recurring plan is unchanged.`,
    () => {
      if (
        mutate((d) => {
          const r = d.months[selected];
          r.items = r.items.filter((x) => x.id !== i.id);
          record(r, "Removed expense", i, fmt(i.amount));
        })
      ) {
        render();
        notify("Expense removed.");
      }
    },
  );
}
function renderRecurring() {
  const box = $("#recurringList");
  box.replaceChildren();
  $("#planHelp").textContent =
    `Effective from ${selected}. Changes apply to unsaved months only. To change an existing month, edit its checklist.`;
  template(db, selected).items.forEach((i) => {
    const row = document.createElement("div");
    row.className = "item";
    const label = document.createElement("div");
    label.className = "name";
    label.textContent = `${i.name} · ${fmt(i.amount)}`;
    row.append(
      label,
      button("Edit", () => openEditor("plan", i)),
      button(
        "Remove",
        () =>
          confirmAction(
            "Stop recurring expense?",
            `Remove “${i.name}” from the plan effective ${selected}? All saved months remain unchanged.`,
            () => {
              if (
                mutate((d) => {
                  const t = template(d, selected);
                  setTemplate(
                    d,
                    selected,
                    t.items.filter((x) => x.id !== i.id),
                    t.salary,
                  );
                  record(
                    d.months[selected],
                    "Removed recurring expense",
                    i,
                    `Effective ${selected}`,
                  );
                })
              ) {
                render();
                notify("Recurring plan updated.");
              }
            },
          ),
        "compact danger",
      ),
    );
    box.append(row);
  });
  if (!box.children.length)
    empty(box, "No recurring expenses. Add one to start your monthly plan.");
}
$("#manageRecurring").onclick = () => {
  renderRecurring();
  $("#recurringDialog").showModal();
};
$("#salary").onchange = (e) => {
  if (
    !e.target.checkValidity() ||
    !money(Number(e.target.value)) ||
    !e.target.value
  ) {
    render();
    return;
  }
  const value = Number(e.target.value);
  if (value === rec().salary) return;
  mutate((d) => {
    const r = d.months[selected];
    const old = r.salary;
    r.salary = value;
    record(r, "Changed income", null, `${fmt(old)} → ${fmt(value)}`);
  });
  render();
};
$("#incomeDefault").onclick = () =>
  confirmAction(
    "Update future income?",
    `Use ${fmt(rec().salary)} from ${selected} for future unsaved months? Saved months are unchanged.`,
    () => {
      if (
        mutate((d) => {
          const t = template(d, selected);
          setTemplate(d, selected, t.items, d.months[selected].salary);
          record(
            d.months[selected],
            "Updated recurring income",
            null,
            fmt(d.months[selected].salary),
          );
        })
      ) {
        render();
        notify("Future income updated.");
      }
    },
  );
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#export").onclick = () =>
  download(
    { ...db, exportedAt: new Date().toISOString() },
    `my-budget-${localMonth()}-backup.json`,
  );
$("#import").onclick = () => $("#backupFile").click();
$("#backupFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024)
      throw Error("Backup is too large (maximum 20 MB).");
    const next = readBackup(JSON.parse(await file.text()));
    confirmAction(
      "Restore this backup?",
      `Replace your current records with ${Object.keys(next.months).length} month(s) from this backup? Export your current records first if you need them. Your PIN stays unchanged.`,
      () => {
        if (
          mutate((d) => {
            Object.keys(d).forEach((k) => delete d[k]);
            Object.assign(d, next);
            ensureMonth(d, selected);
          })
        ) {
          render();
          notify("Backup restored.");
        }
      },
    );
  } catch (err) {
    notify("Restore failed: " + err.message);
  }
};
$("#copy").onclick = async () => {
  const r = rec(),
    txt =
      `MONTHLY BUDGET ${selected}\nIncome: ${fmt(r.salary)}\n` +
      r.items
        .map(
          (i) =>
            `${i.paid ? "[x]" : "[ ]"} ${i.name}: ${fmt(i.amount)}${i.paidAt ? " · Paid " + date(i.paidAt) : ""}`,
        )
        .join("\n") +
      `\nPlanned: ${fmt(r.items.reduce((s, i) => s + i.amount, 0))}\nPaid: ${fmt(r.items.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0))}`;
  try {
    await navigator.clipboard.writeText(txt);
    notify("Summary copied.");
  } catch {
    notify("Clipboard unavailable. Please export a backup instead.");
  }
};
async function digest(pin) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin),
  );
  return [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function lock() {
  for (const dialog of document.querySelectorAll("dialog[open]"))
    dialog.close();
  $("#lockScreen").classList.remove("hidden");
  $("#app").classList.add("hidden");
  $("#pinInput").value = "";
  $("#lockError").textContent = "";
  try {
    const exists = !!localStorage.getItem(PIN);
    $("#lockMessage").textContent = exists
      ? "Enter your PIN to view your monthly records."
      : "Choose a 4–6 digit PIN for this device. There is no PIN recovery; keep it safe.";
    $("#unlockBtn").textContent = exists ? "Unlock" : "Set PIN";
  } catch (e) {
    storageError(e);
  }
  $("#pinInput").focus();
}
$("#unlockForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const pin = $("#pinInput").value;
    if (!/^\d{4,6}$/.test(pin)) return;
    const hash = await digest(pin),
      saved = localStorage.getItem(PIN);
    if (saved && saved !== hash) {
      $("#lockError").textContent = "Incorrect PIN. Try again.";
      return;
    }
    if (!saved) localStorage.setItem(PIN, hash);
    if (!initialize()) return;
    $("#lockScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#pinInput").value = "";
    render();
  } catch (err) {
    $("#lockError").textContent =
      "Unable to open saved records: " + err.message;
  }
};
$("#lockNow").onclick = lock;
$("#changePin").onclick = () => {
  $("#pinForm").reset();
  $("#pinError").textContent = "";
  $("#pinDialog").showModal();
};
$("#pinForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    if ((await digest($("#oldPin").value)) !== localStorage.getItem(PIN)) {
      $("#pinError").textContent = "Current PIN is incorrect.";
      return;
    }
    localStorage.setItem(PIN, await digest($("#newPin").value));
    $("#pinDialog").close();
    notify("PIN changed.");
  } catch (err) {
    $("#pinError").textContent = err.message;
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60000) lock();
});
window.addEventListener("pagehide", lock);
window.addEventListener("storage", (e) => {
  if (e.key === KEY || e.key === PIN || e.key === null) lock();
});
let installEvent;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("#install").classList.remove("hidden");
});
$("#install").onclick = async () => {
  if (!installEvent) return;
  await installEvent.prompt();
  installEvent = null;
  $("#install").classList.add("hidden");
};
lock();
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() =>
      notify("Offline installation is unavailable in this browser."),
    );
