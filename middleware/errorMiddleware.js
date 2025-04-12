module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
  
    // Development: send full error stack
    if (process.env.NODE_ENV === 'development') {
      res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack
      });
    } 
    // Production: send limited error info
    else {
      // Operational, trusted error: send message to client
      if (err.isOperational) {
        res.status(err.statusCode).json({
          status: err.status,
          message: err.message
        });
      } 
      // Programming or other unknown error: don't leak details
      else {
        console.error('ERROR 💥', err);
        res.status(500).json({
          status: 'error',
          message: 'Something went very wrong!'
        });
      }
    }
  };