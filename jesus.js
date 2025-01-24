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

const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;

const client = twilio(accountSid, authToken);
let messages = []; // Mocked database for SMS messages and others
const { AccessToken } = require("twilio").jwt;
const { VoiceGrant } = require("twilio").jwt.AccessToken;
const { VoiceResponse } = require("twilio").twiml; // Import VoiceResponse

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
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---- IMAP Configuration (Email) ----
const imapConfig = {
  imap: {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASS,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    authTimeout: 3000,
    tlsOptions: {
      rejectUnauthorized: false,
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

// ---- Voice Endpoints ----
// Generate Voice Access Token Endpoint
app.post("/voice/token", (req, res) => {
  console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
  console.log("TWILIO_API_KEY:", process.env.TWILIO_API_KEY);
  console.log("TWILIO_API_SECRET:", process.env.TWILIO_API_SECRET);
  console.log("TWILIO_VOICE_APP_SID:", process.env.TWILIO_VOICE_APP_SID);

  const { identity } = req.body; // Get identity from the request body

  if (!identity) {
    return res.status(400).json({ message: "Identity is required" });
  }

  try {
    console.log("Generating token for identity:", identity);

    // Initialize the AccessToken
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity } // Pass identity correctly here
    );

    // Create a Voice Grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_VOICE_APP_SID,
      incomingAllow: true, // Allow incoming calls
    });

    // Add the Voice Grant to the token
    token.addGrant(voiceGrant);

    // Respond with the generated token
    console.log("Token generated successfully");
    res.json({ token: token.toJwt() });
  } catch (error) {
    console.error("Error generating token:", error.message);
    res
      .status(500)
      .json({ message: "Failed to generate token", error: error.message });
  }
});

// TwiML Endpoint for Incoming and Outgoing Calls
app.post("/voice/call", (req, res) => {
  const { to } = req.body;

  const twiml = new VoiceResponse();

  if (to) {
    const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER });
    dial.number(to);
  } else {
    twiml.say("Thank you for calling! Please wait while we connect you.");
  }

  // Log the generated TwiML
  console.log("Generated TwiML:", twiml.toString());

  res.type("text/xml");
  res.send(twiml.toString());
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

// Send SMS
app.post("/sms/send", upload.single("mediaUrl"), (req, res) => {
  const { to, body } = req.body;
  const mediaFile = req.file;
  const messageOptions = { from: "+19016574402", to, body };

  if (mediaFile) {
    const fileUrl = `https://asg-backend-dwi1.onrender.com/uploads/${mediaFile.filename}`;
    messageOptions.mediaUrl = [fileUrl];
    console.log("File URL generated:", fileUrl);
  }

  client.messages
    .create(messageOptions)
    .then((message) => {
      console.log("Message sent successfully:", message.sid);
      res.json({ success: true, sid: message.sid });
    })
    .catch((error) => {
      console.error("Error sending SMS:", error);
      res.status(500).json({ success: false, error: error.message });
    });
});

// Fetch Sent SMS
app.get("/sms/sent", async (req, res) => {
  try {
    const messages = await client.messages.list({
      from: "+19016574402",
      limit: 20,
    });

    const formattedMessages = messages.map((msg) => ({
      sid: msg.sid,
      to: msg.to,
      from: msg.from,
      body: msg.body,
      dateSent: msg.dateSent,
      status: msg.status,
    }));
    res.json({ success: true, messages: formattedMessages });
  } catch (error) {
    console.error("Error fetching sent messages:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch All Received SMS
app.get("/sms/messages", (req, res) => {
  res.json(messages);
});

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
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
