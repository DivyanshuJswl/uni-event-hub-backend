const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Student = require("../models/Student");

// Initialize the client properly
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID);
  // Add this at the start of your googleLogin function to verify it's loading
  try {
    const { credential } = req.body;

    if (!credential) {
      console.error("No credential provided in request body");
      return res.status(400).json({
        status: "fail",
        message: "Missing ID token",
        solution: "Ensure frontend sends credential parameter",
      });
    }
    // Verify token structure first
    if (!credential.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/)) {
      console.error(
        "Invalid JWT format received:",
        credential.slice(0, 20) + "..."
      );
      return res.status(400).json({
        status: "fail",
        message: "Invalid token format",
        expected: "JWT ID Token (starts with eyJ...)",
      });
    }
    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID, // Must match your Google Cloud Client ID
    });

    const payload = ticket.getPayload();
    console.log("Successful authentication for:", payload.email);
    const { email, name, picture, sub: googleId } = payload;

    let student = await Student.findOne({ email });
    let isNewUser = false;

    if (!student) {
      isNewUser = true;
      student = new Student({
        name,
        email,
        googleId,
        avatar: picture,
        role: "participant",
        year: 1,
        branch: "CSE",
        password: crypto.randomBytes(16).toString("hex"),
        isVerified: true,
      });
      await student.save();
    } else if (!student.googleId) {
      student.googleId = googleId;
      student.avatar = picture;
      await student.save();
    }

    const token = jwt.sign(
      { id: student._id, role: student.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    student.tokens.push({ token });
    await student.save();

    res.status(200).json({
      status: "success",
      token,
      isNewUser, // Send this flag to frontend
      data: {
        student: {
          id: student._id,
          name: student.name,
          email: student.email,
          role: student.role,
          avatar: student.avatar,
          year: student.year,
          branch: student.branch,
        },
      },
    });
  } catch (error) {
    console.error("Complete authentication error:", {
      message: error.message,
      tokenReceived: req.body.credential
        ? req.body.credential.slice(0, 20) + "..."
        : "none",
      stack: error.stack,
    });

    res.status(401).json({
      status: "fail",
      message: "Authentication failed",
      details: error.message,
      required: "Valid Google ID Token (JWT)",
      solution: "Check frontend is sending credentialResponse.credential",
    });
  }
};
