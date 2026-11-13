import { Router } from "express";
import { pool } from "../config/database.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      application: "Apartment Maintenance Portal API",
      database: "connected"
    });

  } catch (error) {

    console.error("MYSQL CONNECTION ERROR:", error.code, error.message);

    res.status(503).json({
      status: "error",
      database: "unavailable"
    });
  }
});

export default router;