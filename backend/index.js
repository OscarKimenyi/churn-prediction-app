require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");
const FormData = require("form-data");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) throw err;
  console.log("MySQL Connected");
});

// Email transporter for churn alerts
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Register
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hash, role || "manager"],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Registered successfully" });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, results) => {
      if (err || !results.length)
        return res.status(401).json({ error: "Invalid credentials" });
      if (!(await bcrypt.compare(password, results[0].password_hash))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign(
        { id: results[0].id, role: results[0].role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.json({ token });
    }
  );
});

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Get current user
app.get("/me", authenticate, (req, res) => {
  db.query(
    "SELECT username, role FROM users WHERE id = ?",
    [req.user.id],
    (err, results) => {
      if (err || !results.length)
        return res.status(404).json({ error: "User not found" });
      res.json(results[0]);
    }
  );
});

// Upload & train
app.post("/upload", authenticate, upload.single("file"), (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  const filePath = req.file.path;
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      const inserts = results.map((row) => [
        req.user.id,
        row.name || null,
        parseInt(row.tenure) || 0,
        parseInt(row.usage_freq) || 0,
        parseInt(row.complaints) || 0,
      ]);

      db.query(
        "INSERT INTO customers (user_id, name, tenure, usage_freq, complaints) VALUES ?",
        [inserts],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });

          const form = new FormData();
          form.append("file", fs.createReadStream(filePath));
          axios
            .post(`${process.env.ML_SERVICE_URL}/train`, form, {
              headers: form.getHeaders(),
            })
            .then(() =>
              res.json({ message: "Data uploaded and training started" })
            )
            .catch((err) => res.status(500).json({ error: err.message }));
        }
      );
    });
});

// Predict + alerts + recommendations
app.post("/predict", authenticate, (req, res) => {
  db.query(
    "SELECT id, name, tenure, usage_freq, complaints FROM customers WHERE user_id = ?",
    [req.user.id],
    (err, customers) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!customers.length) return res.json({ results: [] });

      const data = customers.map((c) => ({
        tenure: c.tenure,
        usage_freq: c.usage_freq,
        complaints: c.complaints,
      }));

      axios
        .post(`${process.env.ML_SERVICE_URL}/predict`, { data })
        .then((response) => {
          const probs = response.data.predictions;
          const results = customers.map((c, i) => {
            const prob = probs[i];
            const rec =
              prob > 0.5
                ? c.usage_freq < 20
                  ? "Offer discount"
                  : "Send survey"
                : "Low risk";

            // Send email alert if high risk
            if (prob > 0.5) {
              transporter
                .sendMail({
                  from: process.env.EMAIL_USER,
                  to: process.env.EMAIL_USER, // replace with real user/customer email later
                  subject: `High Churn Risk Alert - ${
                    c.name || `Customer ${c.id}`
                  }`,
                  text: `Probability: ${(prob * 100).toFixed(
                    1
                  )}%\nRecommendation: ${rec}\nDetails: Tenure ${
                    c.tenure
                  }, Usage ${c.usage_freq}, Complaints ${c.complaints}`,
                })
                .catch(console.error);
            }

            return {
              id: c.id,
              name: c.name || `Customer ${c.id}`,
              prob,
              rec,
            };
          });

          // Save predictions to DB
          const inserts = probs.map((prob, i) => [customers[i].id, prob]);
          db.query(
            "INSERT INTO predictions (customer_id, churn_prob) VALUES ?",
            [inserts],
            (err) => {
              if (err) console.error("Save predictions failed:", err);
            }
          );

          res.json({ results });
        })
        .catch((err) => res.status(500).json({ error: err.message }));
    }
  );
});

// Dashboard metrics
app.get("/dashboard", authenticate, (req, res) => {
  db.query(
    `
    SELECT AVG(churn_prob) as avg_churn, COUNT(*) as total_customers 
    FROM predictions p JOIN customers c ON p.customer_id = c.id 
    WHERE c.user_id = ?
  `,
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results[0] || { avg_churn: 0, total_customers: 0 });
    }
  );
});

// Clear data
app.post("/clear-data", authenticate, (req, res) => {
  db.query(
    "DELETE FROM predictions WHERE customer_id IN (SELECT id FROM customers WHERE user_id = ?)",
    [req.user.id],
    (err) => {
      if (err)
        return res.status(500).json({ error: "Clear predictions failed" });
      db.query(
        "DELETE FROM customers WHERE user_id = ?",
        [req.user.id],
        (err) => {
          if (err)
            return res.status(500).json({ error: "Clear customers failed" });
          res.json({ message: "All data cleared" });
        }
      );
    }
  );
});

// PDF Report
app.get("/report", authenticate, (req, res) => {
  db.query(
    `
    SELECT c.id, c.name, c.tenure, c.usage_freq, c.complaints, p.churn_prob 
    FROM customers c LEFT JOIN predictions p ON c.id = p.customer_id 
    WHERE c.user_id = ?
  `,
    [req.user.id],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });

      const doc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=churn_report.pdf"
      );
      doc.pipe(res);

      doc.fontSize(20).text("Churn Prediction Report", { align: "center" });
      doc.moveDown();
      data.forEach((row) => {
        doc
          .fontSize(12)
          .text(
            `ID: ${row.id} | Name: ${row.name || "N/A"} | Tenure: ${
              row.tenure
            } | Usage: ${row.usage_freq} | Complaints: ${
              row.complaints
            } | Risk: ${(row.churn_prob * 100 || 0).toFixed(1)}%`
          );
      });
      doc.end();
    }
  );
});

app.listen(3000, () => console.log("Backend running on port 3000"));
