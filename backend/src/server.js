
import cors from "cors";
import express from "express";
import { pool } from "./config/database.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors({
  origin: (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
}));
app.use(express.json());

// ==================================================
// TEMPORARY NON-PAYMENT DATA
// ==================================================

const flats = [
  "101", "102", "201", "202", "301",
  "302", "401", "402", "501", "502"
].map(number => ({
  number,
  resident: "Not assigned",
  status: "Available"
}));

const residents = [];
const bills = [];
const expenses = [];
const salaryPayments = [];

// ==================================================
// HOME AND HEALTH API
// ==================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Apartment Maintenance Portal API is running"
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      backend: "connected",
      database: "connected"
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({
      success: false,
      backend: "connected",
      database: "unavailable"
    });
  }
});

// ==================================================
// LOGIN API — DEMO ONLY
// ==================================================

app.post("/api/auth/login", (req, res) => {
  const { role, username, flatNumber, password } = req.body || {};

  if (role === "admin") {
    if (username === "admin" && password === "Admin@123") {
      return res.json({
        success: true,
        message: "Admin login successful",
        user: {
          role: "admin",
          username: "admin"
        }
      });
    }
  }

  if (role === "resident") {
    const flatExists = flats.some(
      flat => flat.number === flatNumber
    );

    if (flatExists && password === "Resident@123") {
      return res.json({
        success: true,
        message: "Resident login successful",
        user: {
          role: "resident",
          flatNumber
        }
      });
    }
  }

  return res.status(401).json({
    success: false,
    message: "Invalid login details"
  });
});

// ==================================================
// FLATS API
// ==================================================

