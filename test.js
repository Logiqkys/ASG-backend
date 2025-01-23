const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const twilio = require("twilio");
require("dotenv").config();
const path = require("path");

const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const app = express();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
const corsOptions = {
  origin: "*", // Allow all origins for simplicity
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let messages = []; // Mocked database for SMS messages

// Endpoint to send SMS
app.post("/sms/send", upload.single("mediaUrl"), (req, res) => {
  const { to, body } = req.body;
  const mediaFile = req.file;
  const messageOptions = { from: "+19137331695", to, body };

  console.log("Received request to send SMS:", { to, body });

  if (mediaFile) {
    const fileUrl = `http://localhost:3000/uploads/${mediaFile.filename}`;
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

// Endpoint to receive incoming SMS
// Endpoint to receive incoming SMS
// Endpoint to receive messages from webhook
app.post("/sms/receive", (req, res) => {
  const { From, To, Body, MediaUrl0 } = req.body;

  console.log("Received SMS webhook payload:", { From, To, Body, MediaUrl0 });

  // Capture messages sent from the Twilio Phone Number
  if (From === "+19016574402") {
    const message = {
      from: From, // Twilio Phone Number
      to: To, // Recipient of the message
      body: Body, // Message content
      attachment: MediaUrl0 || null, // Media URL if present
    };

    messages.unshift(message); // Save the message to the inbox
    console.log("Message saved to inbox:", message);
  } else {
    console.log("Message not saved. It was sent by:", From);
  }

  res.status(200).send("Webhook received successfully.");
});

// Endpoint to fetch all received messages
app.get("/sms/messages", (req, res) => {
  console.log("Fetching all messages...");
  res.json(messages); // Return inbox messages
});

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
