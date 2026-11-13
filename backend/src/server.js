
import cors from "cors";
import express from "express";
import { pool } from "./config/database.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
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

app.get("/api/flats", (req, res) => {
  res.json({
    success: true,
    data: flats
  });
});

// ==================================================
// RESIDENTS API
// ==================================================

app.get("/api/residents", (req, res) => {
  res.json({
    success: true,
    data: residents
  });
});

app.post("/api/residents", (req, res) => {
  const { name, flat, phone } = req.body || {};

  if (!name || !name.trim() || !flat) {
    return res.status(400).json({
      success: false,
      message: "Resident name and flat number are required"
    });
  }

  const selectedFlat = flats.find(
    item => item.number === String(flat)
  );

  if (!selectedFlat) {
    return res.status(404).json({
      success: false,
      message: "Flat not found"
    });
  }

  if (selectedFlat.status === "Occupied") {
    return res.status(409).json({
      success: false,
      message: "This flat is already occupied"
    });
  }

  const resident = {
    id: Date.now(),
    name: name.trim(),
    flat: selectedFlat.number,
    phone: phone || "Not added"
  };

  residents.push(resident);

  selectedFlat.resident = resident.name;
  selectedFlat.status = "Occupied";

  res.status(201).json({
    success: true,
    message: "Resident added successfully",
    data: resident
  });
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

app.get("/api/expenses", (req, res) => {
  res.json({
    success: true,
    data: expenses
  });
});

app.post("/api/expenses", (req, res) => {
  const { title, amount } = req.body || {};
  const numericAmount = Number(amount);

  if (
    !title ||
    !title.trim() ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid description and amount"
    });
  }

  const expense = {
    id: Date.now(),
    title: title.trim(),
    amount: numericAmount,
    date: new Date().toLocaleDateString("en-IN")
  };

  expenses.push(expense);

  res.status(201).json({
    success: true,
    message: "Expense added successfully",
    data: expense
  });
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

app.post("/api/staff/payments", (req, res) => {
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

  const salary = {
    id: Date.now(),
    name: "Watchman",
    amount: 8000,
    month
  };

  salaryPayments.push(salary);

  // Also record salary as an apartment expense.
  expenses.push({
    id: Date.now() + 1,
    title: "Watchman Salary",
    amount: 8000,
    date: new Date().toLocaleDateString("en-IN")
  });

  res.status(201).json({
    success: true,
    message: "Watchman salary recorded",
    data: salary
  });
});

// ==================================================
// REPORTS API
// ==================================================

app.get("/api/reports", (req, res) => {
  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  ensureCurrentPaymentRecords()
    .then(() => pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS totalCollection,
        SUM(status = 'paid') AS paidBills,
        SUM(status = 'unpaid') AS pendingBills
      FROM maintenance_payment_records`
    ))
    .then(([rows]) => {
      const totalCollection = Number(rows[0].totalCollection);
      res.json({
        success: true,
        data: {
          totalFlats: flats.length,
          totalResidents: residents.length,
          totalCollection,
          totalExpenses,
          balance: totalCollection - totalExpenses,
          paidBills: Number(rows[0].paidBills),
          pendingBills: Number(rows[0].pendingBills)
        }
      });
    })
    .catch((error) => {
      console.error("Unable to load payment report totals:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to load report totals"
      });
    });
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

async function startServer() {
  await pool.query("SELECT 1");
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

  app.listen(PORT, () => {
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
