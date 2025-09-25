const express = require("express");
const router = express.Router();
const passwordController = require("../controllers/passwordController");

router.post("/forgot", passwordController.forgotPassword);
router.post("/reset/:token", passwordController.resetPassword);

module.exports = router;
