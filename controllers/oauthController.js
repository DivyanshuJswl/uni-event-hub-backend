const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Student = require("../models/student");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// Initialize the client properly
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

      // Upload Google profile picture to Cloudinary
      let avatarData = null;
      if (picture) {
        try {
          // Download the image from Google and upload to Cloudinary
          const response = await fetch(picture);
          const buffer = await response.buffer();

          avatarData = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: "avatars",
                public_id: `student_${googleId}_${Date.now()}`,
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );

            streamifier.createReadStream(buffer).pipe(uploadStream);
          });
        } catch (uploadError) {
          console.error("Error uploading avatar to Cloudinary:", uploadError);
          // Fall back to Google's URL if upload fails
          avatarData = { secure_url: picture };
        }
      }

      student = new Student({
        name,
        email,
        googleId,
        avatar: avatarData
          ? {
              url: avatarData.secure_url,
              publicId: avatarData.public_id || null,
              width: avatarData.width || null,
              height: avatarData.height || null,
              format: avatarData.format || null,
              bytes: avatarData.bytes || null,
            }
          : null,
        role: "participant",
        year: 1,
        branch: "CSE",
        password: crypto.randomBytes(16).toString("hex"),
        isVerified: true,
      });
      await student.save();
    } else if (!student.googleId) {
      // If existing user but not connected with Google before
      student.googleId = googleId;

      // Only update avatar if it doesn't exist or is different
      if (picture && (!student.avatar || student.avatar.url !== picture)) {
        try {
          // Delete old avatar from Cloudinary if exists
          if (student.avatar?.publicId) {
            await cloudinary.uploader.destroy(student.avatar.publicId);
          }

          // Upload new avatar
          const response = await fetch(picture);
          const buffer = await response.buffer();

          const avatarData = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: "avatars",
                public_id: `student_${googleId}_${Date.now()}`,
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );

            streamifier.createReadStream(buffer).pipe(uploadStream);
          });

          student.avatar = {
            url: avatarData.secure_url,
            publicId: avatarData.public_id,
            width: avatarData.width,
            height: avatarData.height,
            format: avatarData.format,
            bytes: avatarData.bytes,
          };
        } catch (uploadError) {
          console.error("Error updating avatar:", uploadError);
          // Fall back to Google's URL if upload fails
          student.avatar = { url: picture };
        }
      }
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
      isNewUser,
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
