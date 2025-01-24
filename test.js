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
const path = require("path");
require("dotenv").config();

const { AccessToken } = require("twilio").jwt;
const { VoiceGrant } = require("twilio").jwt.AccessToken;
const { VoiceResponse } = require("twilio").twiml;

const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);
const messages = []; // Mocked database for SMS messages and others

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---- Voice Endpoints ----
// Generate Voice Access Token
app.post("/voice/token", (req, res) => {
  const { identity } = req.body;

  if (!identity) {
    console.error("Identity is missing in request body");
    return res.status(400).json({ message: "Identity is required" });
  }

  console.log("Generating token for identity:", identity);

  try {
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity }
    );

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_VOICE_APP_SID,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    console.log("Token generated successfully");
    res.json({ token: token.toJwt() });
  } catch (error) {
    console.error("Error generating token:", error.message);
    res
      .status(500)
      .json({ message: "Failed to generate token", error: error.message });
  }
});

// TwiML for Outgoing Calls
app.post("/voice/call", (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).send("Phone number is required");
  }

  const twiml = new VoiceResponse();
  const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER });
  dial.number(to);

  console.log("Generated Outgoing Call TwiML:", twiml.toString());

  res.type("text/xml").send(twiml.toString());
});

// TwiML for Incoming Calls
app.post("/voice/incoming", (req, res) => {
  console.log("Handling incoming call...");
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);

  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.client("web_user");

  console.log("Generated Incoming Call TwiML:", twiml.toString());

  res.type("text/xml").send(twiml.toString());
});

// ---- Email Endpoints ----
// Send Email
app.post("/emails/send", upload.any(), (req, res) => {
  const { to, cc, bcc, subject, body } = req.body;

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

// Fetch Latest Email
app.get("/emails/latest", async (req, res) => {
  try {
    const connection = await imapSimple.connect(imapConfig);
    await connection.openBox("INBOX");

    const searchCriteria = ["ALL"];
    const fetchOptions = {
      bodies: ["HEADER", "TEXT", ""],
      struct: true,
    };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      return res.status(404).json({ message: "No emails found." });
    }

    const latestEmail = messages[messages.length - 1];
    const allParts = imapSimple.getParts(latestEmail.attributes.struct);
    const attachments = [];

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

    const rawEmail = latestEmail.parts.find((part) => part.which === "").body;
    const parsedEmail = await simpleParser(rawEmail);

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

// ---- SMS Endpoints ----
// Existing SMS endpoints here...

// ---- Realtime Chat ----
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("chatMessage", (data) => {
    console.log("Message received:", data);
    io.emit("chatMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
