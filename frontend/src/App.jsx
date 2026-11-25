import { api } from "./services/api";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getMaintenanceUpiLink, PAYMENT_CONFIG } from "./services/paymentConfig";
import "./style.css";

const initialFlats = [
  "101", "102", "201", "202", "301",
  "302", "401", "402", "501", "502"
].map((number) => ({
  number,
  resident:
    number === "101" ? "Resident 101" :
    number === "102" ? "Resident 102" :
    "Not assigned",
  status: ["101", "102"].includes(number)
    ? "Occupied"
    : "Available"
}));

const initialResidents = [
  { id: 1, name: "Resident 101", flat: "101", phone: "Not added" },
  { id: 2, name: "Resident 102", flat: "102", phone: "Not added" }
];

function getPaymentDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function App() {
  const [role, setRole] = useState("resident");
  const [username, setUsername] = useState("");
  const [flatNumber, setFlatNumber] = useState("101");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const maintenanceUpiLink = getMaintenanceUpiLink(flatNumber, "monthly");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [residentError, setResidentError] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("All");
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [selectedBillFlat, setSelectedBillFlat] = useState("101");
  const [billMessage, setBillMessage] = useState("");
  const [selectedResidentIds, setSelectedResidentIds] = useState([]);
  const [paymentEdit, setPaymentEdit] = useState({
    date: "",
    method: "UPI",
    status: "Unpaid"
  });

  const [activePage, setActivePage] = useState("Overview");
  const [flats, setFlats] = useState(initialFlats);
  const [residents, setResidents] = useState(initialResidents);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([
    { id: 1, title: "Cleaning", amount: 1500, date: "01-Nov-2026" }
  ]);
  const [staffPayments, setStaffPayments] = useState([]);

  const [residentForm, setResidentForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [residentName, setResidentName] = useState("");
  const [residentFlat, setResidentFlat] = useState(
    initialFlats.find((flat) => flat.status === "Available")?.number ?? ""
  );
  const [residentPhone, setResidentPhone] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const menu = [
    { name: "Overview", icon: "🏠" },
    { name: "Flats", icon: "🏢" },
    { name: "Residents", icon: "👥" },
    { name: "Maintenance Bills", icon: "🧾" },
    { name: "Payments", icon: "💳" },
    { name: "Expenses", icon: "💰" },
    { name: "Staff & Salary", icon: "🧑‍🔧" },
    { name: "Reports", icon: "📊" }
  ];

  const totalCollection = payments.reduce(
    (sum, payment) => sum + (payment.status === "Paid" ? Number(payment.amount) : 0), 0
  );
  const paidPaymentCount = payments.filter((payment) => payment.status === "Paid").length;
  const filteredPayments = payments.filter((payment) => {
    const matchesStatus = paymentStatusFilter === "All"
      || (paymentStatusFilter === "Paid" && payment.status === "Paid")
      || (paymentStatusFilter === "Pending" && payment.status !== "Paid");
    const searchText = [
      payment.flat,
      payment.month,
      payment.date,
      payment.method,
      payment.status
    ].join(" ").toLowerCase();
    return matchesStatus && searchText.includes(paymentSearch.trim().toLowerCase());
  });

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount), 0
  );

  const pendingBills = bills.filter(
    (bill) => bill.status === "Pending"
  );

  useEffect(() => {
    if (!loggedIn || role !== "admin") return undefined;

    let active = true;
    async function refreshPayments() {
      try {
        const [allPayments, currentMonthPayments] = await Promise.all([
          api.getPayments(),
          api.getPayments({ currentMonth: true })
        ]);
        if (!active) return;
        setPayments(allPayments.data);
        setBills(currentMonthPayments.data.map((payment) => ({
          id: payment.id,
          flat: payment.flat,
          month: payment.month,
          amount: Number(payment.amount),
          date: payment.date,
          method: payment.method,
          status: payment.status === "Paid" ? "Paid" : "Pending"
        })));
        setPaymentError("");
      } catch (error) {
        if (active) setPaymentError(`Unable to refresh payments: ${error.message}`);
      }
    }

    refreshPayments();
    const intervalId = window.setInterval(refreshPayments, 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loggedIn, role]);


async function login(event) {
  event.preventDefault();
  setMessage("");

  try {
    const result = await api.login({
      role,
      username: username.trim(),
      flatNumber,
      password
    });

    if (!result.success) {
      setMessage(result.message || "Login failed");
      return;
    }

    const loggedInRole = result.user.role;
    const loggedInFlat = result.user.flatNumber || flatNumber;
    const [paymentResult, managementData] = await Promise.all([
      api.getPayments(
        loggedInRole === "resident"
          ? { flatNumber: loggedInFlat, currentMonth: true }
          : {}
      ),
      loggedInRole === "admin"
        ? Promise.all([
          api.getFlats(),
          api.getResidents(),
          api.getExpenses(),
          api.getStaffPayments()
        ])
        : Promise.resolve(null)
    ]);
    setPayments(paymentResult.data);

    if (loggedInRole === "admin") {
      const currentMonthResult = await api.getPayments({ currentMonth: true });
      const [flatResult, residentResult, expenseResult, salaryResult] = managementData;
      setFlats(flatResult.data);
      setResidents(residentResult.data);
      setExpenses(expenseResult.data);
      setStaffPayments(salaryResult.data);
      setBills(currentMonthResult.data.map((payment) => ({
        id: payment.id,
        flat: payment.flat,
        month: payment.month,
        amount: Number(payment.amount),
        date: payment.date,
        method: payment.method,
        status: payment.status === "Paid" ? "Paid" : "Pending"
      })));
    }

    setRole(loggedInRole);
    setFlatNumber(loggedInFlat);
    setActivePage("Overview");
    setLoggedIn(true);
    setPaymentMessage("");
    setPaymentError("");
    setResidentError("");
    setExpenseError("");
  } catch (error) {
    setMessage(`Unable to sign in: ${error.message}`);
  }
}


  function logout() {
    setLoggedIn(false);
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setMessage("");
    setPaymentMessage("");
    setPaymentError("");
    setPaymentSearch("");
    setPaymentStatusFilter("All");
    setActivePage("Overview");
  }

  async function addResident(event) {
    event.preventDefault();
    const name = residentName.trim();
    const selectedFlat = flats.find((flat) => flat.number === residentFlat);

    if (!name) {
      alert("Enter the resident's name.");
      return;
    }

    if (!selectedFlat || selectedFlat.status !== "Available") {
      alert("Select an available flat for this resident.");
      return;
    }

    setResidentError("");
    try {
      const result = await api.addResident({
        name,
        flat: residentFlat,
        phone: residentPhone.trim()
      });
      setResidents((currentResidents) => [...currentResidents, result.data]);
      setFlats((currentFlats) => currentFlats.map((flat) =>
        flat.number === residentFlat
          ? { ...flat, resident: name, status: "Occupied" }
          : flat
      ));
      setResidentName("");
      setResidentPhone("");
      setResidentFlat(
        flats.find((flat) => flat.status === "Available" && flat.number !== residentFlat)?.number ?? ""
      );
      setResidentForm(false);
    } catch (error) {
      setResidentError(`Unable to save resident: ${error.message}`);
    }
  }

  async function removeResidents(ids) {
    const idsToRemove = new Set(ids);
    const removedResidents = residents.filter((resident) => idsToRemove.has(resident.id));
    if (removedResidents.length === 0) return;
    if (!window.confirm(`Remove ${removedResidents.length} selected resident${removedResidents.length === 1 ? "" : "s"}? Their payment history will remain unchanged.`)) return;

    setResidentError("");
    try {
      await Promise.all(removedResidents.map((resident) => api.deleteResident(resident.id)));
      setResidents((currentResidents) => currentResidents.filter((resident) => !idsToRemove.has(resident.id)));
      setFlats((currentFlats) => currentFlats.map((flat) => (
        removedResidents.some((resident) => resident.flat === flat.number)
          ? { ...flat, resident: "Not assigned", status: "Available" }
          : flat
      )));
      setSelectedResidentIds((currentIds) => currentIds.filter((id) => !idsToRemove.has(id)));
    } catch (error) {
      setResidentError(`Unable to remove resident(s): ${error.message}`);
      try {
        const [residentResult, flatResult] = await Promise.all([api.getResidents(), api.getFlats()]);
        setResidents(residentResult.data);
        setFlats(flatResult.data);
      } catch (refreshError) {
        setResidentError(`Unable to refresh residents after removal failed: ${refreshError.message}`);
      }
    }
  }

  function toggleResidentSelection(id) {
    setSelectedResidentIds((currentIds) => (
      currentIds.includes(id)
        ? currentIds.filter((selectedId) => selectedId !== id)
        : [...currentIds, id]
    ));
  }

  function getCurrentBillingMonth() {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "long",
      year: "numeric"
    }).format(new Date());
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  async function generateBills() {
    setBillMessage("");
    const selectedFlat = flats.find((flat) => flat.number === selectedBillFlat);
    if (!selectedFlat || selectedFlat.status !== "Occupied") {
      setBillMessage("Select an occupied flat to generate its maintenance bill.");
      return;
    }

    const month = getCurrentBillingMonth();
    let bill = bills.find((item) => item.flat === selectedBillFlat && item.month === month);

    if (!bill) {
      try {
        const result = await api.getPayments({ flatNumber: selectedBillFlat, currentMonth: true });
        const payment = result.data.find((item) => item.flat === selectedBillFlat);
        if (!payment) {
          setBillMessage(`No monthly payment record was found for Flat ${selectedBillFlat}.`);
          return;
        }
        bill = {
          id: payment.id,
          flat: payment.flat,
          month: payment.month,
          amount: Number(payment.amount),
          date: payment.date,
          method: payment.method,
          status: payment.status === "Paid" ? "Paid" : "Pending"
        };
        setBills((currentBills) => (
          currentBills.some((item) => item.id === bill.id)
            ? currentBills
            : [...currentBills, bill]
        ));
      } catch (error) {
        setBillMessage(`Unable to generate the bill: ${error.message}`);
        return;
      }
    }

    const amount = Number(bill.amount).toLocaleString("en-IN");
    const fileContent = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance bill — Flat ${escapeHtml(bill.flat)}</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:40px 18px;background:#f3f6f2;color:#25382e;font:15px Arial,sans-serif}.bill{max-width:680px;margin:auto;padding:44px;background:white;border:1px solid #e3ebe3;border-radius:16px;box-shadow:0 12px 40px #24452b12}.brand{color:#386c50;font-size:12px;letter-spacing:2px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:24px;border-bottom:1px solid #e8eee8}.top h1{margin:8px 0;font:32px Georgia,serif}.muted{color:#75847a}.pill{padding:8px 12px;border-radius:20px;background:${bill.status === "Paid" ? "#eaf5ec" : "#fbf3e5"};color:${bill.status === "Paid" ? "#3b8054" : "#a3762f"}}.details{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:26px 0}.details span,.details strong{display:block}.details span{margin-bottom:6px;color:#859188;font-size:12px}.line{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-top:1px solid #e8eee8;border-bottom:1px solid #e8eee8}.line strong{font-size:23px}.note{margin-top:24px;padding:14px;border-radius:10px;background:#f4f8f3;color:#66776a;line-height:1.6;font-size:13px}.footer{margin-top:32px;color:#869188;font-size:12px}@media print{body{padding:0;background:#fff}.bill{max-width:none;border:0;border-radius:0;box-shadow:none;padding:20px}}
</style></head><body><main class="bill"><div class="top"><div><div class="brand">ETERNAL LAKSHMI NILAYAM</div><h1>Maintenance bill</h1><div class="muted">Monthly community contribution</div></div><span class="pill">${escapeHtml(bill.status)}</span></div><div class="details"><div><span>Bill for</span><strong>Flat ${escapeHtml(bill.flat)}</strong></div><div><span>Billing period</span><strong>${escapeHtml(bill.month)}</strong></div><div><span>Bill reference</span><strong>ELN-${escapeHtml(bill.id)}</strong></div><div><span>Issued on</span><strong>${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</strong></div></div><div class="line"><span>Monthly maintenance</span><strong>₹${amount}</strong></div><div class="note">${bill.status === "Paid" ? `Payment recorded${bill.date ? ` on ${escapeHtml(bill.date)}` : ""}${bill.method ? ` via ${escapeHtml(bill.method)}` : ""}.` : "Please pay the monthly maintenance contribution to the apartment administrator. If paying by UPI, mark the bill paid only after the transfer is complete."} This bill is generated from the apartment portal record.</div><div class="footer">Thank you for helping care for your community.</div></main></body></html>`;
    const blob = new Blob([fileContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maintenance-bill-flat-${bill.flat}-${getPaymentDate()}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBillMessage(`Bill for Flat ${bill.flat} downloaded. Open the file to print or save it as PDF.`);
  }

  async function markPaid(bill) {
    if (bill.status === "Paid") return;

    try {
      await api.updatePayment(bill.id, {
        date: getPaymentDate(),
        method: "Cash",
        status: "Paid"
      });
      const result = await api.getPayments();
      setPayments(result.data);
      setBills(result.data
        .filter((payment) => payment.month === getCurrentBillingMonth())
        .map((payment) => ({
          id: payment.id,
          flat: payment.flat,
          month: payment.month,
          amount: Number(payment.amount),
          date: payment.date,
          method: payment.method,
          status: payment.status === "Paid" ? "Paid" : "Pending"
        })));
    } catch (error) {
      alert(`Unable to update payment: ${error.message}`);
    }
  }

  async function submitResidentPayment() {
    setPaymentError("");
    setPaymentMessage("");
    try {
      const result = await api.submitPayment({
        flat: flatNumber,
        method: paymentMethod
      });
      setPayments([result.data]);
      setPaymentMessage("Payment marked as paid. Admin totals and reports are updated.");
    } catch (error) {
      setPaymentError(`Unable to update payment: ${error.message}`);
    }
  }

  async function savePaymentEdit() {
    setPaymentError("");
    try {
      await api.updatePayment(editingPaymentId, paymentEdit);
      const result = await api.getPayments();
      setPayments(result.data);
      setBills(result.data
        .filter((payment) => payment.month === getCurrentBillingMonth())
        .map((payment) => ({
          id: payment.id,
          flat: payment.flat,
          month: payment.month,
          amount: Number(payment.amount),
          date: payment.date,
          method: payment.method,
          status: payment.status === "Paid" ? "Paid" : "Pending"
        })));
      setEditingPaymentId(null);
    } catch (error) {
      setPaymentError(`Unable to save payment: ${error.message}`);
    }
  }

  function exportPayments(rows) {
    const csvCell = (value) => {
      const text = String(value ?? "");
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csvRows = [
      ["Flat", "Amount (INR)", "Billing month", "Payment date", "Method", "Status"],
      ...rows.map((payment) => [
        payment.flat,
        payment.amount,
        payment.month,
        payment.date || "",
        payment.method || "",
        payment.status
      ])
    ];
    const blob = new Blob(
      [`\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maintenance-payments-${getPaymentDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function startPaymentEdit(payment) {
    setPaymentError("");
    setEditingPaymentId(payment.id);
    setPaymentEdit({
      date: payment.date || getPaymentDate(),
      method: payment.method || "UPI",
      status: payment.status
    });
  }

  async function addExpense(event) {
    event.preventDefault();

    const amount = Number(expenseAmount);
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setExpenseError("Enter an expense description and a valid amount.");
      return;
    }

    setExpenseError("");
    try {
      if (editingExpenseId !== null) {
        await api.updateExpense(editingExpenseId, { title: expenseTitle.trim(), amount });
        setExpenses((currentExpenses) => currentExpenses.map((expense) => (
          expense.id === editingExpenseId
            ? { ...expense, title: expenseTitle.trim(), amount }
            : expense
        )));
        setEditingExpenseId(null);
      } else {
        const result = await api.addExpense({ title: expenseTitle.trim(), amount });
        setExpenses((currentExpenses) => [...currentExpenses, result.data]);
      }
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseForm(false);
    } catch (error) {
      setExpenseError(`Unable to save expense: ${error.message}`);
    }
  }

  function startExpenseEdit(expense) {
    setEditingExpenseId(expense.id);
    setExpenseTitle(expense.title);
    setExpenseAmount(String(expense.amount));
    setExpenseForm(true);
  }

  async function removeExpense(expense) {
    if (!window.confirm(`Remove the "${expense.title}" expense?`)) return;
    setExpenseError("");
    try {
      await api.deleteExpense(expense.id);
      setExpenses((currentExpenses) => currentExpenses.filter((item) => item.id !== expense.id));
    } catch (error) {
      setExpenseError(`Unable to remove expense: ${error.message}`);
      return;
    }
    if (editingExpenseId === expense.id) {
      setEditingExpenseId(null);
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseForm(false);
    }
  }

  async function paySalary() {
    const currentMonth = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "long",
      year: "numeric"
    }).format(new Date());

    if (staffPayments.some((p) => p.month === currentMonth)) {
      alert("Watchman salary has already been recorded for this month.");
      return;
    }

    try {
      const result = await api.recordSalary(currentMonth);
      setStaffPayments((currentPayments) => [...currentPayments, result.data]);
      const expenseResult = await api.getExpenses();
      setExpenses(expenseResult.data);
      alert("Watchman salary of ₹8,000 recorded as an expense.");
    } catch (error) {
      alert(`Unable to record watchman salary: ${error.message}`);
    }
  }

  function StatCard({ title, value, icon, note }) {
    return (
      <div className="stat-card">
        <div className="stat-top">
          <span>{title}</span>
          <span className="stat-icon">{icon}</span>
        </div>
        <h2>{value}</h2>
        <small>{note}</small>
      </div>
    );
  }

  function Overview() {
    const occupiedFlats = flats.filter((flat) => flat.status === "Occupied").length;
    const collectionProgress = bills.length
      ? Math.round((bills.filter((bill) => bill.status === "Paid").length / bills.length) * 100)
      : 0;

    return (
      <>
        <div className="welcome-row">
          <div>
            <p className="dashboard-eyebrow">YOUR COMMUNITY, AT A GLANCE</p>
            <h2>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, Administrator</h2>
            <p>Here’s what’s happening across your apartment today.</p>
          </div>
          <div className="overview-date">
            <span className="live-indicator" />
            <div><strong>Today</strong><span>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div>
          </div>
        </div>

        {paymentError && <p className="error-message">{paymentError}</p>}

        <div className="stats-grid">
          <StatCard title="Total apartments" value={flats.length} icon="🏢" note="Homes in your community" />
          <StatCard title="Active residents" value={residents.length} icon="👥" note="Registered households" />
          <StatCard title="Collected this month" value={`₹${totalCollection.toLocaleString("en-IN")}`} icon="↗" note={`${paidPaymentCount} payments received`} />
          <StatCard title="Awaiting payment" value={pendingBills.length} icon="◷" note="Outstanding this month" />
        </div>

        <div className="overview-grid">
          <div className="content-card occupancy-card">
            <div className="section-heading">
              <div><p className="dashboard-eyebrow">PROPERTY SNAPSHOT</p><h3>Building occupancy</h3></div>
              <span className="soft-tag">{occupiedFlats} of {flats.length} occupied</span>
            </div>
            <div className="occupancy-progress"><span style={{ width: `${flats.length ? (occupiedFlats / flats.length) * 100 : 0}%` }} /></div>
            <div className="flat-grid">
              {flats.map((flat) => (
                <div className={`flat-tile ${flat.status === "Occupied" ? "is-occupied" : ""}`} key={flat.number}>
                  <span className="flat-tile-icon">{flat.status === "Occupied" ? "⌂" : "+"}</span>
                  <strong>{flat.number}</strong>
                  <small>{flat.status === "Occupied" ? "Occupied" : "Available"}</small>
                </div>
              ))}
            </div>
            <div className="occupancy-legend"><span><i className="legend-dot occupied-dot" />Occupied</span><span><i className="legend-dot available-dot" />Available</span></div>
          </div>

          <div className="content-card collection-card">
            <div className="section-heading">
              <div><p className="dashboard-eyebrow">MONTHLY COLLECTION</p><h3>Payment progress</h3></div>
              <span className="progress-icon">↗</span>
            </div>
            <div className="collection-total">₹{totalCollection.toLocaleString("en-IN")}<span> collected</span></div>
            <div className="collection-progress"><span style={{ width: `${collectionProgress}%` }} /></div>
            <div className="progress-caption"><span>{collectionProgress}% complete</span><span>{bills.length} bills issued</span></div>
            <div className="collection-callout">
              <span className="callout-icon">✦</span>
              <p>{pendingBills.length ? `${pendingBills.length} household${pendingBills.length === 1 ? "" : "s"} still have a balance due.` : "You’re all caught up on outstanding payments."}</p>
            </div>
            <div className="quick-actions">
              <p className="dashboard-eyebrow">QUICK ACTIONS</p>
              <button onClick={() => setActivePage("Maintenance Bills")}><span>＋</span>Generate monthly bills <b>→</b></button>
              <button onClick={() => setActivePage("Residents")}><span>♧</span>Add a resident <b>→</b></button>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="section-heading">
            <div><p className="dashboard-eyebrow">COMMUNITY DETAILS</p><h3>Apartment information</h3></div>
            <span className="soft-tag">● Operating normally</span>
          </div>
          <div className="info-grid">
            <div><span>Monthly maintenance</span><strong>₹1,835</strong></div>
            <div><span>Billing frequency</span><strong>Monthly</strong></div>
            <div><span>Watchman salary</span><strong>₹8,000</strong></div>
            <div><span>Total expenses</span><strong>₹{totalExpenses.toLocaleString("en-IN")}</strong></div>
          </div>
        </div>

        <div className="content-card">
          <div className="section-heading">
            <div><p className="dashboard-eyebrow">LATEST ACTIVITY</p><h3>Recent payments</h3></div>
            <button className="text-action" onClick={() => setActivePage("Payments")}>View all payments <span>→</span></button>
          </div>
          {PaymentTable({ rows: payments.filter((payment) => payment.status === "Paid").slice(0, 5) })}
        </div>
      </>
    );
  }

  function PaymentTable({ rows, editable = false, emptyMessage = "No payment records yet." }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flat</th><th>Amount</th><th>Month</th><th>Date</th><th>Method</th><th>Status</th>
              {editable && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.flat}</td>
                <td>₹{Number(p.amount).toLocaleString("en-IN")}</td>
                <td>{p.month}</td>
                <td>{editingPaymentId === p.id ? (
                  <input
                    type="date"
                    value={paymentEdit.date}
                    onChange={(event) => setPaymentEdit({ ...paymentEdit, date: event.target.value })}
                    aria-label={`Payment date for flat ${p.flat}`}
                  />
                ) : (p.date || "—")}</td>
                <td>{editingPaymentId === p.id ? (
                  <select
                    value={paymentEdit.method}
                    onChange={(event) => setPaymentEdit({ ...paymentEdit, method: event.target.value })}
                    aria-label={`Payment method for flat ${p.flat}`}
                  >
                    <option value="UPI">Online (UPI)</option>
                    <option value="Cash">Cash</option>
                  </select>
                ) : (p.method === "UPI" ? "Online (UPI)" : p.method || "—")}</td>
                <td>{editingPaymentId === p.id ? (
                  <select
                    value={paymentEdit.status}
                    onChange={(event) => setPaymentEdit({ ...paymentEdit, status: event.target.value })}
                    aria-label={`Payment status for flat ${p.flat}`}
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                  </select>
                ) : <span className={`status ${p.status === "Paid" ? "paid" : "pending"}`}>{p.status}</span>}</td>
                {editable && <td>
                  {editingPaymentId === p.id ? (
                    <>
                      <button className="small-btn" onClick={savePaymentEdit}>Save</button>
                      <button className="small-btn" onClick={() => setEditingPaymentId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="small-btn" onClick={() => startPaymentEdit(p)}>Edit</button>
                  )}
                </td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={editable ? 7 : 6}>{emptyMessage}</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  function PageContent() {
    if (activePage === "Overview") return <Overview />;

    if (activePage === "Flats") {
      return (
        <>
          <div className="page-heading"><div><p className="dashboard-eyebrow">YOUR PROPERTY</p><h2>Flat management</h2><p className="page-description">A clear view of every home in your community.</p></div><span className="soft-tag">{flats.filter(f => f.status === "Occupied").length} occupied · {flats.filter(f => f.status === "Available").length} available</span></div>
          <div className="stats-grid">
            <StatCard title="Total Flats" value={flats.length} icon="🏢" note="All configured flats" />
            <StatCard title="Occupied" value={flats.filter(f => f.status === "Occupied").length} icon="🔑" note="Assigned flats" />
            <StatCard title="Available" value={flats.filter(f => f.status === "Available").length} icon="🏠" note="Unassigned flats" />
          </div>
          <div className="flat-grid flat-grid-large">
            {flats.map((flat) => (
              <article className={`flat-tile ${flat.status === "Occupied" ? "is-occupied" : ""}`} key={flat.number}>
                <span className="flat-tile-icon">{flat.status === "Occupied" ? "⌂" : "+"}</span>
                <strong>{flat.number}</strong>
                <small>{flat.resident}</small>
                <span className={`status ${flat.status === "Occupied" ? "paid" : "pending"}`}>{flat.status}</span>
              </article>
            ))}
          </div>
          <div className="content-card">
            <div className="section-heading"><div><p className="dashboard-eyebrow">UNIT DIRECTORY</p><h3>All flats</h3></div><span className="soft-tag">Monthly maintenance · ₹1,835</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Flat Number</th><th>Resident</th><th>Status</th><th>Maintenance</th></tr></thead>
                <tbody>
                  {flats.map(f => (
                    <tr key={f.number}>
                      <td>{f.number}</td><td>{f.resident}</td>
                      <td><span className={`status ${f.status === "Occupied" ? "paid" : "pending"}`}>{f.status}</span></td>
                      <td>₹1,835 / month</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    if (activePage === "Residents") {
      return (
        <>
          <div className="page-heading">
            <div><p className="dashboard-eyebrow">COMMUNITY DIRECTORY</p><h2>Resident management</h2><p className="page-description">Welcome new households and keep resident details in one place.</p></div>
            <button className="primary-btn" onClick={() => setResidentForm(!residentForm)}>
              {residentForm ? "Close Form" : "+ Add Resident"}
            </button>
          </div>

          {residentForm && (
            <form className="content-card data-form" onSubmit={addResident}>
              <h3>New Resident</h3>
              <label htmlFor="resident-name">Resident Name</label>
              <input id="resident-name" value={residentName} onChange={e => setResidentName(e.target.value)} maxLength="120" required placeholder="Enter resident name" />
              <label htmlFor="resident-flat">Flat Number</label>
              <select id="resident-flat" value={residentFlat} onChange={e => setResidentFlat(e.target.value)} required>
                {flats.filter(f => f.status === "Available").map(f => <option key={f.number} value={f.number}>{f.number}</option>)}
              </select>
              <label htmlFor="resident-phone">Phone Number</label>
              <input id="resident-phone" type="tel" value={residentPhone} onChange={e => setResidentPhone(e.target.value)} maxLength="20" placeholder="Enter phone number" />
              <button className="primary-btn" type="submit">Save Resident</button>
            </form>
          )}

          {residentError && <p className="error-message management-error" role="alert">{residentError}</p>}

          <div className="content-card">
            <div className="section-heading resident-list-heading">
              <div><p className="dashboard-eyebrow">HOUSEHOLD DIRECTORY</p><h3>Registered Residents ({residents.length})</h3></div>
              <div className="resident-bulk-actions">
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => setSelectedResidentIds(
                    selectedResidentIds.length === residents.length
                      ? []
                      : residents.map((resident) => resident.id)
                  )}
                  disabled={residents.length === 0}
                >
                  {residents.length > 0 && selectedResidentIds.length === residents.length ? "Clear selection" : "Select all"}
                </button>
                <button
                  type="button"
                  className="small-btn danger-btn"
                  onClick={() => removeResidents(selectedResidentIds)}
                  disabled={selectedResidentIds.length === 0}
                >
                  Remove selected{selectedResidentIds.length ? ` (${selectedResidentIds.length})` : ""}
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th><span className="sr-only">Select</span></th><th>Name</th><th>Flat</th><th>Phone</th><th>Action</th></tr></thead>
                <tbody>
                  {residents.map((resident) => (
                    <tr key={resident.id}>
                      <td><input type="checkbox" checked={selectedResidentIds.includes(resident.id)} onChange={() => toggleResidentSelection(resident.id)} aria-label={`Select ${resident.name}`} /></td>
                      <td>{resident.name}</td><td>{resident.flat}</td><td>{resident.phone}</td>
                      <td><button type="button" className="small-btn danger-btn" onClick={() => removeResidents([resident.id])}>Remove</button></td>
                    </tr>
                  ))}
                  {residents.length === 0 && <tr><td colSpan="5">No residents added.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    if (activePage === "Maintenance Bills") {
      return (
        <>
          <div className="page-heading">
            <div><p className="dashboard-eyebrow">BILLING & COLLECTIONS</p><h2>Maintenance bills</h2><p className="page-description">Select a household to generate and download its monthly bill.</p></div>
            <div className="bill-generation-controls">
              <label htmlFor="bill-flat-select">Flat number</label>
              <select id="bill-flat-select" value={selectedBillFlat} onChange={(event) => { setSelectedBillFlat(event.target.value); setBillMessage(""); }}>
                {flats.filter((flat) => flat.status === "Occupied").map((flat) => <option key={flat.number} value={flat.number}>Flat {flat.number}</option>)}
              </select>
              <button className="primary-btn" onClick={generateBills}>Generate &amp; Download Bill</button>
            </div>
          </div>
          {billMessage && <p className={billMessage.startsWith("Unable") || billMessage.startsWith("No ") || billMessage.startsWith("Select") ? "error-message bill-message" : "bill-success bill-message"} role="status">{billMessage}</p>}
          <div className="content-card">
            <div className="section-heading"><div><p className="dashboard-eyebrow">MONTHLY STATEMENTS</p><h3>Bill Records ({bills.length})</h3></div><span className="soft-tag">{getCurrentBillingMonth()} · ₹1,835 per flat</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Flat</th><th>Billing Month</th><th>Amount</th><th>Payment Date</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>{bill.flat}</td><td>{bill.month}</td><td>₹{Number(bill.amount).toLocaleString("en-IN")}</td>
                      <td>{editingPaymentId === bill.id ? (
                        <input type="date" value={paymentEdit.date} onChange={(event) => setPaymentEdit({ ...paymentEdit, date: event.target.value })} aria-label={`Payment date for flat ${bill.flat}`} />
                      ) : bill.date || "—"}</td>
                      <td>{editingPaymentId === bill.id ? (
                        <select value={paymentEdit.status} onChange={(event) => setPaymentEdit({ ...paymentEdit, status: event.target.value })} aria-label={`Payment status for flat ${bill.flat}`}>
                          <option value="Unpaid">Unpaid</option><option value="Paid">Paid</option>
                        </select>
                      ) : <span className={`status ${bill.status === "Paid" ? "paid" : "pending"}`}>{bill.status}</span>}</td>
                      <td className="row-actions">
                        {editingPaymentId === bill.id ? (
                          <><button className="small-btn" onClick={savePaymentEdit}>Save</button><button className="small-btn" onClick={() => setEditingPaymentId(null)}>Cancel</button></>
                        ) : (
                          <>
                            {bill.status === "Pending" && <button className="small-btn" onClick={() => markPaid(bill)}>Record Cash Payment</button>}
                            <button className="small-btn" onClick={() => startPaymentEdit(bill)}>Edit</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {bills.length === 0 && <tr><td colSpan="6">No bills found for this billing period.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    if (activePage === "Payments") {
      return (
        <>
          <p className="dashboard-eyebrow">FINANCE & COLLECTIONS</p><h2>Payment management</h2>
          <p className="page-description">View recorded maintenance payments.</p>
          <div className="stats-grid">
            <StatCard title="Total Collection" value={`₹${totalCollection.toLocaleString("en-IN")}`} icon="💳" note="Paid payments only" />
            <StatCard title="Payment Count" value={paidPaymentCount} icon="🧾" note="Paid transactions" />
          </div>
          {paymentError && <p className="error-message">{paymentError}</p>}
          <div className="content-card">
            <div className="payment-history-heading">
              <div><p className="dashboard-eyebrow">TRANSACTION RECORDS</p><h3>Payment history</h3></div>
              <button
                className="small-btn export-btn"
                onClick={() => exportPayments(filteredPayments)}
                disabled={filteredPayments.length === 0}
              >
                ↓ Export CSV
              </button>
            </div>
            <div className="payment-toolbar">
              <label className="payment-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={paymentSearch}
                  onChange={(event) => setPaymentSearch(event.target.value)}
                  placeholder="Search flat, month, or method"
                  aria-label="Search payments"
                />
              </label>
              <div className="payment-filter-group" role="group" aria-label="Filter payments by status">
                {["All", "Paid", "Pending"].map((status) => (
                  <button
                    key={status}
                    className={paymentStatusFilter === status ? "active" : ""}
                    aria-pressed={paymentStatusFilter === status}
                    onClick={() => setPaymentStatusFilter(status)}
                  >
                    {status === "Pending" ? "Unpaid" : status}
                  </button>
                ))}
              </div>
            </div>
            <p className="payment-result-count">
              Showing {filteredPayments.length} of {payments.length} payment records
            </p>
            {PaymentTable({
              rows: filteredPayments,
              editable: true,
              emptyMessage: payments.length
                ? "No payments match your search and status filter."
                : "No payment records yet."
            })}
          </div>
        </>
      );
    }

    if (activePage === "Expenses") {
      return (
        <>
          <div className="page-heading">
            <div><h2>Apartment Expenses</h2><p className="page-description">Record and monitor apartment spending.</p></div>
            <button className="primary-btn" onClick={() => {
              if (expenseForm) {
                setExpenseForm(false);
                setEditingExpenseId(null);
                setExpenseTitle("");
                setExpenseAmount("");
              } else {
                setExpenseForm(true);
              }
            }}>
              {expenseForm ? "Close Form" : "+ Add Expense"}
            </button>
          </div>
          {expenseForm && (
            <form className="content-card data-form" onSubmit={addExpense}>
              <h3>{editingExpenseId !== null ? "Edit Expense" : "New Expense"}</h3>
              <label htmlFor="expense-title">Expense Description</label>
              <input id="expense-title" value={expenseTitle} onChange={e => setExpenseTitle(e.target.value)} required placeholder="e.g. Lift maintenance" />
              <label htmlFor="expense-amount">Amount (₹)</label>
              <input id="expense-amount" type="number" min="1" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required placeholder="Enter amount" />
              <div className="form-actions"><button className="primary-btn" type="submit">{editingExpenseId !== null ? "Save Changes" : "Save Expense"}</button>{editingExpenseId !== null && <button className="small-btn" type="button" onClick={() => { setEditingExpenseId(null); setExpenseTitle(""); setExpenseAmount(""); setExpenseForm(false); }}>Cancel</button>}</div>
            </form>
          )}
          {expenseError && <p className="error-message management-error" role="alert">{expenseError}</p>}
          <div className="content-card">
            <div className="section-heading"><div><p className="dashboard-eyebrow">COMMUNITY SPENDING</p><h3>Expense Records ({expenses.length})</h3></div><span className="soft-tag">Total · ₹{totalExpenses.toLocaleString("en-IN")}</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Description</th><th>Date</th><th>Amount</th><th>Action</th></tr></thead>
                <tbody>
                  {expenses.map((expense) => <tr key={expense.id}><td>{expense.title}</td><td>{expense.date}</td><td>₹{Number(expense.amount).toLocaleString("en-IN")}</td><td className="row-actions"><button className="small-btn" onClick={() => startExpenseEdit(expense)}>Edit</button><button className="small-btn danger-btn" onClick={() => removeExpense(expense)}>Remove</button></td></tr>)}
                  {expenses.length === 0 && <tr><td colSpan="4">No expenses recorded.</td></tr>}
                </tbody>
              </table>
            </div>
            <h3 className="total-line">Total Expenses: ₹{totalExpenses.toLocaleString("en-IN")}</h3>
          </div>
        </>
      );
    }

    if (activePage === "Staff & Salary") {
      return (
        <>
          <h2>Staff & Salary</h2>
          <p className="page-description">Manage apartment staff salary records.</p>
          <div className="content-card staff-card">
            <div><span className="staff-avatar">🧑‍🔧</span></div>
            <div className="staff-details">
              <h3>Watchman</h3>
              <p>Monthly salary: ₹8,000</p>
              <p>Salary is recorded manually by the admin.</p>
            </div>
            <button className="primary-btn" onClick={paySalary}>Record This Month's Salary</button>
          </div>
          <div className="content-card">
            <h3>Salary Payment History</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Staff</th><th>Month</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {staffPayments.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.month}</td><td>₹{p.amount.toLocaleString("en-IN")}</td><td><span className="status paid">Recorded</span></td></tr>)}
                  {staffPayments.length === 0 && <tr><td colSpan="4">No salary payments recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }

    if (activePage === "Reports") {
      return (
        <>
          <p className="dashboard-eyebrow">COMMUNITY FINANCES</p><h2>Apartment reports</h2>
          <p className="page-description">Summary of recorded collections and expenses.</p>
          <div className="stats-grid">
            <StatCard title="Total Collection" value={`₹${totalCollection.toLocaleString("en-IN")}`} icon="📥" note="Recorded payments" />
            <StatCard title="Total Expenses" value={`₹${totalExpenses.toLocaleString("en-IN")}`} icon="📤" note="Recorded expenses" />
            <StatCard title="Balance" value={`₹${(totalCollection - totalExpenses).toLocaleString("en-IN")}`} icon="📊" note="Collection minus expenses" />
          </div>
          <div className="content-card">
            <h3>Report Summary</h3>
            <div className="info-grid">
              <div><span>Total flats</span><strong>{flats.length}</strong></div>
              <div><span>Registered residents</span><strong>{residents.length}</strong></div>
              <div><span>Paid bills</span><strong>{bills.filter(b => b.status === "Paid").length}</strong></div>
              <div><span>Pending bills</span><strong>{pendingBills.length}</strong></div>
            </div>
          </div>
          <p className="report-note">Collection includes payments marked Paid in the database. UPI transfers are not independently verified.</p>
        </>
      );
    }

    return <Overview />;
  }

  if (!loggedIn) {
    return (
      <div className="page">
        <div className="login-container">
          <section className="intro-section">
            <div className="login-brand"><span className="brand-symbol">E</span><span><strong>ETERNAL LAKSHMI NILAYAM</strong><small>RESIDENTIAL COMMUNITY</small></span></div>
            <div className="intro-copy">
              <p className="brand">A BETTER WAY TO LIVE TOGETHER</p>
              <h1>Good living<br /><span>starts at home.</span></h1>
              <p className="intro-text">A calmer, clearer way to take care of your home and the community around it.</p>
            </div>
            <div className="feature-list">
              <p><span>✓</span> Monthly maintenance, made simple</p>
              <p><span>✓</span> Clear payments and community expenses</p>
              <p><span>✓</span> One helpful place for every household</p>
            </div>
            <div className="login-community-card"><span className="community-sparkle">✳</span><div><strong>A little more community.</strong><span>Everything your home needs, together.</span></div><span className="community-arrow">↗</span></div>
            <p className="login-art-caption">THOUGHTFULLY MANAGED, BEAUTIFULLY LIVED</p>
          </section>
          <section className="login-section">
            <div className="login-card">
              <p className="login-welcome">WELCOME HOME</p>
              <h2>Good to see you.</h2>
              <p className="login-subtitle">Sign in to your community portal to get started.</p>
              <div className="role-selector">
                <button type="button" className={role === "resident" ? "active" : ""} onClick={() => { setRole("resident"); setMessage(""); setShowPassword(false); }}><span>⌂</span> Resident</button>
                <button type="button" className={role === "admin" ? "active" : ""} onClick={() => { setRole("admin"); setMessage(""); setShowPassword(false); }}><span>▦</span> Admin</button>
              </div>
              <form onSubmit={login}>
                {role === "admin" ? (
                  <>
                    <label>Admin Username</label>
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter admin username" required />
                  </>
                ) : (
                  <>
                    <label>Select Flat Number</label>
                    <select value={flatNumber} onChange={e => setFlatNumber(e.target.value)}>
                      {initialFlats.map(f => <option key={f.number} value={f.number}>Flat {f.number}</option>)}
                    </select>
                  </>
                )}
                <label htmlFor="login-password">Password</label>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="2.5" />
                      {showPassword && <path d="m3 3 18 18" />}
                    </svg>
                  </button>
                </div>
                {message && <p className="error-message">{message}</p>}
                <button className="login-btn" type="submit">Sign in to your account <span>→</span></button>
              </form>
              <p className="login-footer"><span>♧</span> Your community, cared for.</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (role === "resident") {
    return (
      <div className="resident-page">
        <header className="topbar resident-topbar">
          <div className="resident-brand"><span className="brand-symbol">E</span><div><strong>ETERNAL LAKSHMI NILAYAM</strong><small>RESIDENT PORTAL</small></div></div>
          <div className="resident-account"><span className="admin-avatar">⌂</span><div><strong>Flat {flatNumber}</strong><small>Resident account</small></div><button className="logout-btn" onClick={logout}>Sign out</button></div>
        </header>
        <main className="dashboard-content">
          <div className="resident-welcome"><div><p className="dashboard-eyebrow">YOUR HOME, ALL IN ONE PLACE</p><h1>Welcome home.</h1><p className="page-description">Here’s your community update for Flat {flatNumber}.</p></div><span className="soft-tag"><i className="legend-dot occupied-dot" /> Community member</span></div>
          <div className="stats-grid">
            <StatCard title="Your home" value={`Flat ${flatNumber}`} icon="⌂" note="Your registered apartment" />
            <StatCard title="Monthly contribution" value={`₹${PAYMENT_CONFIG.amount.toLocaleString("en-IN")}`} icon="↗" note="Community maintenance" />
            <StatCard title="This month" value={payments[0]?.status === "Paid" ? "Paid" : "Due"} icon={payments[0]?.status === "Paid" ? "✓" : "◷"} note={payments[0]?.status === "Paid" ? "Thank you for contributing" : "Maintenance contribution"} />
          </div>
          <div className="content-card resident-payment-card">
            <div className="resident-qr">
              <QRCodeSVG
                value={maintenanceUpiLink}
                size={220}
                level="M"
                title={`Pay ₹${PAYMENT_CONFIG.amount} maintenance for Flat ${flatNumber}`}
              />
            </div>
            <div className="resident-payment-details">
              <p className="payment-eyebrow">MONTHLY MAINTENANCE</p>
              <h2>Pay ₹{PAYMENT_CONFIG.amount.toLocaleString("en-IN")}</h2>
              <p>Scan this QR code with any UPI app to pay maintenance for Flat {flatNumber}.</p>
              <p className="payment-payee">Pay to {PAYMENT_CONFIG.payeeName}</p>
              {payments[0]?.status === "Paid" ? (
                <p className="resident-payment-confirmation">
                  Paid by {payments[0].method === "UPI" ? "Online (UPI)" : payments[0].method} on {payments[0].date}. Admin totals and reports have been updated.
                </p>
              ) : (
                <>
                  <label className="resident-method-label" htmlFor="resident-payment-method">Payment method</label>
                  <select
                    id="resident-payment-method"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option value="UPI">Online (UPI)</option>
                    <option value="Cash">Cash</option>
                  </select>
                  {paymentMethod === "UPI" && (
                    <a className="primary-btn resident-pay-link" href={maintenanceUpiLink}>
                      Open UPI app
                    </a>
                  )}
                  <button className="primary-btn resident-pay-link" onClick={submitResidentPayment}>
                    Done — Mark as Paid
                  </button>
                  {paymentMessage && <p className="resident-payment-confirmation">{paymentMessage}</p>}
                  {paymentError && <p className="error-message">{paymentError}</p>}
                  <p className="payment-note">Use Done after making the payment. This marks it as paid in the portal; UPI transfers are not independently verified.</p>
                </>
              )}
            </div>
          </div>
          <div className="resident-note-grid">
            <div className="content-card resident-note-card"><span className="resident-note-icon">♡</span><div><strong>Care for your community</strong><p>Your monthly contribution helps keep shared spaces safe, clean and welcoming.</p></div></div>
            <div className="content-card resident-note-card"><span className="resident-note-icon">⌑</span><div><strong>Need a hand?</strong><p>For maintenance questions, please connect with your apartment administrator.</p></div></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-symbol">E</div>
          <div><strong>ETERNAL LAKSHMI NILAYAM</strong><small>COMMUNITY PORTAL</small></div>
        </div>

        <p className="menu-label">MAIN MENU</p>
        <nav>
          {menu.map(item => (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? "selected" : ""}`}
              onClick={() => setActivePage(item.name)}
            >
              <span>{item.icon}</span>{item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <p>Apartment Maintenance</p>
          <small>Management Portal</small>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="breadcrumb">Community management <span>/</span> {activePage}</span>
            <h3>{activePage}</h3>
          </div>
          <div className="admin-user">
            <span className="topbar-status"><i className="live-indicator" /> All systems normal</span>
            <span className="admin-avatar">A</span>
            <div><strong>Administrator</strong><small>Community manager</small></div>
            <button className="logout-btn" onClick={logout}>Sign out</button>
          </div>
        </header>

        <section className="page-content">
          {PageContent()}
        </section>
        <footer className="page-footer">Apartment Maintenance Portal · Admin Panel</footer>
      </main>
    </div>
  );
}

export default App;
