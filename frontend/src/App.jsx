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
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const maintenanceUpiLink = getMaintenanceUpiLink(flatNumber, "monthly");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState(null);
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
    const paymentResult = await api.getPayments(
      loggedInRole === "resident"
        ? { flatNumber: loggedInFlat, currentMonth: true }
        : {}
    );
    setPayments(paymentResult.data);

    if (loggedInRole === "admin") {
      const currentMonthResult = await api.getPayments({ currentMonth: true });
      setBills(currentMonthResult.data.map((payment) => ({
        id: payment.id,
        flat: payment.flat,
        month: payment.month,
        amount: Number(payment.amount),
        status: payment.status === "Paid" ? "Paid" : "Pending"
      })));
    }

    setRole(loggedInRole);
    setFlatNumber(loggedInFlat);
    setActivePage("Overview");
    setLoggedIn(true);
    setPaymentMessage("");
    setPaymentError("");
  } catch (error) {
    setMessage(`Unable to sign in: ${error.message}`);
  }
}


  function logout() {
    setLoggedIn(false);
    setUsername("");
    setPassword("");
    setMessage("");
    setPaymentMessage("");
    setPaymentError("");
    setActivePage("Overview");
  }

  function addResident(event) {
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

    setResidents((currentResidents) => [
      ...currentResidents,
      {
        id: Date.now(),
        name,
        flat: residentFlat,
        phone: residentPhone.trim() || "Not added"
      }
    ]);

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
  }

  function generateBills() {
    const month = new Date().toLocaleString("en-IN", {
      month: "long",
      year: "numeric"
    });

    const newBills = flats
      .filter((flat) => flat.status === "Occupied")
      .filter((flat) => !bills.some(
        (bill) => bill.flat === flat.number && bill.month === month
      ))
      .map((flat) => ({
        id: Date.now() + Number(flat.number),
        flat: flat.number,
        month,
        amount: 1835,
        status: "Pending"
      }));

    if (newBills.length === 0) {
      alert("No new bills to generate. Bills may already exist, or no flats are occupied.");
      return;
    }

    setBills([...bills, ...newBills]);
    alert(`${newBills.length} maintenance bills generated.`);
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
      setBills((currentBills) => currentBills.map((item) =>
        item.id === bill.id ? { ...item, status: "Paid" } : item
      ));
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
      setEditingPaymentId(null);
    } catch (error) {
      setPaymentError(`Unable to save payment: ${error.message}`);
    }
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

  function addExpense(event) {
    event.preventDefault();

    const amount = Number(expenseAmount);
    if (!expenseTitle.trim() || amount <= 0) return;

    setExpenses((currentExpenses) => [
      ...currentExpenses,
      {
        id: Date.now(),
        title: expenseTitle.trim(),
        amount,
        date: new Date().toLocaleDateString("en-IN")
      }
    ]);

    setExpenseTitle("");
    setExpenseAmount("");
    setExpenseForm(false);
  }

  function paySalary() {
    const currentMonth = new Date().toLocaleString("en-IN", {
      month: "long",
      year: "numeric"
    });

    if (staffPayments.some((p) => p.month === currentMonth)) {
      alert("Watchman salary has already been recorded for this month.");
      return;
    }

    setStaffPayments([
      ...staffPayments,
      { id: Date.now(), name: "Watchman", amount: 8000, month: currentMonth }
    ]);

    setExpenses([
      ...expenses,
      {
        id: Date.now() + 1,
        title: "Watchman Salary",
        amount: 8000,
        date: new Date().toLocaleDateString("en-IN")
      }
    ]);

    alert("Watchman salary of ₹8,000 recorded as an expense.");
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
    return (
      <>
        <div className="welcome-row">
          <div>
            <h2>Dashboard Overview</h2>
            <p>Welcome to your apartment management system.</p>
          </div>
          <span className="date-label">
            {new Date().toLocaleDateString("en-IN")}
          </span>
        </div>

        {paymentError && <p className="error-message">{paymentError}</p>}

        <div className="stats-grid">
          <StatCard title="Total Flats" value={flats.length} icon="🏢" note="Configured flats" />
          <StatCard title="Residents" value={residents.length} icon="👥" note="Registered residents" />
          <StatCard title="Total Collection" value={`₹${totalCollection.toLocaleString("en-IN")}`} icon="💳" note="Paid payments only" />
          <StatCard title="Pending Bills" value={pendingBills.length} icon="🧾" note="Awaiting payment" />
        </div>

        <div className="content-card">
          <h3>Apartment Information</h3>
          <div className="info-grid">
            <div><span>Monthly maintenance</span><strong>₹1,835</strong></div>
            <div><span>Billing frequency</span><strong>Monthly</strong></div>
            <div><span>Watchman salary</span><strong>₹8,000</strong></div>
            <div><span>Total expenses</span><strong>₹{totalExpenses.toLocaleString("en-IN")}</strong></div>
          </div>
        </div>

        <div className="content-card">
          <h3>Recent Payments</h3>
          {PaymentTable({ rows: payments.filter((payment) => payment.status === "Paid").slice(0, 5) })}
        </div>
      </>
    );
  }

  function PaymentTable({ rows, editable = false }) {
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
            {rows.length === 0 && <tr><td colSpan={editable ? 7 : 6}>No payment records yet.</td></tr>}
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
          <h2>Flat Management</h2>
          <p className="page-description">View all 10 apartment flats and their occupancy.</p>
          <div className="stats-grid">
            <StatCard title="Total Flats" value={flats.length} icon="🏢" note="All configured flats" />
            <StatCard title="Occupied" value={flats.filter(f => f.status === "Occupied").length} icon="🔑" note="Assigned flats" />
            <StatCard title="Available" value={flats.filter(f => f.status === "Available").length} icon="🏠" note="Unassigned flats" />
          </div>
          <div className="content-card">
            <h3>All Flats</h3>
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
            <div><h2>Resident Management</h2><p className="page-description">Add and view apartment residents.</p></div>
            <button className="primary-btn" onClick={() => setResidentForm(!residentForm)}>
              {residentForm ? "Close Form" : "+ Add Resident"}
            </button>
          </div>

          {residentForm && (
            <form className="content-card data-form" onSubmit={addResident}>
              <h3>New Resident</h3>
              <label>Resident Name</label>
              <input value={residentName} onChange={e => setResidentName(e.target.value)} required placeholder="Enter resident name" />
              <label>Flat Number</label>
              <select value={residentFlat} onChange={e => setResidentFlat(e.target.value)}>
                {flats.filter(f => f.status === "Available").map(f => <option key={f.number} value={f.number}>{f.number}</option>)}
              </select>
              <label>Phone Number</label>
              <input value={residentPhone} onChange={e => setResidentPhone(e.target.value)} placeholder="Enter phone number" />
              <button className="primary-btn" type="submit">Save Resident</button>
            </form>
          )}

          <div className="content-card">
            <h3>Registered Residents ({residents.length})</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Flat</th><th>Phone</th></tr></thead>
                <tbody>
                  {residents.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.flat}</td><td>{r.phone}</td></tr>)}
                  {residents.length === 0 && <tr><td colSpan="3">No residents added.</td></tr>}
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
            <div><h2>Maintenance Bills</h2><p className="page-description">Monthly maintenance amount: ₹1,835 per flat.</p></div>
            <button className="primary-btn" onClick={generateBills}>Generate Monthly Bills</button>
          </div>
          <div className="content-card">
            <h3>Bill Records</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Flat</th><th>Billing Month</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {bills.map(b => (
                    <tr key={b.id}>
                      <td>{b.flat}</td><td>{b.month}</td><td>₹{b.amount.toLocaleString("en-IN")}</td>
                      <td><span className={`status ${b.status === "Paid" ? "paid" : "pending"}`}>{b.status}</span></td>
                      <td>{b.status === "Pending" ? <button className="small-btn" onClick={() => markPaid(b)}>Record Cash Payment</button> : "Completed"}</td>
                    </tr>
                  ))}
                  {bills.length === 0 && <tr><td colSpan="5">No bills generated yet.</td></tr>}
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
          <h2>Payment Management</h2>
          <p className="page-description">View recorded maintenance payments.</p>
          <div className="stats-grid">
            <StatCard title="Total Collection" value={`₹${totalCollection.toLocaleString("en-IN")}`} icon="💳" note="Paid payments only" />
            <StatCard title="Payment Count" value={paidPaymentCount} icon="🧾" note="Paid transactions" />
          </div>
          {paymentError && <p className="error-message">{paymentError}</p>}
          <div className="content-card">
            <h3>Payment History</h3>
            {PaymentTable({ rows: payments, editable: true })}
          </div>
        </>
      );
    }

    if (activePage === "Expenses") {
      return (
        <>
          <div className="page-heading">
            <div><h2>Apartment Expenses</h2><p className="page-description">Record and monitor apartment spending.</p></div>
            <button className="primary-btn" onClick={() => setExpenseForm(!expenseForm)}>
              {expenseForm ? "Close Form" : "+ Add Expense"}
            </button>
          </div>
          {expenseForm && (
            <form className="content-card data-form" onSubmit={addExpense}>
              <h3>New Expense</h3>
              <label>Expense Description</label>
              <input value={expenseTitle} onChange={e => setExpenseTitle(e.target.value)} required placeholder="e.g. Lift maintenance" />
              <label>Amount (₹)</label>
              <input type="number" min="1" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required placeholder="Enter amount" />
              <button className="primary-btn" type="submit">Save Expense</button>
            </form>
          )}
          <div className="content-card">
            <h3>Expense Records</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Description</th><th>Date</th><th>Amount</th></tr></thead>
                <tbody>
                  {expenses.map(e => <tr key={e.id}><td>{e.title}</td><td>{e.date}</td><td>₹{Number(e.amount).toLocaleString("en-IN")}</td></tr>)}
                  {expenses.length === 0 && <tr><td colSpan="3">No expenses recorded.</td></tr>}
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
          <h2>Apartment Reports</h2>
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
            <p className="brand">APARTMENT COMMUNITY</p>
            <h1>Apartment Maintenance Portal</h1>
            <p className="intro-text">Manage monthly maintenance, payments and apartment expenses in one place.</p>
            <div className="feature-list">
              <p>✓ Simple maintenance management</p>
              <p>✓ Monthly billing and payment records</p>
              <p>✓ Apartment expense tracking</p>
            </div>
          </section>
          <section className="login-section">
            <div className="login-card">
              <h2>Welcome Back</h2>
              <p className="login-subtitle">Sign in to continue to your account.</p>
              <div className="role-selector">
                <button type="button" className={role === "resident" ? "active" : ""} onClick={() => { setRole("resident"); setMessage(""); }}>Resident</button>
                <button type="button" className={role === "admin" ? "active" : ""} onClick={() => { setRole("admin"); setMessage(""); }}>Admin</button>
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
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
                {message && <p className="error-message">{message}</p>}
                <button className="login-btn" type="submit">Sign In</button>
              </form>
              <p className="login-footer">Apartment Maintenance Portal</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (role === "resident") {
    return (
      <div className="resident-page">
        <header className="topbar">
          <h2>Apartment Portal</h2>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </header>
        <main className="dashboard-content">
          <h1>Resident Dashboard - Flat {flatNumber}</h1>
          <p className="page-description">Welcome to your apartment portal.</p>
          <div className="stats-grid">
            <StatCard title="Your Flat" value={flatNumber} icon="🏠" note="Registered flat" />
            <StatCard title="Monthly Maintenance" value={`₹${PAYMENT_CONFIG.amount.toLocaleString("en-IN")}`} icon="🧾" note="Monthly charge" />
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
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-symbol">A</div>
          <div><strong>Apartment Portal</strong><small>ADMIN PANEL</small></div>
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
            <span className="breadcrumb">Admin / {activePage}</span>
            <h3>{activePage}</h3>
          </div>
          <div className="admin-user">
            <span className="admin-avatar">A</span>
            <div><strong>Administrator</strong><small>Admin account</small></div>
            <button className="logout-btn" onClick={logout}>Logout</button>
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
