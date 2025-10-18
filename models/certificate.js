const mongoose = require("mongoose");

const CertificateSchema = new mongoose.Schema(
  {
    certificateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: function () {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `CERT-${timestamp}-${random}`.toUpperCase();
      },
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    metaMaskAddress: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^0x[a-fA-F0-9]{40}$/.test(v);
        },
        message: "Invalid Ethereum address format",
      },
      lowercase: true,
    },
    eventName: {
      type: String,
      required: true,
      trim: true,
    },
    winnerPosition: {
      type: Number,
      required: true,
      min: 1,
    },
    certificateURL: {
      type: String,
      required: true,
    },
    ipfsHash: {
      type: String,
      unique: true,
      sparse: true,
    },
    blockchainTxHash: {
      type: String,
      unique: true,
      sparse: true,
    },
    verificationURL: {
      type: String,
      required: true,
      default: function () {
        const baseUrl = process.env.BASE_URL;
        // We'll set the actual certificateId in the pre-save hook
        return `${baseUrl}/verify/TEMP_ID`;
      },
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    issuer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    status: {
      type: String,
      enum: ["issued", "verified", "revoked"],
      default: "issued",
    },
    metadata: {
      issueDate: {
        type: Date,
        default: Date.now,
      },
      expirationDate: Date,
      skills: [String],
      description: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Generate unique certificate ID and verification URL before save
CertificateSchema.pre("save", function (next) {
  if (this.isNew) {
    // Generate certificate ID if not already set
    if (!this.certificateId) {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      this.certificateId = `CERT-${timestamp}-${random}`.toUpperCase();
    }

    // Generate verification URL
    const baseUrl = process.env.BASE_URL;
    this.verificationURL = `${baseUrl}/verify/${this.certificateId}`;

    // Set metadata issue date
    if (!this.metadata?.issueDate) {
      this.metadata = this.metadata || {};
      this.metadata.issueDate = new Date();
    }
  }
  next();
});

// Indexes for better query performance
CertificateSchema.index({ student: 1, event: 1 });
CertificateSchema.index({ metaMaskAddress: 1 });
CertificateSchema.index({ certificateId: 1 });
CertificateSchema.index({ issuedAt: -1 });

// Virtual for formatted position
CertificateSchema.virtual("positionLabel").get(function () {
  const positions = [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
    "8th",
    "9th",
    "10th",
  ];
  return positions[this.winnerPosition - 1] || `${this.winnerPosition}th`;
});

// Method to check if certificate is verified on blockchain
CertificateSchema.methods.isBlockchainVerified = function () {
  return !!this.blockchainTxHash;
};

module.exports = mongoose.model("Certificate", CertificateSchema);