app.get("/api/flats", async (_req, res) => {
  try {
    const [residentRows] = await pool.query(
      "SELECT full_name, flat_number FROM portal_residents"
    );
    const residentsByFlat = new Map(
      residentRows.map(resident => [resident.flat_number, resident.full_name])
    );
    const data = flats.map(flat => ({
      ...flat,
      resident: residentsByFlat.get(flat.number) || "Not assigned",
      status: residentsByFlat.has(flat.number) ? "Occupied" : "Available"
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error("Unable to load flats:", error.message);
    res.status(500).json({ success: false, message: "Unable to load flats" });
  }
});

// ==================================================
// RESIDENTS API
// ==================================================

app.get("/api/residents", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS name, flat_number AS flat,
        COALESCE(phone, 'Not added') AS phone
      FROM portal_residents
      ORDER BY flat_number`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Unable to load residents:", error.message);
    res.status(500).json({ success: false, message: "Unable to load residents" });
  }
});

app.post("/api/residents", async (req, res) => {
  const { name, flat, phone } = req.body || {};
  const residentName = typeof name === "string" ? name.trim() : "";
  const flatNumber = String(flat || "").trim();
  const residentPhone = typeof phone === "string" ? phone.trim() : "";

  if (!residentName || residentName.length > 120 || !flatNumber || residentPhone.length > 20) {
    return res.status(400).json({
      success: false,
      message: "Enter a resident name (up to 120 characters), a valid flat number, and a phone number up to 20 characters"
    });
  }

  const selectedFlat = flats.find(item => item.number === flatNumber);

  if (!selectedFlat) {
    return res.status(404).json({
      success: false,
      message: "Flat not found"
    });
  }

  try {
    const [existingResidents] = await pool.execute(
      "SELECT id FROM portal_residents WHERE flat_number = ?",
      [flatNumber]
    );
    if (existingResidents.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This flat is already occupied"
      });
    }

    const [result] = await pool.execute(
      "INSERT INTO portal_residents (full_name, flat_number, phone) VALUES (?, ?, ?)",
      [residentName, flatNumber, residentPhone || null]
    );
    const resident = {
      id: Number(result.insertId),
      name: residentName,
      flat: flatNumber,
      phone: residentPhone || "Not added"
    };

    residents.push(resident);
    selectedFlat.resident = resident.name;
    selectedFlat.status = "Occupied";

    res.status(201).json({
      success: true,
      message: "Resident saved successfully",
      data: resident
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "This flat already has a registered resident" });
    }
    console.error("Unable to save resident:", error.message);
    res.status(500).json({ success: false, message: "Unable to save resident" });
  }
});

app.delete("/api/residents/:id", async (req, res) => {
  const residentId = Number(req.params.id);
  if (!Number.isSafeInteger(residentId) || residentId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid resident ID" });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT id, flat_number AS flat FROM portal_residents WHERE id = ?",
      [residentId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Resident not found" });
    }

    await pool.execute("DELETE FROM portal_residents WHERE id = ?", [residentId]);
    const residentIndex = residents.findIndex(resident => resident.id === residentId);
    if (residentIndex !== -1) residents.splice(residentIndex, 1);
    const selectedFlat = flats.find(item => item.number === rows[0].flat);
    if (selectedFlat) {
      selectedFlat.resident = "Not assigned";
      selectedFlat.status = "Available";
    }

    res.json({ success: true, message: "Resident removed successfully" });
  } catch (error) {
    console.error("Unable to remove resident:", error.message);
    res.status(500).json({ success: false, message: "Unable to remove resident" });
  }
});

// ==================================================
// MAINTENANCE BILL API
// ==================================================

app.get("/api/bills", (req, res) => {
  res.json({
    success: true,
    data: bills
  });
});

app.post("/api/bills/generate", (req, res) => {
  const { month } = req.body || {};

  if (!month) {
    return res.status(400).json({
      success: false,
      message: "Billing month is required"
    });
  }

  const newBills = flats
    .filter(flat => flat.status === "Occupied")
    .filter(flat => !bills.some(
      bill =>
        bill.flat === flat.number &&
        bill.month === month
    ))
    .map(flat => ({
      id: Date.now() + Number(flat.number),
      flat: flat.number,
      month,
      amount: 1835,
      status: "Pending"
    }));

  bills.push(...newBills);

  res.status(201).json({
    success: true,
    message: `${newBills.length} bills generated`,
    data: newBills
  });
});

// ==================================================
// PAYMENT API
// ==================================================

app.get("/api/payments", async (req, res) => {
  try {
    await ensureCurrentPaymentRecords();

    const conditions = [];
    const values = [];
    if (req.query.flat) {
      conditions.push("r.flat_number = ?");
      values.push(String(req.query.flat));
    }
    if (req.query.currentMonth === "true") {
      conditions.push("r.billing_month = DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')");
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [records] = await pool.execute(
      `SELECT
        r.id,
        r.flat_number AS flat,
        r.amount,
        DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS date,
        r.payment_method AS method,
        CASE r.status WHEN 'paid' THEN 'Paid' ELSE 'Unpaid' END AS status,
        DATE_FORMAT(r.billing_month, '%M %Y') AS month
      FROM maintenance_payment_records r
      ${where}
      ORDER BY r.billing_month DESC, r.flat_number`,
      values
    );

    res.json({ success: true, data: records });
  } catch (error) {
    console.error("Unable to load payment records:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to load payment records"
    });
  }
});

app.post("/api/payments/submit", async (req, res) => {
  const { flat, method } = req.body || {};

  if (!flat || !["Cash", "UPI"].includes(method)) {
    return res.status(400).json({
      success: false,
      message: "A flat number and valid payment method are required"
    });
  }

  try {
    await ensureCurrentPaymentRecords();
    await pool.execute(
      `UPDATE maintenance_payment_records
      SET payment_date = CURRENT_DATE, payment_method = ?, status = 'paid'
      WHERE flat_number = ?
        AND billing_month = DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`,
      [method, String(flat)]
    );

    const [records] = await pool.execute(
      `SELECT
        r.id,
        r.flat_number AS flat,
        r.amount,
        DATE_FORMAT(r.payment_date, '%Y-%m-%d') AS date,
        r.payment_method AS method,
        'Paid' AS status,
        DATE_FORMAT(r.billing_month, '%M %Y') AS month
      FROM maintenance_payment_records r
      WHERE r.flat_number = ?
        AND r.billing_month = DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`,
      [String(flat)]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment record was found for this flat"
      });
    }

    res.json({
      success: true,
      message: "Payment marked as paid",
      data: records[0]
    });
  } catch (error) {
    console.error("Unable to record resident payment:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to record payment"
    });
  }
});

app.patch("/api/payments/:id", async (req, res) => {
  const { date, method, status } = req.body || {};
  const normalizedStatus = status === "Paid" ? "paid" : status === "Unpaid" ? "unpaid" : null;
  const validDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const paymentId = Number(req.params.id);

  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0 ||
    !normalizedStatus ||
    (normalizedStatus === "paid" && (!validDate || !["Cash", "UPI"].includes(method))) ||
    (date && !validDate)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid payment status, date, and method"
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE maintenance_payment_records
      SET status = ?, payment_date = ?, payment_method = ?
      WHERE id = ?`,
      [
        normalizedStatus,
        normalizedStatus === "paid" ? date : null,
        normalizedStatus === "paid" ? method : null,
        paymentId
      ]
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.execute(
        "SELECT id FROM maintenance_payment_records WHERE id = ?",
        [paymentId]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payment record not found"
        });
      }
    }

    res.json({ success: true, message: "Payment record updated" });
  } catch (error) {
    console.error("Unable to update payment record:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update payment record"
    });
  }
});

