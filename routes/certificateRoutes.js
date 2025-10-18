const express = require("express");
const router = express.Router();
const certificateController = require("../controllers/certificateController");
const authMiddleware = require("../middleware/authMiddleware");

// Public routes
router.get("/verify/:certificateId", certificateController.verifyCertificate);
router.get("/by-wallet/:metaMaskAddress", certificateController.getCertificatesByWallet);

// Protected routes
router.use(authMiddleware.protect);

router.get(
  "/my-certificates",
  certificateController.getMyCertificates
);

router.post(
  "/issue",
  authMiddleware.restrictTo("organizer", "admin"),
  certificateController.issueCertificates
);


router.get(
  "/event/:eventId",
  authMiddleware.restrictTo("organizer", "admin"),
  certificateController.getEventCertificates
);

router.patch(
  "/revoke/:certificateId",
  authMiddleware.restrictTo("organizer", "admin"),
  certificateController.revokeCertificate
);

module.exports = router;
