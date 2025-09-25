const nodemailer = require("nodemailer");

// Create transporter with better configuration
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.in",
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_MAIL_USER,
    pass: process.env.ZOHO_MAIL_PASSWORD,
  },
  // Additional settings for better reliability
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000, // 10 seconds
  socketTimeout: 10000, // 10 seconds
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error("SMTP connection error:", error);
  } else {
    console.log("SMTP server is ready to send messages");
  }
});

module.exports = async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
}) {
  try {
    const mailOptions = {
      from: {
        name: "UniEvent Hub", // Display name
        address: process.env.ZOHO_MAIL_USER,
      },
      to,
      subject,
      text, // Plain text version
      html, // HTML version (optional)
      attachments, // File attachments (optional)
      // Additional headers for better deliverability
      headers: {
        "X-Priority": "3",
        "X-Mailer": "UniEvent Hub Mailer 1.0",
      },
    };

    // Validate required fields
    if (!to || !subject || (!text && !html)) {
      throw new Error(
        "Missing required email parameters: to, subject, and text or html are required"
      );
    }

    const result = await transporter.sendMail(mailOptions);

    console.log(`Email sent successfully to: ${to}`, {
      messageId: result.messageId,
      subject: subject,
    });

    return {
      success: true,
      messageId: result.messageId,
      response: result.response,
    };
  } catch (error) {
    console.error("Error sending email:", {
      to: to,
      subject: subject,
      error: error.message,
      stack: error.stack,
    });

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Additional utility function for sending templated emails
module.exports.sendTemplatedEmail = async function ({
  to,
  subject,
  templateName,
  templateData,
}) {
  // You can expand this to handle different email templates
  const templates = {
    passwordReset: {
      subject: "🔐 Password Reset Request - UniEvent Hub",
      // Template logic can be added here
    },
    welcome: {
      subject: "🎉 Welcome to UniEvent Hub!",
      // Template logic can be added here
    },
    eventNotification: {
      subject: "📅 New Event Notification - UniEvent Hub",
      // Template logic can be added here
    },
  };

  const template = templates[templateName];
  if (!template) {
    throw new Error(`Template '${templateName}' not found`);
  }

  return await sendEmail({
    to,
    subject: template.subject,
    ...templateData,
  });
};

// Utility function to send bulk emails (for notifications, etc.)
module.exports.sendBulkEmail = async function (emails) {
  const results = [];

  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ success: true, email: email.to, result });
    } catch (error) {
      results.push({ success: false, email: email.to, error: error.message });
    }
  }

  return results;
};

// Rate limiting helper (optional)
const rateLimit = {
  lastSent: 0,
  minInterval: 1000, // 1 second between emails
};

module.exports.sendEmailWithRateLimit = async function (emailOptions) {
  const now = Date.now();
  const timeSinceLastEmail = now - rateLimit.lastSent;

  if (timeSinceLastEmail < rateLimit.minInterval) {
    await new Promise((resolve) =>
      setTimeout(resolve, rateLimit.minInterval - timeSinceLastEmail)
    );
  }

  rateLimit.lastSent = Date.now();
  return await sendEmail(emailOptions);
};
