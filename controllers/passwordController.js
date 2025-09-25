const crypto = require("crypto");
const Student = require("../models/student");
const sendEmail = require("../utils/emailSender");
const AppError = require("../utils/appError");

// @desc    Forgot password - send reset link
// @route   POST /api/password/forgot
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError("Email is required", 400));
  const user = await Student.findOne({ email });
  if (!user) return next(new AppError("No user found with that email", 404));

  // Generate token
  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 min
  await user.save({ validateBeforeSave: false });

  // Send email
  const resetURL = `${process.env.ZOHO_FRONTEND_URL}/reset-password/${resetToken}`;

  const htmlMessage = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - UniEvent Hub</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f6f9fc;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 16px;
        }
        .content {
            padding: 40px;
        }
        .greeting {
            font-size: 18px;
            color: #2d3748;
            margin-bottom: 20px;
        }
        .instruction {
            background: #f8fafc;
            border-left: 4px solid #4299e1;
            padding: 15px;
            margin: 25px 0;
            border-radius: 4px;
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
            text-align: center;
        }
        .expiry-notice {
            background: #fffaf0;
            border: 1px solid #fed7d7;
            border-radius: 8px;
            padding: 15px;
            margin: 25px 0;
            color: #c53030;
        }
        .support {
            background: #f0fff4;
            border: 1px solid #c6f6d5;
            border-radius: 8px;
            padding: 15px;
            margin: 25px 0;
            color: #2f855a;
        }
        .footer {
            text-align: center;
            padding: 20px;
            background: #f7fafc;
            color: #718096;
            font-size: 14px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>UniEvent Hub</h1>
            <p>Your University Event Management Platform</p>
        </div>
        
        <div class="content">
            <div class="greeting">
                <strong>Hello ${user.name || "there"},</strong>
            </div>
            
            <p>We received a request to reset your password for your UniEvent Hub account. If you didn't make this request, you can safely ignore this email.</p>
            
            <div class="instruction">
                <strong>To reset your password, click the button below:</strong>
            </div>
            
            <div style="text-align: center;">
                <a href="${resetURL}" class="button">Reset Your Password</a>
            </div>
            
            <p style="text-align: center; color: #718096; font-size: 14px;">
                Or copy and paste this link in your browser:<br>
                <a href="${resetURL}" style="color: #4299e1; word-break: break-all;">${resetURL}</a>
            </p>
            
            <div class="expiry-notice">
                <strong>⚠️ Important:</strong> This password reset link is valid for <strong>10 minutes</strong> only. After that, you'll need to request a new reset link.
            </div>
            
            <div class="support">
                <strong>Need help?</strong> If you're having trouble resetting your password, please contact our support team or visit our help center.
            </div>
            
            <p>Best regards,<br><strong>The UniEvent Hub Team</strong></p>
        </div>
        
        <div class="footer">
            <div class="logo">UniEvent Hub</div>
            <p>Connecting students with amazing campus events</p>
            <p>© ${new Date().getFullYear()} UniEvent Hub. All rights reserved.</p>
            <p style="font-size: 12px; color: #a0aec0;">
                This is an automated message. Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>
  `;

  const textMessage = `
PASSWORD RESET REQUEST - UniEvent Hub

Hello ${user.name || "there"},

We received a request to reset your password for your UniEvent Hub account.

To reset your password, please click the link below:
${resetURL}

If you didn't request this password reset, you can safely ignore this email. Your account remains secure.

Important: This password reset link is valid for 10 minutes only.

Need help? Contact our support team if you're having trouble.

Best regards,
The UniEvent Hub Team

© ${new Date().getFullYear()} UniEvent Hub. All rights reserved.
This is an automated message. Please do not reply to this email.
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: "🔐 Password Reset Request - UniEvent Hub",
      text: textMessage,
      html: htmlMessage,
    });
    res.status(200).json({
      message: "Password reset link has been sent to your email address.",
      success: true,
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError("Error sending email. Please try again later.", 500)
    );
  }
};

// @desc    Reset password
// @route   POST /api/password/reset/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await Student.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) return next(new AppError("Token invalid or expired", 400));
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.status(200).json({ success: true, message: "Password reset successful" });
};
