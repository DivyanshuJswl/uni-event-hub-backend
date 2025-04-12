const Student = require('../models/student');
const AppError = require('../utils/appError');

exports.getStudentByEmail = async (req, res, next) => {
  try {
    const student = await Student.findOne({ email: req.params.email })
      .select('-password -tokens -__v');

    if (!student) {
      return next(new AppError('No student found with that email', 404));
    }

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