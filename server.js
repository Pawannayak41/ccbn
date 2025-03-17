const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();
const sql = require("mssql");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: { encrypt: true, enableArithAbort: true },
};

sql.connect(config)
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("Database Connection Failed: ", err));

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_CONTAINER_NAME);

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get("/products", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT * FROM Products");
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/products", upload.single("image"), async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Name and price are required" });

    let imageUrl = null;
    if (req.file) {
      const blobName = uuidv4() + "-" + req.file.originalname;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(req.file.buffer, { blobHTTPHeaders: { blobContentType: req.file.mimetype } });
      imageUrl = blockBlobClient.url;
    }

    const pool = await sql.connect(config);
    await pool.request()
      .input("name", sql.VarChar, name)
      .input("price", sql.Decimal, price)
      .input("imageUrl", sql.VarChar, imageUrl)
      .query("INSERT INTO Products (name, price, imageUrl) VALUES (@name, @price, @imageUrl)");

    res.status(201).json({ message: "Product added successfully", imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await sql.connect(config);
    await pool.request().input("id", sql.Int, id).query("DELETE FROM Products WHERE id = @id");
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));