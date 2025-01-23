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
  const messageOptions = { from: "+19016574402", to, body };

  console.log("Received request to send SMS:", { to, body });

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

// Endpoint to receive incoming SMS
app.get("/sms/sent", async (req, res) => {
  try {
    console.log("Fetching sent messages...");
    const messages = await client.messages.list({
      from: "+19016574402", // Filter by Twilio virtual phone number
      limit: 20, // Adjust the limit as needed
    });

    console.log("Sent messages fetched successfully:", messages);
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
