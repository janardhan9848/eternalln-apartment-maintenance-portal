# Apartment Maintenance Portal — Phase 1 Starter

This is a local development starter for a 10-flat apartment maintenance portal.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL 8.4 LTS
- Currency/time zone: INR / Asia-Kolkata

## Before running
Install Node.js LTS, MySQL Server 8.4, MySQL Workbench, VS Code and Git.

## 1. Create the database
1. Open MySQL Workbench and connect to your local MySQL server.
2. Open `database/schema.sql`.
3. Execute the complete script.
4. Confirm that `apartment_maintenance_db` and its tables appear in the Schemas panel.

The SQL creates the apartment and its ten flats. It intentionally does not create a default admin password. An admin account will be created securely in the authentication phase.

## 2. Configure the backend
Open a terminal in `backend`:

```powershell
Copy-Item .env.example .env
npm install
```

Edit `.env` and set your local MySQL username/password. Never commit `.env` or share it.

Start the backend:

```powershell
npm run dev
```

Open `http://localhost:4000/api/health`. You should see a JSON response with `database: "connected"`.

Payment records are stored in MySQL for each flat and billing month. The backend creates the payment-records table at startup if it is missing; the table is also included in `database/schema.sql`. Residents select UPI or cash and use **Done — Mark as Paid** after paying. This updates the admin payment history and collection totals; UPI payments are not independently verified. Admins can edit payment dates, methods and statuses from Payment Management.

## 3. Configure the frontend
Open a second terminal in `frontend`:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Important security notes
- This starter is for local development only; it is not ready for live payments or public deployment.
- Payment records marked paid in the portal are not bank-verified; no payment gateway is connected in Phase 1.
- Do not put database passwords, payment secrets, or resident personal information in frontend code or Git.
- Do not expose MySQL port 3306 to the public internet.
- Authentication, role checks, payment verification, audit trails, backups and production deployment are subsequent phases.
