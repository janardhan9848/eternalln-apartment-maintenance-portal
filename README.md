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

Resident names, flat assignments, phone numbers, and apartment expenses are stored in the MySQL `portal_residents` and `portal_expenses` tables. The backend creates these tables and loads their records on startup, so changes remain available after a frontend reload or backend restart.

## 3. Configure the frontend
Open a second terminal in `frontend`:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Azure hosting configuration

The app can be hosted as three Azure resources: Azure Static Web Apps for the frontend, Azure App Service for the Express API, and Azure Database for MySQL Flexible Server for payment records. This repository now includes Azure-compatible frontend routing, configurable API/CORS origins, and optional MySQL TLS.

### Configure the services

1. Create the MySQL schema from `database/schema.sql`. Configure the database firewall or private networking so only the API can reach it; do not allow public access from all IP addresses.
2. Deploy `backend` to a Linux App Service using the Node.js 22 LTS runtime and `npm start`. Add these App Service environment settings:
   - `NODE_ENV=production`
   - `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for the Azure MySQL server
   - `DB_SSL=true`
   - `FRONTEND_ORIGINS=https://<your-static-web-app>.azurestaticapps.net` (include any custom frontend origins as comma-separated values)
3. Create a Static Web App for the frontend. Set its app location to `frontend`, API location to blank, and output location to `dist`. Set `VITE_API_BASE_URL=https://<your-api>.azurewebsites.net/api` in the frontend build environment before building. This is a public URL, not a secret. The included `frontend/public/staticwebapp.config.json` configures SPA route fallback and response headers.
4. Set the API URL in `frontend/.env` for local work if needed; `frontend/.env.example` shows the local default. Keep production credentials in Azure App Service settings or Key Vault, never in frontend variables or source control.

The frontend API URL is selected at build time. Rebuild and redeploy the Static Web App whenever that URL changes.

### Production readiness

This starter must **not** be exposed as a public production service yet. The current backend uses demo passwords and does not enforce authentication/authorization on data routes; staff salary records are still held in process memory. Before public launch, replace the demo login with a supported identity provider, enforce server-side role checks, persist salary records, and review the configured UPI payee details. No Azure resources were created by this setup.

## Important security notes
- This starter is for local development only; it is not ready for live payments or public deployment.
- Payment records marked paid in the portal are not bank-verified; no payment gateway is connected in Phase 1.
- Do not put database passwords, payment secrets, or resident personal information in frontend code or Git.
- Do not expose MySQL port 3306 to the public internet.
- Authentication, role checks, payment verification, audit trails, backups and production deployment are subsequent phases.
