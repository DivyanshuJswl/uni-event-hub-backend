const Certificate = require("../models/certificate");
const Student = require("../models/student");
const Event = require("../models/event");

// @desc    Issue certificates to winners
// @route   POST /api/certificates/issue
// @access  Private (Organizer/Admin)
exports.issueCertificates = async (req, res, next) => {
  try {
    const { eventId, winners } = req.body;

    if (!eventId || !winners || !Array.isArray(winners)) {
      return res.status(400).json({
        status: "fail",
        message: "Event ID and winners array are required",
      });
    }

    // Validate winners array
    if (winners.length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "At least one winner is required",
      });
    }

    // Verify event exists - use lean() to avoid virtual field issues
    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found",
      });
    }

    // Check if user is organizer or admin
    if (event.organizer.toString() !== req.student._id.toString() && req.student.role !== "admin") {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to issue certificates for this event",
      });
    }

    // Check if event is completed
    if (event.status !== "completed") {
      return res.status(400).json({
        status: "fail",
        message: "Certificates can only be issued for completed events",
      });
    }

    const issuedCertificates = [];
    const errors = [];

    for (const winnerData of winners) {
      try {
        const { studentEmail, winnerPosition, certificateURL } = winnerData;

        // Validate required fields with proper checks
        if (!studentEmail || !studentEmail.trim()) {
          errors.push(`Missing email for winner at position ${winnerPosition}`);
          continue;
        }

        if (!certificateURL || !certificateURL.trim()) {
          errors.push(`Missing certificate URL for ${studentEmail}`);
          continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(studentEmail.trim())) {
          errors.push(`Invalid email format for ${studentEmail}`);
          continue;
        }

        // Validate URL format
        const urlRegex = /^https?:\/\/.+\..+/;
        if (!urlRegex.test(certificateURL.trim())) {
          errors.push(`Invalid certificate URL format for ${studentEmail}`);
          continue;
        }

        // Find student by email
        const student = await Student.findOne({ email: studentEmail.toLowerCase().trim() });
        if (!student) {
          errors.push(`Student with email ${studentEmail} not found`);
          continue;
        }

        // Check if student has MetaMask address
        if (!student.metaMaskAddress) {
          errors.push(`Student ${studentEmail} does not have a MetaMask address linked`);
          continue;
        }

        // Check if certificate already exists for this event and student
        const existingCertificate = await Certificate.findOne({
          event: eventId,
          student: student._id,
        });

        if (existingCertificate) {
          errors.push(`Certificate already exists for ${studentEmail} in this event`);
          continue;
        }

        // Create certificate with all required fields
        const certificateData = {
          event: eventId,
          student: student._id,
          studentEmail: student.email,
          metaMaskAddress: student.metaMaskAddress,
          eventName: event.title,
          winnerPosition: winnerPosition || 1,
          certificateURL: certificateURL.trim(),
          issuer: req.student._id,
          metadata: {
            issueDate: new Date(),
            skills: event.category ? [event.category] : [],
            description: `Awarded for ${winnerPosition === 1 ? '1st' : winnerPosition === 2 ? '2nd' : winnerPosition === 3 ? '3rd' : `${winnerPosition}th`} place in ${event.title}`
          }
        };

        // Create and save certificate
        const certificate = new Certificate(certificateData);
        await certificate.save();
        
        console.log('Certificate saved successfully:', certificate.certificateId);

        // Populate the certificate with student and event details
        const populatedCertificate = await Certificate.findById(certificate._id)
          .populate("student", "name email year branch")
          .populate("event", "title category date")
          .populate("issuer", "name email");

        issuedCertificates.push(populatedCertificate);

      } catch (error) {
        console.error(`Error processing ${winnerData.studentEmail}:`, error);
        errors.push(`Error processing ${winnerData.studentEmail}: ${error.message}`);
      }
    }

    // Prepare response
    const response = {
      status: "success",
      message: `Successfully issued ${issuedCertificates.length} certificates`,
      data: {
        certificates: issuedCertificates,
      },
    };

    // Add errors to response if any
    if (errors.length > 0) {
      response.data.errors = errors;
    }

    res.status(201).json(response);
  } catch (err) {
    console.error("Error in issueCertificates:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// @desc    Get certificates for logged-in student
// @route   GET /api/certificates/my-certificates
// @access  Private
exports.getMyCertificates = async (req, res, next) => {
  try {    
    const certificates = await Certificate.find({ student: req.student._id })
      .populate("event", "title category date location")
      .populate("issuer", "name email")
      .sort({ issuedAt: -1 })
      .lean(); // Use lean() to avoid virtual field issues

    // Transform the certificates to include virtual fields manually
    const transformedCertificates = certificates.map(cert => ({
      ...cert,
      positionLabel: getPositionLabel(cert.winnerPosition),
      isBlockchainVerified: !!cert.blockchainTxHash
    }));

    res.status(200).json({
      status: "success",
      results: transformedCertificates.length,
      data: {
        certificates: transformedCertificates,
      },
    });
  } catch (err) {
    console.error("Error in getMyCertificates:", err);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch certificates",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper function to get position label
function getPositionLabel(position) {
  const positions = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
  return positions[position - 1] || `${position}th`;
}

// @desc    Get certificates by MetaMask address
// @route   GET /api/certificates/by-wallet/:metaMaskAddress
// @access  Public
exports.getCertificatesByWallet = async (req, res, next) => {
  try {
    const { metaMaskAddress } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(metaMaskAddress)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid MetaMask address format",
      });
    }

    const certificates = await Certificate.find({ 
      metaMaskAddress: metaMaskAddress.toLowerCase(),
      status: { $ne: "revoked" }
    })
      .populate("event", "title category date location")
      .populate("issuer", "name email")
      .populate("student", "name email year branch")
      .sort({ issuedAt: -1 });

    res.status(200).json({
      status: "success",
      results: certificates.length,
      data: {
        certificates,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify certificate by certificateId
// @route   GET /api/certificates/verify/:certificateId
// @access  Public
exports.verifyCertificate = async (req, res, next) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({ certificateId })
      .populate("event", "title category date location organizer")
      .populate("student", "name email year branch metaMaskAddress")
      .populate("issuer", "name email");

    if (!certificate) {
      return res.status(404).json({
        status: "fail",
        message: "Certificate not found",
      });
    }

    if (certificate.status === "revoked") {
      return res.status(410).json({
        status: "fail",
        message: "This certificate has been revoked",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        certificate,
        verification: {
          isValid: true,
          status: certificate.status,
          issuedAt: certificate.issuedAt,
          blockchainVerified: certificate.isBlockchainVerified(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get event certificates (for organizers)
// @route   GET /api/certificates/event/:eventId
// @access  Private (Organizer/Admin)
exports.getEventCertificates = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found",
      });
    }

    // Check if user is organizer or admin
    if (!event.organizer.equals(req.student._id) && req.student.role !== "admin") {
      return res.status(403).json({
        status: "fail",
        message: "Not authorized to view certificates for this event",
      });
    }

    const certificates = await Certificate.find({ event: eventId })
      .populate("student", "name email year branch metaMaskAddress")
      .sort({ winnerPosition: 1 });

    res.status(200).json({
      status: "success",
      results: certificates.length,
      data: {
        event: {
          id: event._id,
          title: event.title,
          date: event.date,
        },
        certificates,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Revoke certificate
// @route   PATCH /api/certificates/revoke/:certificateId
// @access  Private (Organizer/Admin)
exports.revokeCertificate = async (req, res, next) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({ certificateId })
      .populate("event");

    if (!certificate) {
      return res.status(404).json({
        status: "fail",
        message: "Certificate not found",
      });
    }

    // Check if user is event organizer or admin
    if (!certificate.event.organizer.equals(req.student._id) && req.student.role !== "admin") {
      return res.status(403).json({
        status: "fail",
        message: "Not authorized to revoke this certificate",
      });
    }

    certificate.status = "revoked";
    await certificate.save();

    res.status(200).json({
      status: "success",
      message: "Certificate revoked successfully",
      data: {
        certificate,
      },
    });
  } catch (err) {
    next(err);
  }
};