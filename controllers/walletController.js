const Student = require('../models/student');
const AppError = require('../utils/appError');

exports.updateWallet = async (req, res, next) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.student._id,
      { metaMaskAddress: req.body.metaMaskAddress },
      {
        new: true,
        runValidators: true,
        select: '-password -tokens -__v'
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        student
      }
    });
  } catch (err) {
    next(err);
  }
};