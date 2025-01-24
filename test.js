const express = require("express");
const bodyParser = require("body-parser");
const js2xml = require("js2xmlparser");
const { VoiceResponse } = require("twilio").twiml;
const twilio = require("twilio");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Twilio Credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const appToken = process.env.TWILIO_VOICE_APP_SID;
const YOUR_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Generate a Capability Token
app.post("/voice/token", (req, res) => {
  const { identity } = req.body;

  if (!identity) {
    return res.status(400).send({ message: "Identity is required" });
  }

  const capability = new twilio.jwt.ClientCapability({
    accountSid,
    authToken,
  });

  // Allow incoming and outgoing calls
  capability.addScope(
    new twilio.jwt.ClientCapability.IncomingClientScope(identity)
  );
  capability.addScope(
    new twilio.jwt.ClientCapability.OutgoingClientScope({
      applicationSid: appToken,
    })
  );

  res.json({ token: capability.toJwt() });
});

// Generate TwiML for Outgoing Calls
app.post("/voice/call", (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).send("Phone number is required");
  }

  const twiml = new VoiceResponse();
  const dial = twiml.dial({ callerId: YOUR_TWILIO_NUMBER });
  dial.number(to);

  res.type("text/xml").send(twiml.toString());
});

// Forward Incoming Calls
app.post("/voice/incoming", (req, res) => {
  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.client("web_user"); // Send to your Angular client app

  res.type("text/xml").send(twiml.toString());
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
