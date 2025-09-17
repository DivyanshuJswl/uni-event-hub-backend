const Student = require("../models/student");

exports.updateWallet = async (req, res, next) => {
  try {
    const { metaMaskAddress } = req.body;

    if (!metaMaskAddress) {
      return res.status(400).json({
        status: "fail",
        message: "MetaMask address is required",
      });
    }

    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(metaMaskAddress)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid MetaMask address format",
      });
    }

    const student = await Student.findByIdAndUpdate(
      req.student._id,
      { metaMaskAddress },
      {
        new: true,
        runValidators: true,
        select: "-password -tokens -__v",
      }
    );

    if (!student) {
      return res.status(404).json({
        status: "fail",
        message: "Student not found",
      });
    }

    res.status(200).json({
      status: "success",
      student,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "This MetaMask address is already linked to another account",
      });
    }

    next(err);
  }
};
