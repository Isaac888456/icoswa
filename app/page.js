"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const now = new Date();
const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const money = (n) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(
    Number(n) || 0,
  );
const id = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const monthLabel = (p) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const initial = () => ({
  version: 2,
  settings: {
    association: "ICOSWA",
    school: "Ideal College",
    monthlyDues: 50,
    effectiveFrom: ym(now.getFullYear(), 1),
    receiptPrefix: "ICOSWA",
    nextReceipt: 1,
    treasurer: "",
    rates: [{ effectiveFrom: ym(now.getFullYear(), 1), amount: 50 }],
  },
  teachers: [],
  payments: [],
  allocations: [],
  audit: [],
});
function rateFor(settings, period) {
  const rates = [...(settings.rates || [])]
    .filter((r) => r.effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (!rates.length) return Number(settings.monthlyDues) || 0;
  let chosen = rates[0];
  for (const r of rates) {
    if (r.effectiveFrom <= period) chosen = r;
    else break;
  }
  return Number(chosen.amount) || 0;
}
function App() {
  const [data, setData] = useState(initial);
  const [page, setPage] = useState("Dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ text: "", type: "" });
  const [dbError, setDbError] = useState("");
  const [teacherForm, setTeacherForm] = useState({
    name: "",
    staffId: "",
    department: "",
    phone: "",
  });
  const [pay, setPay] = useState({
    teacherId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    period: ym(now.getFullYear(), now.getMonth() + 1),
    method: "Physical cash",
    notes: "",
  });
  const [filter, setFilter] = useState(
    ym(now.getFullYear(), now.getMonth() + 1),
  );
  const [search, setSearch] = useState("");
  const [rateForm, setRateForm] = useState({
    effectiveFrom: ym(now.getFullYear(), 1),
    amount: "50",
  });
  const [showInactive, setShowInactive] = useState(false);
  const notify = (text, type = "success") => {
    setNotice({ text, type });
    setTimeout(() => setNotice({ text: "", type: "" }), 4200);
  };
  useEffect(() => {
    fetch("/api/state")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Database unavailable");
        setData({
          ...initial(),
          ...d,
          settings: { ...initial().settings, ...d.settings },
        });
        setDbError("");
      })
      .catch((e) => setDbError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const save = useCallback(async (next) => {
    setSaving(true);
    try {
      const r = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "Save failed");
      setData(next);
      setDbError("");
      return true;
    } catch (e) {
      setDbError(e.message);
      notify(e.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);
  const teacherById = useCallback(
    (tid) => data.teachers.find((t) => t.id === tid),
    [data.teachers],
  );
  const allocationsFor = useCallback(
    (tid, period) =>
      data.allocations
        .filter(
          (a) => a.teacherId === tid && a.period === period && !a.reversed,
        )
        .reduce((s, a) => s + Number(a.amount || 0), 0),
    [data.allocations],
  );
  const obligation = useCallback(
    (tid, period) => {
      const t = teacherById(tid);
      if (!t || t.status === "inactive")
        return { expected: 0, paid: 0, balance: 0, status: "Inactive" };
      const expected = rateFor(data.settings, period);
      const paid = allocationsFor(tid, period);
      const balance = Math.max(0, expected - paid);
      return {
        expected,
        paid,
        balance,
        status:
          expected === 0
            ? "No rate"
            : balance < 0.005
              ? "Paid"
              : paid > 0
                ? "Part-paid"
                : "Unpaid",
      };
    },
    [data.settings, teacherById, allocationsFor],
  );
  const activeTeachers = data.teachers.filter((t) => t.status !== "inactive");
  const monthRows = useMemo(
    () =>
      activeTeachers.map((t) => ({ teacher: t, ...obligation(t.id, filter) })),
    [activeTeachers, obligation, filter],
  );
  const totalExpected = monthRows.reduce((s, r) => s + r.expected, 0),
    totalPaid = monthRows.reduce((s, r) => s + r.paid, 0),
    totalBalance = monthRows.reduce((s, r) => s + r.balance, 0);
  const received = data.payments
    .filter((p) => !p.reversed)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const filteredPayments = [...data.payments]
    .filter((p) => {
      const t = teacherById(p.teacherId);
      const a = data.allocations.find((x) => x.paymentId === p.id);
      return (
        (!search ||
          [p.receiptNo, t?.name, t?.staffId].some((x) =>
            String(x || "")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )) &&
        (!filter || a?.period === filter)
      );
    })
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  async function addTeacher(e) {
    e.preventDefault();
    if (!teacherForm.name.trim() || !teacherForm.staffId.trim())
      return notify("Teacher name and staff ID are required.", "error");
    if (
      data.teachers.some(
        (t) =>
          t.staffId.toLowerCase() === teacherForm.staffId.trim().toLowerCase(),
      )
    )
      return notify("That staff ID already exists.", "error");
    const next = {
      ...data,
      teachers: [
        ...data.teachers,
        {
          ...teacherForm,
          id: id(),
          name: teacherForm.name.trim(),
          staffId: teacherForm.staffId.trim(),
          status: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      audit: [
        ...data.audit,
        {
          id: id(),
          action: "teacher_added",
          at: new Date().toISOString(),
          detail: teacherForm.staffId,
        },
      ],
    };
    if (await save(next)) {
      setTeacherForm({ name: "", staffId: "", department: "", phone: "" });
      notify("Teacher added successfully.");
    }
  }
  async function toggleTeacher(t) {
    const next = {
      ...data,
      teachers: data.teachers.map((x) =>
        x.id === t.id
          ? { ...x, status: x.status === "inactive" ? "active" : "inactive" }
          : x,
      ),
      audit: [
        ...data.audit,
        {
          id: id(),
          action: "teacher_status_changed",
          at: new Date().toISOString(),
          detail: t.staffId,
        },
      ],
    };
    if (await save(next)) notify("Teacher status updated.");
  }
  async function recordPayment(e) {
    e.preventDefault();
    const t = teacherById(pay.teacherId),
      amount = Number(pay.amount),
      period = pay.period;
    if (!t || t.status === "inactive")
      return notify("Select an active teacher.", "error");
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 100) !== amount * 100
    )
      return notify(
        "Enter an amount greater than zero with up to two decimal places.",
        "error",
      );
    if (!pay.date) return notify("Select the actual payment date.", "error");
    const o = obligation(t.id, period);
    if (o.expected <= 0)
      return notify(
        "No dues rate is configured for this month. Add a rate in Settings.",
        "error",
      );
    if (amount > o.balance + 0.001)
      return notify(
        `Amount exceeds the remaining balance of ${money(o.balance)} for ${monthLabel(period)}.`,
        "error",
      );
    const prefix =
      (data.settings.receiptPrefix || "ICOSWA")
        .replace(/[^a-z0-9-]/gi, "")
        .slice(0, 12) || "ICOSWA";
    const receiptNo = `${prefix}-${String(data.settings.nextReceipt || 1).padStart(5, "0")}`;
    if (data.payments.some((p) => p.receiptNo === receiptNo))
      return notify("Receipt number conflict. Please check settings.", "error");
    const payment = {
      id: id(),
      receiptNo,
      teacherId: t.id,
      amount: Math.round(amount * 100) / 100,
      date: pay.date,
      method: pay.method,
      notes: pay.notes.trim(),
      createdAt: new Date().toISOString(),
      reversed: false,
    };
    const next = {
      ...data,
      payments: [...data.payments, payment],
      allocations: [
        ...data.allocations,
        {
          id: id(),
          paymentId: payment.id,
          teacherId: t.id,
          period,
          amount: payment.amount,
          reversed: false,
        },
      ],
      settings: {
        ...data.settings,
        nextReceipt: Number(data.settings.nextReceipt || 1) + 1,
      },
      audit: [
        ...data.audit,
        {
          id: id(),
          action: "payment_recorded",
          at: new Date().toISOString(),
          detail: `${receiptNo}; ${period}; ${amount}; ${pay.method}`,
        },
      ],
    };
    if (await save(next)) {
      notify(`Payment recorded. Receipt ${receiptNo}.`);
      setPay((p) => ({ ...p, amount: "", notes: "" }));
      setPage("Payments");
    }
  }
  async function reversePayment(p) {
    const reason = prompt(`Reason for reversing ${p.receiptNo}:`);
    if (!reason || reason.trim().length < 4)
      return notify(
        "Enter a reversal reason of at least four characters.",
        "error",
      );
    if (
      !confirm(
        `Reverse ${p.receiptNo} for ${money(p.amount)}? The transaction will remain in the audit history.`,
      )
    )
      return;
    const next = {
      ...data,
      payments: data.payments.map((x) =>
        x.id === p.id
          ? {
              ...x,
              reversed: true,
              reversedAt: new Date().toISOString(),
              reversalReason: reason.trim(),
            }
          : x,
      ),
      allocations: data.allocations.map((a) =>
        a.paymentId === p.id ? { ...a, reversed: true } : a,
      ),
      audit: [
        ...data.audit,
        {
          id: id(),
          action: "payment_reversed",
          at: new Date().toISOString(),
          detail: `${p.receiptNo}: ${reason.trim()}`,
        },
      ],
    };
    if (await save(next))
      notify("Payment reversed; original record preserved.");
  }
  async function saveSettings(e) {
    e.preventDefault();
    const rates = [...(data.settings.rates || [])].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    if (
      !rates.length ||
      rates.some(
        (r) =>
          !/^\d{4}-\d{2}$/.test(r.effectiveFrom) ||
          Number(r.amount) < 0 ||
          !Number.isFinite(Number(r.amount)),
      )
    )
      return notify(
        "Add valid effective months and non-negative dues amounts.",
        "error",
      );
    if (new Set(rates.map((r) => r.effectiveFrom)).size !== rates.length)
      return notify("Each rate must have a unique effective month.", "error");
    const next = {
      ...data,
      settings: {
        ...data.settings,
        rates,
        monthlyDues: Number(rates[rates.length - 1].amount),
        effectiveFrom: rates[0].effectiveFrom,
      },
    };
    if (await save(next)) notify("Settings and dues rates saved.");
  }
  async function addRate() {
    if (
      !/^\d{4}-\d{2}$/.test(rateForm.effectiveFrom) ||
      Number(rateForm.amount) < 0 ||
      rateForm.amount === ""
    )
      return notify("Enter a valid month and amount.", "error");
    if (
      data.settings.rates.some(
        (r) => r.effectiveFrom === rateForm.effectiveFrom,
      )
    )
      return notify(
        "A rate already exists for that month. Edit the existing rate instead.",
        "error",
      );
    const next = {
      ...data,
      settings: {
        ...data.settings,
        rates: [
          ...data.settings.rates,
          {
            effectiveFrom: rateForm.effectiveFrom,
            amount: Number(rateForm.amount),
          },
        ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
      },
    };
    if (await save(next)) {
      notify("Rate added. Save settings to confirm your schedule.");
    }
  }
  async function updateRate(period, amount) {
    const next = {
      ...data,
      settings: {
        ...data.settings,
        rates: data.settings.rates.map((r) =>
          r.effectiveFrom === period ? { ...r, amount: Number(amount) } : r,
        ),
      },
    };
    setData(next);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `icoswa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importBackup(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (
        !Array.isArray(d.teachers) ||
        !Array.isArray(d.payments) ||
        !Array.isArray(d.allocations)
      )
        throw new Error("This is not a valid ICOSWA backup.");
      if (
        !confirm(
          "Importing replaces the current ICOSWA data in MongoDB. Continue only if you have a backup.",
        )
      )
        return;
      const next = {
        ...initial(),
        ...d,
        settings: { ...initial().settings, ...d.settings },
      };
      if (await save(next)) notify("Backup imported.");
    } catch (err) {
      notify(err.message || "Could not read backup file.", "error");
    } finally {
      e.target.value = "";
    }
  }
  function exportCSV() {
    const rows = [
      [
        "Receipt",
        "Payment date",
        "Teacher",
        "Staff ID",
        "Dues month",
        "Amount (GHS)",
        "Method",
        "Status",
        "Reversal reason",
      ],
      ...data.payments.map((p) => {
        const t = teacherById(p.teacherId),
          a = data.allocations.find((x) => x.paymentId === p.id);
        return [
          p.receiptNo,
          p.date,
          t?.name || "",
          t?.staffId || "",
          a?.period || "",
          p.amount,
          p.method,
          p.reversed ? "Reversed" : "Received",
          p.reversalReason || "",
        ];
      }),
    ];
    const csv = rows
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = "icoswa-payment-history.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (loading)
    return (
      <main className="loading">
        <div className="spinner" />
        Connecting to ICOSWA database…
      </main>
    );
  const nav = [
    "Dashboard",
    "Teachers",
    "Monthly Dues",
    "Record Payment",
    "Payments",
    "Reports",
    "Settings & Backup",
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/assets/school-logo.jpeg" alt="Ideal College logo" />
          <div>
            <strong>ICOSWA</strong>
            <span>Dues Management</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n}
              className={page === n ? "active" : ""}
              onClick={() => setPage(n)}
            >
              <span className="navicon">
                {["⌂", "♙", "▦", "＋", "↻", "▤", "⚙"][i]}
              </span>
              {n}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className={`dot ${dbError ? "red" : ""}`} />
          <div>
            <b>{dbError ? "Database issue" : "MongoDB connected"}</b>
            <small>ICOSWA • Admin workspace</small>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              IDEAL COLLEGE STAFF WELFARE ASSOCIATION
            </div>
            <h1>{page}</h1>
          </div>
          <div className="top-actions">
            <span className="today">
              {new Date().toLocaleDateString("en-GH", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              className="primary"
              onClick={() => setPage("Record Payment")}
            >
              ＋ Record payment
            </button>
          </div>
        </header>
        {dbError && (
          <div className="alert error">
            <b>Database connection problem</b>
            <span>
              {dbError} Ensure MongoDB is configured before using this system.
            </span>
            <button onClick={() => location.reload()}>Retry</button>
          </div>
        )}
        {notice.text && (
          <div
            className={`toast ${notice.type === "error" ? "toast-error" : ""}`}
          >
            {notice.type === "error" ? "⚠" : "✓"} {notice.text}
          </div>
        )}
        {page === "Dashboard" && (
          <>
            <div className="welcome">
              <div>
                <span className="welcome-tag">ASSOCIATION OVERVIEW</span>
                <h2>Welcome to ICOSWA</h2>
                <p>
                  Track teachers' contributions, monthly obligations and payment
                  records in one place.
                </p>
              </div>
              <div className="welcome-mark">ICOSWA</div>
            </div>
            <div className="stats">
              <Stat
                title="Active teachers"
                value={activeTeachers.length}
                sub={`${data.teachers.length - activeTeachers.length} inactive`}
                icon="♙"
              />
              <Stat
                title="Collected to date"
                value={money(received)}
                sub={`${data.payments.filter((p) => !p.reversed).length} successful transactions`}
                icon="₵"
              />
              <Stat
                title={`Expected • ${monthLabel(filter)}`}
                value={money(totalExpected)}
                sub="Current month obligations"
                icon="▦"
              />
              <Stat
                title="Outstanding this month"
                value={money(totalBalance)}
                sub={`${monthRows.filter((r) => r.balance > 0).length} teachers with balances`}
                icon="◷"
              />
            </div>
            <div className="section-head">
              <div>
                <h2>Monthly collection overview</h2>
                <p>
                  Choose any month to review historical obligations and arrears.
                </p>
              </div>
              <input
                type="month"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="overview-grid">
              <div className="panel">
                <div className="panel-head">
                  <h3>Collection progress</h3>
                  <span className="muted">{monthLabel(filter)}</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-label">
                    <strong>
                      {totalExpected
                        ? Math.round((totalPaid / totalExpected) * 100)
                        : 0}
                      %
                    </strong>
                    <span>of expected dues collected</span>
                  </div>
                  <div className="progress">
                    <span
                      style={{
                        width: `${totalExpected ? Math.min(100, (totalPaid / totalExpected) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="progress-foot">
                    <span>
                      Collected <b>{money(totalPaid)}</b>
                    </span>
                    <span>
                      Outstanding <b>{money(totalBalance)}</b>
                    </span>
                  </div>
                </div>
                <div className="mini-stats">
                  <div>
                    <span>Paid in full</span>
                    <b>{monthRows.filter((r) => r.status === "Paid").length}</b>
                  </div>
                  <div>
                    <span>Partially paid</span>
                    <b>
                      {monthRows.filter((r) => r.status === "Part-paid").length}
                    </b>
                  </div>
                  <div>
                    <span>Unpaid</span>
                    <b>
                      {monthRows.filter((r) => r.status === "Unpaid").length}
                    </b>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head">
                  <h3>Quick actions</h3>
                </div>
                <div className="quick-actions">
                  <button onClick={() => setPage("Record Payment")}>
                    <i>＋</i>
                    <span>
                      <b>Record a payment</b>
                      <small>Log cash or E-Cash dues</small>
                    </span>
                    <em>→</em>
                  </button>
                  <button onClick={() => setPage("Teachers")}>
                    <i>♙</i>
                    <span>
                      <b>Manage teachers</b>
                      <small>Add and update teacher records</small>
                    </span>
                    <em>→</em>
                  </button>
                  <button onClick={() => setPage("Reports")}>
                    <i>▤</i>
                    <span>
                      <b>View reports</b>
                      <small>Review collections and arrears</small>
                    </span>
                    <em>→</em>
                  </button>
                </div>
              </div>
            </div>
            <div className="panel table-panel">
              <div className="panel-head">
                <div>
                  <h3>Monthly dues register</h3>
                  <p>Obligations for {monthLabel(filter)}</p>
                </div>
                <button
                  className="subtle"
                  onClick={() => setPage("Monthly Dues")}
                >
                  View full register →
                </button>
              </div>
              <DuesTable rows={monthRows.slice(0, 6)} />
            </div>
          </>
        )}
        {page === "Teachers" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Add a teacher</h3>
                  <p>Register a teacher for dues tracking.</p>
                </div>
              </div>
              <form className="form" onSubmit={addTeacher}>
                <Field label="Teacher full name">
                  <input
                    required
                    value={teacherForm.name}
                    onChange={(e) =>
                      setTeacherForm({ ...teacherForm, name: e.target.value })
                    }
                    placeholder="e.g. Ama Mensah"
                  />
                </Field>
                <Field label="Staff ID">
                  <input
                    required
                    value={teacherForm.staffId}
                    onChange={(e) =>
                      setTeacherForm({
                        ...teacherForm,
                        staffId: e.target.value,
                      })
                    }
                    placeholder="e.g. IC-001"
                  />
                </Field>
                <Field label="Department">
                  <input
                    value={teacherForm.department}
                    onChange={(e) =>
                      setTeacherForm({
                        ...teacherForm,
                        department: e.target.value,
                      })
                    }
                    placeholder="Department (optional)"
                  />
                </Field>
                <Field label="Phone number">
                  <input
                    value={teacherForm.phone}
                    onChange={(e) =>
                      setTeacherForm({ ...teacherForm, phone: e.target.value })
                    }
                    placeholder="Phone (optional)"
                  />
                </Field>
                <button className="primary" disabled={saving}>
                  Add teacher
                </button>
              </form>
            </section>
            <section className="panel table-panel">
              <div className="panel-head">
                <div>
                  <h3>Teacher directory</h3>
                  <p>{data.teachers.length} registered teacher(s)</p>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />{" "}
                  Show inactive
                </label>
              </div>
              <div className="searchbox">
                <span>⌕</span>
                <input
                  placeholder="Search name, staff ID or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Staff ID</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teachers
                      .filter(
                        (t) =>
                          (showInactive || t.status !== "inactive") &&
                          (!search ||
                            [t.name, t.staffId, t.department].some((v) =>
                              String(v || "")
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )),
                      )
                      .map((t) => (
                        <tr key={t.id}>
                          <td>
                            <b>{t.name}</b>
                            <small className="cell-sub">
                              {t.phone || "No phone recorded"}
                            </small>
                          </td>
                          <td>{t.staffId}</td>
                          <td>{t.department || "—"}</td>
                          <td>
                            <Badge
                              status={
                                t.status === "inactive" ? "Inactive" : "Active"
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="text-action"
                              onClick={() => toggleTeacher(t)}
                            >
                              {t.status === "inactive"
                                ? "Reactivate"
                                : "Deactivate"}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.teachers.length && (
                  <Empty text="No teachers yet. Add the first teacher using the form." />
                )}
              </div>
            </section>
          </div>
        )}
        {page === "Monthly Dues" && (
          <section className="panel table-panel">
            <div className="panel-head">
              <div>
                <h3>Monthly dues register</h3>
                <p>
                  Review each teacher's obligation, payments and outstanding
                  balance.
                </p>
              </div>
              <input
                type="month"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="stats compact">
              <Stat title="Expected" value={money(totalExpected)} />
              <Stat title="Collected" value={money(totalPaid)} />
              <Stat title="Outstanding" value={money(totalBalance)} />
              <Stat
                title="Teachers with balance"
                value={monthRows.filter((r) => r.balance > 0).length}
              />
            </div>
            <DuesTable rows={monthRows} />
          </section>
        )}
        {page === "Record Payment" && (
          <div className="content-grid payment-layout">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Record dues payment</h3>
                  <p>
                    Record cash or E-Cash received, including previous months.
                  </p>
                </div>
              </div>
              <form className="form" onSubmit={recordPayment}>
                <Field label="Teacher">
                  <select
                    required
                    value={pay.teacherId}
                    onChange={(e) =>
                      setPay({ ...pay, teacherId: e.target.value })
                    }
                  >
                    <option value="">Select a teacher</option>
                    {activeTeachers
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.staffId}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Amount received (GH₵)">
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={pay.amount}
                    onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
                <div className="field-row">
                  <Field label="Actual payment date">
                    <input
                      required
                      type="date"
                      value={pay.date}
                      onChange={(e) => setPay({ ...pay, date: e.target.value })}
                    />
                  </Field>
                  <Field label="Dues month covered">
                    <input
                      required
                      type="month"
                      value={pay.period}
                      onChange={(e) =>
                        setPay({ ...pay, period: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Payment method">
                  <select
                    value={pay.method}
                    onChange={(e) => setPay({ ...pay, method: e.target.value })}
                  >
                    <option>Physical cash</option>
                    <option>E-Cash</option>
                  </select>
                </Field>
                <Field label="Notes (optional)">
                  <textarea
                    rows="3"
                    value={pay.notes}
                    onChange={(e) => setPay({ ...pay, notes: e.target.value })}
                    placeholder="Reference or additional details"
                  />
                </Field>
                <div className="info-note">
                  {pay.method === "E-Cash"
                    ? "Confirm the electronic/mobile-money transfer has already been received. This app does not process transfers."
                    : "Confirm the physical cash was received. This app records the transaction but does not process payments."}
                </div>
                <button className="primary full" disabled={saving}>
                  Record payment and generate receipt
                </button>
              </form>
            </section>
            <section className="panel preview-panel">
              <div className="panel-head">
                <h3>Payment preview</h3>
              </div>
              {pay.teacherId ? (
                (() => {
                  const t = teacherById(pay.teacherId),
                    o = obligation(pay.teacherId, pay.period);
                  return (
                    <>
                      <div className="teacher-preview">
                        <div className="avatar">
                          {t?.name
                            ?.split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <b>{t?.name}</b>
                          <span>
                            {t?.staffId} · {t?.department || "No department"}
                          </span>
                        </div>
                      </div>
                      <div className="preview-period">
                        {monthLabel(pay.period)}
                      </div>
                      <div className="balance-line">
                        <span>Monthly obligation</span>
                        <b>{money(o.expected)}</b>
                      </div>
                      <div className="balance-line">
                        <span>Already paid</span>
                        <b>{money(o.paid)}</b>
                      </div>
                      <div className="balance-line">
                        <span>Balance before payment</span>
                        <b>{money(o.balance)}</b>
                      </div>
                      <div className="balance-total">
                        <span>Balance after this payment</span>
                        <strong>
                          {money(
                            Math.max(0, o.balance - (Number(pay.amount) || 0)),
                          )}
                        </strong>
                      </div>
                      <p className="hint">
                        Historical rates are applied by the month covered, not
                        the day you record the payment.
                      </p>
                    </>
                  );
                })()
              ) : (
                <Empty text="Choose a teacher to preview the dues balance." />
              )}
            </section>
          </div>
        )}
        {page === "Payments" && (
          <section className="panel table-panel">
            <div className="panel-head">
              <div>
                <h3>Payment history</h3>
                <p>Receipts, payment methods and reversals.</p>
              </div>
              <button className="subtle" onClick={exportCSV}>
                ↓ Export CSV
              </button>
            </div>
            <div className="filters">
              <div className="searchbox">
                <span>⌕</span>
                <input
                  placeholder="Search receipt, teacher or staff ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <input
                type="month"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button className="subtle" onClick={() => setFilter("")}>
                All months
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Paid on</th>
                    <th>Teacher</th>
                    <th>Dues month</th>
                    <th>Amount</th>
                    <th>Method / status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const t = teacherById(p.teacherId),
                      a = data.allocations.find((x) => x.paymentId === p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <b>{p.receiptNo}</b>
                        </td>
                        <td>{p.date}</td>
                        <td>
                          {t?.name || "Archived teacher"}
                          <small className="cell-sub">{t?.staffId || ""}</small>
                        </td>
                        <td>{a?.period ? monthLabel(a.period) : "—"}</td>
                        <td>
                          <b>{money(p.amount)}</b>
                        </td>
                        <td>
                          <Badge status={p.reversed ? "Reversed" : p.method} />
                        </td>
                        <td>
                          <div className="action-pair">
                            <button
                              className="text-action"
                              onClick={() => printReceipt(p, t, a)}
                            >
                              Receipt
                            </button>
                            {!p.reversed && (
                              <button
                                className="text-action danger-text"
                                onClick={() => reversePayment(p)}
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredPayments.length && (
                <Empty text="No payment transactions found for this filter." />
              )}
            </div>
          </section>
        )}
        {page === "Reports" && (
          <>
            <div className="section-head">
              <div>
                <h2>Collection report</h2>
                <p>Monthly summary for ICOSWA contributions.</p>
              </div>
              <input
                type="month"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="stats">
              <Stat title="Expected dues" value={money(totalExpected)} />
              <Stat title="Paid toward month" value={money(totalPaid)} />
              <Stat title="Outstanding" value={money(totalBalance)} />
              <Stat
                title="Collection rate"
                value={`${totalExpected ? Math.round((totalPaid / totalExpected) * 100) : 0}%`}
              />
            </div>
            <section className="panel table-panel">
              <div className="panel-head">
                <div>
                  <h3>Teacher arrears report</h3>
                  <p>{monthLabel(filter)}</p>
                </div>
                <button className="subtle" onClick={exportCSV}>
                  ↓ Export payment CSV
                </button>
              </div>
              <DuesTable rows={monthRows} />
            </section>
            <section className="panel">
              <h3>Payment methods summary</h3>
              <div className="mini-stats report-methods">
                <div>
                  <span>Physical cash</span>
                  <b>
                    {money(
                      data.payments
                        .filter(
                          (p) => !p.reversed && p.method === "Physical cash",
                        )
                        .reduce((s, p) => s + p.amount, 0),
                    )}
                  </b>
                </div>
                <div>
                  <span>E-Cash</span>
                  <b>
                    {money(
                      data.payments
                        .filter((p) => !p.reversed && p.method === "E-Cash")
                        .reduce((s, p) => s + p.amount, 0),
                    )}
                  </b>
                </div>
                <div>
                  <span>Reversed transactions</span>
                  <b>{data.payments.filter((p) => p.reversed).length}</b>
                </div>
              </div>
            </section>
          </>
        )}
        {page === "Settings & Backup" && (
          <div className="settings-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Association settings</h3>
                  <p>Organization details and receipt numbering.</p>
                </div>
              </div>
              <form className="form" onSubmit={saveSettings}>
                <Field label="Association name">
                  <input
                    value={data.settings.association || ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          association: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="School / institution">
                  <input
                    value={data.settings.school || ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: { ...data.settings, school: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Treasurer name">
                  <input
                    value={data.settings.treasurer || ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          treasurer: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Receipt prefix">
                  <input
                    maxLength="12"
                    value={data.settings.receiptPrefix || "ICOSWA"}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          receiptPrefix: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <button className="primary" disabled={saving}>
                  Save settings
                </button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Dues rate history</h3>
                  <p>
                    Different contribution amounts can apply to different
                    months. Rates are shared across all users.
                  </p>
                </div>
              </div>
              <div className="rate-list">
                <div className="rate-header">
                  <span>Effective from</span>
                  <span>Monthly dues (GH₵)</span>
                  <span></span>
                </div>
                {[...data.settings.rates]
                  .sort((a, b) =>
                    a.effectiveFrom.localeCompare(b.effectiveFrom),
                  )
                  .map((r) => (
                    <div className="rate-row" key={r.effectiveFrom}>
                      <input
                        aria-label="Rate effective month"
                        type="month"
                        value={r.effectiveFrom}
                        onChange={(e) =>
                          updateRate(r.effectiveFrom, e.target.value)
                        }
                      />
                      <input
                        aria-label="Monthly dues amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.amount}
                        onChange={(e) =>
                          updateRate(r.effectiveFrom, e.target.value)
                        }
                      />
                      <button
                        className="icon-button"
                        title="Remove rate"
                        onClick={() => {
                          if (data.settings.rates.length === 1)
                            return notify(
                              "At least one dues rate is required.",
                              "error",
                            );
                          setData({
                            ...data,
                            settings: {
                              ...data.settings,
                              rates: data.settings.rates.filter(
                                (x) => x.effectiveFrom !== r.effectiveFrom,
                              ),
                            },
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
              <div className="rate-add">
                <input
                  type="month"
                  value={rateForm.effectiveFrom}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, effectiveFrom: e.target.value })
                  }
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateForm.amount}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, amount: e.target.value })
                  }
                  placeholder="Amount"
                />
                <button className="subtle" onClick={addRate} type="button">
                  ＋ Add rate
                </button>
              </div>
              <p className="hint">
                The earliest configured rate is used for months before the first
                listed rate. Existing transactions are preserved when rates are
                changed.
              </p>
              <button
                className="primary"
                disabled={saving}
                onClick={saveSettings}
              >
                Save rate history
              </button>
            </section>
            <section className="panel backup-panel">
              <div className="panel-head">
                <div>
                  <h3>Backup & restore</h3>
                  <p>Export a copy before major changes or imports.</p>
                </div>
              </div>
              <div className="backup-actions">
                <button className="subtle" onClick={exportBackup}>
                  ↓ Download JSON backup
                </button>
                <label className="upload-btn">
                  ↑ Import JSON backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={importBackup}
                  />
                </label>
              </div>
              <div className="info-note">
                This app stores shared records in MongoDB. Keep your connection
                string private. JSON backups contain teacher and financial
                information, so store them securely.
              </div>
              <div className="db-details">
                <span>Database</span>
                <b>
                  {dbError
                    ? "Connection needs attention"
                    : "Connected through server API"}
                </b>
                <span>Teachers</span>
                <b>{data.teachers.length}</b>
                <span>Payments</span>
                <b>{data.payments.length}</b>
                <span>Last save</span>
                <b>{saving ? "Saving…" : "On demand"}</b>
              </div>
            </section>
          </div>
        )}
        <footer>
          <span>ICOSWA Dues Management</span>
          <span>Cash & E-Cash recording · Historical dues rates</span>
        </footer>
      </main>
    </div>
  );
}
function Stat({ title, value, sub, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        {icon && <i>{icon}</i>}
      </div>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Badge({ status }) {
  const s = String(status || "")
    .toLowerCase()
    .replaceAll(" ", "-");
  return <span className={`badge badge-${s}`}>{status}</span>;
}
function Empty({ text }) {
  return (
    <div className="empty">
      <span>▤</span>
      <p>{text}</p>
    </div>
  );
}
function DuesTable({ rows }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Staff ID</th>
            <th>Expected</th>
            <th>Paid</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teacher.id}>
              <td>
                <b>{r.teacher.name}</b>
                <small className="cell-sub">
                  {r.teacher.department || "No department"}
                </small>
              </td>
              <td>{r.teacher.staffId}</td>
              <td>{money(r.expected)}</td>
              <td>{money(r.paid)}</td>
              <td>
                <b className={r.balance ? "balance-red" : ""}>
                  {money(r.balance)}
                </b>
              </td>
              <td>
                <Badge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty text="No active teachers to show for this period." />
      )}
    </div>
  );
}
function printReceipt(p, t, a) {
  const w = window.open("", "_blank", "width=600,height=720");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>Receipt ${p.receiptNo}</title><style>body{font:15px Arial,sans-serif;padding:36px;color:#25213a}.receipt{max-width:500px;margin:auto;border:1px solid #ddd;padding:30px}.top{text-align:center;border-bottom:2px solid #f0c84b;padding-bottom:18px}h1{font-size:22px;color:#563b91;margin:0 0 6px}.muted{color:#666}.line{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee}.amount{font-size:24px;font-weight:bold}.foot{margin-top:30px;font-size:12px;color:#777;text-align:center}@media print{button{display:none}}</style></head><body><div class="receipt"><div class="top"><h1>ICOSWA</h1><b>Ideal College Start Welfare Association</b><p class="muted">Official dues payment receipt</p></div><div class="line"><span>Receipt number</span><b>${p.receiptNo}</b></div><div class="line"><span>Payment date</span><b>${p.date}</b></div><div class="line"><span>Teacher</span><b>${t?.name || "Archived teacher"}</b></div><div class="line"><span>Staff ID</span><b>${t?.staffId || "—"}</b></div><div class="line"><span>Dues month</span><b>${a?.period ? monthLabel(a.period) : "—"}</b></div><div class="line"><span>Payment method</span><b>${p.method}</b></div><div class="line"><span>Amount received</span><span class="amount">${money(p.amount)}</span></div>${p.notes ? `<p>Notes: ${p.notes.replace(/[<>&]/g, "")}</p>` : ""}<div class="foot">Thank you for your contribution.${p.reversed ? "<p>REVERSED TRANSACTION</p>" : ""}</div><p style="text-align:center"><button onclick="window.print()">Print receipt</button></p></div></body></html>`,
  );
  w.document.close();
}
export default App;
