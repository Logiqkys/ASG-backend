const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const nodemailer = require("nodemailer");
const imapSimple = require("imap-simple");
const { simpleParser } = require("mailparser");
const http = require("http");
const twilio = require("twilio");
const { Server } = require("socket.io");
require("dotenv").config();
const path = require("path");

const accountSid = process.env.ACCOUNT_SID; // Replace with your Account SID
const authToken = process.env.AUTH_TOKEN; // Replace with your Auth Token
const client = twilio(accountSid, authToken);
const messages = [];

// Initialize app
const app = express();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error(
        "Invalid file type. Only JPEG, PNG, and PDF are allowed."
      );
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  },
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// IMAP Configuration
const imapConfig = {
  imap: {
    user: process.env.IMAP_USER, // Your email address
    password: process.env.IMAP_PASS, // Your email password
    host: "imap.gmail.com", // IMAP host for Gmail
    port: 993, // IMAP port
    tls: true,
    authTimeout: 3000,
    tlsOptions: {
      rejectUnauthorized: false, // Ignore self-signed cert errors
    },
  },
};

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Endpoint to Send Email
app.post("/emails/send", upload.any(), (req, res) => {
  const { to, cc, bcc, subject, body } = req.body;

  // Convert attachments
  const attachments = req.files.map((file) => ({
    filename: file.originalname,
    content: file.buffer,
  }));

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    cc,
    bcc,
    subject,
    text: body,
    attachments,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ message: "Failed to send email", error });
    } else {
      console.log("Email sent:", info.response);
      res.json({ message: "Email sent successfully!" });
    }
  });
});

// Endpoint to fetch the latest email
app.get("/emails/latest", async (req, res) => {
  try {
    // Connect to IMAP
    const connection = await imapSimple.connect(imapConfig);

    // Open INBOX
    await connection.openBox("INBOX");

    // Search for the most recent email
    const searchCriteria = ["ALL"];
    const fetchOptions = {
      bodies: ["HEADER", "TEXT", ""],
      struct: true,
    };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      return res.status(404).json({ message: "No emails found." });
    }

    // Get the most recent email
    const latestEmail = messages[messages.length - 1];
    const allParts = imapSimple.getParts(latestEmail.attributes.struct);
    const attachments = [];

    // Parse attachments
    for (const part of allParts) {
      if (
        part.disposition &&
        part.disposition.type.toUpperCase() === "ATTACHMENT"
      ) {
        const attachment = await connection.getPartData(latestEmail, part);
        attachments.push({
          filename: part.disposition.params.filename,
          content: attachment,
        });
      }
    }

    // Parse email body
    const rawEmail = latestEmail.parts.find((part) => part.which === "").body;
    const parsedEmail = await simpleParser(rawEmail);

    // Respond with parsed email data
    res.json({
      subject: parsedEmail.subject,
      from: parsedEmail.from.text,
      to: parsedEmail.to.text,
      cc: parsedEmail.cc ? parsedEmail.cc.text : null,
      bcc: parsedEmail.bcc ? parsedEmail.bcc.text : null,
      textBody: parsedEmail.text,
      htmlBody: parsedEmail.html,
      attachments: attachments.map((att) => ({ filename: att.filename })),
    });

    connection.end();
  } catch (error) {
    console.error("Error fetching email:", error);
    res.status(500).json({ message: "Failed to fetch email", error });
  }
});

// Real-Time Chat with Socket.IO
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Listen for incoming chat messages
  socket.on("chatMessage", (data) => {
    console.log("Message received:", data);

    // Broadcast the message to all connected clients
    if (data.attachment) {
      const buffer = Buffer.from(
        data.attachment.content.split(",")[1],
        "base64"
      ); // Decode Base64
      data.attachment.url = `data:application/octet-stream;base64,${buffer.toString(
        "base64"
      )}`;
    }

    io.emit("chatMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
