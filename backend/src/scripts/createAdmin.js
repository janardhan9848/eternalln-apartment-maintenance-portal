
// import "dotenv/config";
// import bcrypt from "bcryptjs";
// import readline from "node:readline/promises";
// import { stdin as input, stdout as output } from "node:process";
// import { pool } from "../config/database.js";

// const rl = readline.createInterface({ input, output });

// try {
//   console.log("\n=== Create Apartment Portal Admin ===");

//   const username = (await rl.question("Admin username: ")).trim();
//   const fullName = (await rl.question("Admin full name: ")).trim();
//   const password = await rl.question("Create a strong admin password: ");

//   if (!username || !fullName || password.length < 10) {
//     throw new Error("Enter a username, full name, and password of at least 10 characters.");
//   }

//   const [existing] = await pool.execute(
//     "SELECT id FROM users WHERE username = ?",
//     [username]
//   );

//   if (existing.length > 0) {
//     throw new Error("This username already exists. Choose another username.");
//   }

//   const passwordHash = await bcrypt.hash(password, 12);

//   await pool.execute(
//     `INSERT INTO users
//       (apartment_id, flat_id, full_name, username, password_hash,
//        role, is_active, must_change_password)
//      VALUES (?, NULL, ?, ?, ?, 'admin', 1, 0)`,
//     [1, fullName, username, passwordHash]
//   );

//   console.log("\nSUCCESS: Admin account created.");
//   console.log("Username:", username);
//   console.log("Role: admin");
//   console.log("Your password is stored as a hash.");
// } catch (error) {
//   console.error("\nERROR:", error.message);
// } finally {
//   rl.close();
//   await pool.end();
// }

import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pool } from "../config/database.js";

const rl = readline.createInterface({ input, output });

try {
  console.log("\n=== Create Apartment Portal Admin ===");

  const username = (await rl.question("Admin username: ")).trim();
  const fullName = (await rl.question("Admin full name: ")).trim();
  const password = await rl.question("Create a new strong password: ");

  if (!username || !fullName || password.length < 10) {
    throw new Error("Username and full name are required. Password must have at least 10 characters.");
  }

  const [apartments] = await pool.execute(
    "SELECT id FROM apartments ORDER BY id LIMIT 1"
  );

  if (apartments.length === 0) {
    throw new Error("No apartment found in the apartments table.");
  }

  const [existing] = await pool.execute(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );

  if (existing.length > 0) {
    throw new Error("Username already exists. Choose another.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.execute(
    `INSERT INTO users
      (apartment_id, full_name, username, password_hash, role,
       is_active, must_change_password)
     VALUES (?, ?, ?, ?, 'admin', 1, 0)`,
    [apartments[0].id, fullName, username, passwordHash]
  );

  console.log("\nSUCCESS: Admin account created.");
  console.log("Username:", username);
  console.log("Role: admin");
} catch (error) {
  console.error("\nERROR:", error.message);
} finally {
  rl.close();
  await pool.end();
}
