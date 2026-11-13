
const db = require("../config/db");

async function testDatabase() {
  try {
    const connection = await db.getConnection();

    console.log("MySQL Connected Successfully!");

    const [database] = await connection.query(
      "SELECT DATABASE() AS databaseName"
    );

    console.log("Database:", database[0].databaseName);

    const [tables] = await connection.query("SHOW TABLES");

    console.log("Total tables:", tables.length);

    const [flats] = await connection.query(
      "SELECT * FROM flats ORDER BY flat_number"
    );

    console.log("Total flats:", flats.length);
    console.table(flats);

    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:");
    console.error(error.message);
  } finally {
    await db.end();
  }
}

testDatabase();
