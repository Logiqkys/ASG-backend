const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { VoiceResponse } = require("twilio").twiml;
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant; // Correctly reference VoiceGrant
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const appToken = process.env.TWILIO_VOICE_APP_SID;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Generate Voice Access Token
// Generate Voice Access Token
app.post("/voice/token", (req, res) => {
  const { identity } = req.body;

  if (!identity) {
    console.error("Identity is missing in request body");
    return res.status(400).json({ message: "Identity is required" });
  }

  console.log("Generating token for identity:", identity);

  try {
    // Initialize the AccessToken
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity } // Explicitly set the identity here
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

// TwiML for Outgoing Calls
app.post("/voice/call", (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).send("Phone number is required");
  }

  const twiml = new VoiceResponse();
  const dial = twiml.dial({ callerId: phoneNumber });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
