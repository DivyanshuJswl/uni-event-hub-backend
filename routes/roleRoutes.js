const express = require("express");
const router = express.Router();
const roleController = require("../controllers/roleController");
const authMiddleware = require("../middleware/authMiddleware");

router.patch(
  "/upgrade-to-organizer",
  authMiddleware.protect,
  roleController.upgradeToOrganizer
);

module.exports = router;
