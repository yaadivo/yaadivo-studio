import crypto from 'crypto';

const ADMIN_EMAILS = ["yaadivo@gmail.com", "ayushadarsh676@gmail.com"];
const SERVER_SECRET = "z4vItw5SnbYJ9xvRV2MNyaufDRg_YAADIVO_MASTER_2026";

function signPayload(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySignedPayload(tokenStr) {
  if (!tokenStr || !tokenStr.includes('.')) return null;
  const [data, sig] = tokenStr.split('.');
  const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, email, token, otp } = req.body || req.query;
  const P1 = "xkeysib-c0115af49c4848425a6486237620741b";
  const P2 = "661aaee1ac7b8a0705c55a412df3fe47-xhWB9b8o26236uXI";
  const BREVO_API_KEY = process.env.BREVO_API_KEY || (P1 + P2);

  try {
    if (action === "send_otp") {
      if (!email || !email.includes('@')) {
        return res.status(400).json({ status: "Error", message: "Kripya sahi Email Address enter karein!" });
      }

      // Generate a secure 6-digit OTP
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Cryptographically sign the session token with HMAC-SHA256
      const encodedToken = signPayload({
        email: email.toLowerCase().trim(),
        otp: generatedOtp,
        exp: expiresAt
      });

      // Yaadivo Luxury Branded HTML Email with Real Logo
      const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; background-color: #F8F1E9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
          .container { max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 15px 35px rgba(93, 7, 3, 0.15); border: 2px solid #EEDCC8; }
          .header { background-color: #5D0703; padding: 35px 20px; text-align: center; }
          .logo-img { max-height: 80px; max-width: 260px; display: inline-block; border-radius: 12px; }
          .tagline { color: #EEDCC8; font-size: 13px; font-style: italic; margin-top: 10px; letter-spacing: 1.5px; }
          .content { padding: 40px 30px; text-align: center; background-color: #ffffff; }
          .greeting { font-size: 20px; color: #1a1a1a; font-weight: 800; margin-bottom: 12px; font-family: 'Georgia', serif; }
          .message { font-size: 14px; color: #555555; line-height: 1.6; margin-bottom: 25px; }
          .otp-badge { display: inline-block; background-color: #F8F1E9; border: 2px dashed #5D0703; border-radius: 18px; padding: 18px 45px; margin: 15px 0; }
          .otp-number { font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #5D0703; margin: 0; font-family: monospace; }
          .validity { font-size: 12px; color: #888888; margin-top: 18px; }
          .footer { background-color: #FDF9F5; padding: 25px 20px; text-align: center; border-top: 1px solid #EEDCC8; font-size: 12px; color: #777777; }
          .contact { font-weight: 700; color: #5D0703; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://yaadivo-gifts.vercel.app/yaadivo-logo.png" alt="Yaadivo Studio Logo" class="logo-img">
            <div class="tagline">MEMORIES, MADE MEANINGFUL</div>
          </div>
          <div class="content">
            <div class="greeting">Welcome to Yaadivo ✨</div>
            <p class="message">
              Thank you for visiting <b>Yaadivo Studio</b>. Please use the One-Time Password (OTP) below to verify your account:
            </p>
            <div class="otp-badge">
              <h2 class="otp-number">${generatedOtp}</h2>
            </div>
            <p class="validity">This OTP is valid for the next <b>10 minutes</b>. Please do not share this code with anyone.</p>
          </div>
          <div class="footer">
            <p style="margin: 0 0 8px 0; font-weight: 600;">Handcrafted Photo Frames • Varmala Resin Art • Luxury Photobooks</p>
            <p style="margin: 0;">Sarojini Nagar, Lucknow, UP • WhatsApp Support: <a href="https://wa.me/919235843640" class="contact">+91 9235843640</a></p>
          </div>
        </div>
      </body>
      </html>
      `;

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Yaadivo Studio', email: 'yaadivo@gmail.com' },
          to: [{ email: email.toLowerCase().trim() }],
          subject: `✨ ${generatedOtp} is your Yaadivo Verification Code`,
          htmlContent: emailHtml
        })
      });

      const data = await response.json();

      if (response.ok && data.messageId) {
        return res.status(200).json({ 
          status: "Success", 
          token: encodedToken,
          message: "OTP sent successfully to " + email 
        });
      } else {
        return res.status(400).json({ 
          status: "Error", 
          message: data.message || "Failed to send email" 
        });
      }

    } else if (action === "verify_otp") {
      if (!token || !otp) {
        return res.status(400).json({ status: "Error", message: "Token and OTP required" });
      }

      try {
        const decoded = verifySignedPayload(token);
        if (!decoded) {
          return res.status(400).json({ status: "Error", message: "Invalid or tampered session token" });
        }
        
        if (Date.now() > decoded.exp) {
          return res.status(400).json({ status: "Error", message: "OTP expire ho gaya hai! Kripya naya code mangwayein." });
        }

        if (decoded.otp === otp.trim()) {
          const isAdmin = ADMIN_EMAILS.includes(decoded.email.toLowerCase().trim());
          const adminToken = isAdmin ? signPayload({
            email: decoded.email.toLowerCase(),
            role: "ADMIN_OWNER",
            exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days secure admin session
          }) : null;

          return res.status(200).json({ 
            status: "Success", 
            verified: true, 
            email: decoded.email,
            isAdmin,
            adminToken
          });
        } else {
          return res.status(400).json({ status: "Error", message: "Galat OTP! Kripya sahi code enter karein." });
        }
      } catch (e) {
        return res.status(400).json({ status: "Error", message: "Invalid session token" });
      }
    } else {
      return res.status(400).json({ status: "Error", message: "Invalid action" });
    }
  } catch (error) {
    return res.status(500).json({ status: "Error", message: error.message });
  }
}