// ==================================================
// EXPENSE API
// ==================================================

app.get("/api/expenses", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, amount, DATE_FORMAT(expense_date, '%d-%b-%Y') AS date
      FROM portal_expenses ORDER BY expense_date DESC, id DESC`
    );
    const data = rows.map(expense => ({
      ...expense,
      id: Number(expense.id),
      amount: Number(expense.amount)
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error("Unable to load expenses:", error.message);
    res.status(500).json({ success: false, message: "Unable to load expenses" });
  }
});

app.post("/api/expenses", async (req, res) => {
  const { title, amount } = req.body || {};
  const expenseTitle = typeof title === "string" ? title.trim() : "";
  const numericAmount = Number(amount);
  const decimalPart = String(amount).split(".")[1] || "";

  if (
    !expenseTitle ||
    expenseTitle.length > 255 ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    numericAmount > 99999999.99 ||
    decimalPart.length > 2
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid description and amount"
    });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO portal_expenses (title, amount, expense_date) VALUES (?, ?, CURRENT_DATE)",
      [expenseTitle, numericAmount]
    );
    const [rows] = await pool.execute(
      `SELECT id, title, amount, DATE_FORMAT(expense_date, '%d-%b-%Y') AS date
      FROM portal_expenses WHERE id = ?`,
      [result.insertId]
    );
    const expense = { ...rows[0], id: Number(rows[0].id), amount: Number(rows[0].amount) };
    expenses.push(expense);
    res.status(201).json({ success: true, message: "Expense saved successfully", data: expense });
  } catch (error) {
    console.error("Unable to save expense:", error.message);
    res.status(500).json({ success: false, message: "Unable to save expense" });
  }
});

app.patch("/api/expenses/:id", async (req, res) => {
  const expenseId = Number(req.params.id);
  const { title, amount } = req.body || {};
  const expenseTitle = typeof title === "string" ? title.trim() : "";
  const numericAmount = Number(amount);
  const decimalPart = String(amount).split(".")[1] || "";

  if (
    !Number.isSafeInteger(expenseId) || expenseId <= 0 ||
    !expenseTitle || expenseTitle.length > 255 ||
    !Number.isFinite(numericAmount) || numericAmount <= 0 ||
    numericAmount > 99999999.99 ||
    decimalPart.length > 2
  ) {
    return res.status(400).json({ success: false, message: "Enter a valid expense description and amount" });
  }

  try {
    await pool.execute(
      "UPDATE portal_expenses SET title = ?, amount = ? WHERE id = ?",
      [expenseTitle, numericAmount, expenseId]
    );
    const [rows] = await pool.execute(
      `SELECT id, title, amount, DATE_FORMAT(expense_date, '%d-%b-%Y') AS date
      FROM portal_expenses WHERE id = ?`,
      [expenseId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const updatedExpense = { ...rows[0], id: Number(rows[0].id), amount: Number(rows[0].amount) };
    const expenseIndex = expenses.findIndex(expense => expense.id === expenseId);
    if (expenseIndex !== -1) expenses[expenseIndex] = updatedExpense;
    res.json({ success: true, message: "Expense updated successfully", data: updatedExpense });
  } catch (error) {
    console.error("Unable to update expense:", error.message);
    res.status(500).json({ success: false, message: "Unable to update expense" });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  const expenseId = Number(req.params.id);
  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid expense ID" });
  }

  try {
    const [result] = await pool.execute("DELETE FROM portal_expenses WHERE id = ?", [expenseId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }
    const expenseIndex = expenses.findIndex(expense => expense.id === expenseId);
    if (expenseIndex !== -1) expenses.splice(expenseIndex, 1);
    res.json({ success: true, message: "Expense removed successfully" });
  } catch (error) {
    console.error("Unable to remove expense:", error.message);
    res.status(500).json({ success: false, message: "Unable to remove expense" });
  }
});

// ==================================================
// STAFF AND WATCHMAN SALARY API
// ==================================================

app.get("/api/staff", (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        name: "Watchman",
        monthlySalary: 8000
      }
    ]
  });
});

app.post("/api/staff/payments", async (req, res) => {
  const { month } = req.body || {};

  if (!month) {
    return res.status(400).json({
      success: false,
      message: "Salary month is required"
    });
  }

  const alreadyPaid = salaryPayments.some(
    payment => payment.month === month
  );

  if (alreadyPaid) {
    return res.status(409).json({
      success: false,
      message: "Salary already recorded for this month"
    });
  }

  try {
    const [expenseResult] = await pool.query(
      "INSERT INTO portal_expenses (title, amount, expense_date) VALUES ('Watchman Salary', 8000, CURRENT_DATE)"
    );
    const [expenseRows] = await pool.execute(
      `SELECT id, title, amount, DATE_FORMAT(expense_date, '%d-%b-%Y') AS date
      FROM portal_expenses WHERE id = ?`,
      [expenseResult.insertId]
    );
    expenses.push({
      ...expenseRows[0],
      id: Number(expenseRows[0].id),
      amount: Number(expenseRows[0].amount)
    });

    const salary = {
      id: Date.now(),
      name: "Watchman",
      amount: 8000,
      month
    };
    salaryPayments.push(salary);

    res.status(201).json({
      success: true,
      message: "Watchman salary recorded",
      data: salary
    });
  } catch (error) {
    console.error("Unable to record watchman salary:", error.message);
    res.status(500).json({ success: false, message: "Unable to record watchman salary" });
  }
});

// ==================================================
// REPORTS API
// ==================================================

app.get("/api/reports", async (_req, res) => {
  try {
    await ensureCurrentPaymentRecords();
    const [[paymentRows], [managementRows]] = await Promise.all([
      pool.query(
        `SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS totalCollection,
        SUM(status = 'paid') AS paidBills,
        SUM(status = 'unpaid') AS pendingBills
        FROM maintenance_payment_records`
      ),
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM portal_residents) AS totalResidents,
          COALESCE((SELECT SUM(amount) FROM portal_expenses), 0) AS totalExpenses`
      )
    ]);
    const totalCollection = Number(paymentRows[0].totalCollection);
    const totalExpenses = Number(managementRows[0].totalExpenses);
    res.json({
      success: true,
      data: {
        totalFlats: flats.length,
        totalResidents: Number(managementRows[0].totalResidents),
        totalCollection,
        totalExpenses,
        balance: totalCollection - totalExpenses,
        paidBills: Number(paymentRows[0].paidBills),
        pendingBills: Number(paymentRows[0].pendingBills)
      }
    });
  } catch (error) {
    console.error("Unable to load payment report totals:", error.message);
    res.status(500).json({ success: false, message: "Unable to load report totals" });
  }
});

