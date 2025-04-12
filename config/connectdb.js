const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    // Make sure to use the same variable name you have in .env
    const conn = await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
      // No need for deprecated options in Mongoose 6+
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;