const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Student = require("../models/student");

// Initialize the client properly
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Reuse your signToken function for consistency
const signToken = (student) => {
  // Create safe payload without sensitive data (same as your other auth)
  const payload = {
    id: student._id,
    _id: student._id,
    name: student.name,
    year: student.year,
    isVerified: student.isVerified,
    email: student.email,
    branch: student.branch,
    role: student.role,
    enrolledEvents: student.enrolledEvents,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    googleId: student.googleId,
    avatar: student.avatar
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.googleLogin = async (req, res) => {
  console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID);
  
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
      audience: process.env.GOOGLE_CLIENT_ID,
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
        password: crypto.randomBytes(16).toString("hex"), // Dummy password for schema validation
        isVerified: true,
      });
      await student.save();
    } else if (!student.googleId) {
      // Merge existing account with Google auth
      student.googleId = googleId;
      student.avatar = picture;
      student.isVerified = true;
      await student.save();
    }

    // Use the same signToken function for consistency
    const token = signToken(student);

    // For Google users, we might not need to save to tokens array
    // But let's maintain consistency with your existing approach
    if (student.tokens !== undefined) {
      if (!student.tokens) {
        student.tokens = [];
      }
      student.tokens.push({ token });
      await student.save({ validateBeforeSave: false });
    }

    // Create response matching your other auth endpoints
    const studentResponse = {
      _id: student._id,
      id: student._id.toString(),
      name: student.name,
      year: student.year,
      isVerified: student.isVerified,
      email: student.email,
      branch: student.branch,
      role: student.role,
      enrolledEvents: student.enrolledEvents,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      googleId: student.googleId,
      avatar: student.avatar
    };

    res.status(200).json({
      status: "success",
      token,
      isNewUser,
      data: {
        student: studentResponse,
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