// ==================================================
// UNKNOWN API ROUTES
// ==================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

// ==================================================
// START BACKEND SERVER
// ==================================================

async function ensureCurrentPaymentRecords() {
  await pool.query(
    `INSERT INTO maintenance_payment_records (flat_number, billing_month, amount)
    SELECT f.flat_number, DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), 1835
    FROM flats f
    ON DUPLICATE KEY UPDATE amount = 1835`
  );
}

async function initializeManagementData() {
  const [residentTables] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.tables
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_residents'`
  );
  const [expenseTables] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.tables
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_expenses'`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_residents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(120) NOT NULL,
      flat_number VARCHAR(10) NOT NULL,
      phone VARCHAR(20) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT uq_portal_resident_flat UNIQUE (flat_number)
    ) ENGINE=InnoDB`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_expenses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      expense_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT chk_portal_expense_amount CHECK (amount > 0),
      INDEX idx_portal_expenses_date (expense_date)
    ) ENGINE=InnoDB`
  );

  if (residentTables.length === 0) {
    await pool.query(
      `INSERT INTO portal_residents (full_name, flat_number)
      VALUES ('Resident 101', '101'), ('Resident 102', '102')`
    );
  }
  if (expenseTables.length === 0) {
    await pool.query(
      `INSERT INTO portal_expenses (title, amount, expense_date)
      VALUES ('Cleaning', 1500, '2026-11-01')`
    );
  }

  const [residentRows] = await pool.query(
    `SELECT id, full_name AS name, flat_number AS flat,
      COALESCE(phone, 'Not added') AS phone
    FROM portal_residents ORDER BY flat_number`
  );
  residents.splice(
    0,
    residents.length,
    ...residentRows.map(resident => ({ ...resident, id: Number(resident.id) }))
  );

  for (const flat of flats) {
    const resident = residents.find(item => item.flat === flat.number);
    flat.resident = resident ? resident.name : "Not assigned";
    flat.status = resident ? "Occupied" : "Available";
  }

  const [expenseRows] = await pool.query(
    `SELECT id, title, amount, DATE_FORMAT(expense_date, '%d-%b-%Y') AS date
    FROM portal_expenses ORDER BY expense_date DESC, id DESC`
  );
  expenses.splice(
    0,
    expenses.length,
    ...expenseRows.map(expense => ({
      ...expense,
      id: Number(expense.id),
      amount: Number(expense.amount)
    }))
  );
}

async function startServer() {
  await pool.query("SELECT 1");
  await initializeManagementData();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS maintenance_payment_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      flat_number VARCHAR(10) NOT NULL,
      billing_month DATE NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 1835.00,
      payment_date DATE NULL,
      payment_method ENUM('Cash','UPI') NULL,
      status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT uq_payment_record_flat_month UNIQUE (flat_number, billing_month),
      CONSTRAINT chk_payment_record_amount CHECK (amount = 1835.00),
      INDEX idx_payment_records_month_status (billing_month, status)
    ) ENGINE=InnoDB`
  );
  await ensureCurrentPaymentRecords();

  app.listen(PORT, "127.0.0.1", () => {
    console.log("Apartment Maintenance Portal backend running");
    console.log(`Server: http://localhost:${PORT}`);
    console.log("Database: connected");
  });
}

startServer().catch(async (error) => {
  console.error("Backend startup failed:", error.message);
  await pool.end();
  process.exitCode = 1;
});
