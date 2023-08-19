
const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const { MongoClient } = require("mongodb");
app.use(cors());
app.use(express.json());
const { v4: uuidv4 } = require("uuid");

const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// mongodb connection.
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yhxur.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const port = process.env.PORT || 8000;
let loggedInUsers = {}; // Store logged in users

// Create a nodemailer transporter
const otpMap = {}; // Store OTPs for users
// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,


  auth: {
    user: "naturenexus0@gmail.com",
    pass: "skckqdyilvlnrmne"
  },
});


async function run() {
  try {
    await client.connect();
    const database = client.db("nature_nexus");
    const usersCollection = database.collection("Users");
    const productCollection = database.collection("products");
    
    //register the user

    app.post("/register", async (req, res) => {
      try {
        const { name, address, email, password } = req.body;
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ error: "User already exists" });
        }
        const verificationToken = uuidv4();
        const user = {
          name,
          address,
          email,
          password,
          verificationToken,
          verified: false,
        };
        const result = await usersCollection.insertOne(user);
        const otp = generateOTP(); // Generate OTP
        otpMap[email] = otp; // Store OTP for the user's email
  

        const mailOptions = {
          from: "naturenexus0@gmail.com",
          to: email,
          subject: "OTP Verification",
          html: `
            <p>Your OTP for email verification: <strong>${otp}</strong></p>
          `,
        };
        await transporter.sendMail(mailOptions);

        const token = jwt.sign(
          { userId: result.insertedId },
          process.env.JWT_SECRET,
          { expiresIn: "1d" }
        );
        res.json({
          message:
          "User registered successfully. An OTP has been sent to your email for verification.",
          userId: result.insertedId,
          token: token,
        });
      } catch (err) {
        console.error("Error registering user:", err);
        res.status(500).json({ message: "An error occurred" });
      }
    });
    app.post("/verify-otp", async (req, res) => {
      try {
        const { email, otp } = req.body;
        if (!email || !otp) {
          return res.status(400).json({ error: "Email and OTP are required" });
        }
    
        const storedOTP = otpMap[email];
        if (!storedOTP) {
          return res.status(400).json({ error: "Invalid OTP or expired" });
        }
    
        if (parseInt(otp) === storedOTP)  {
          // Update the user's 'verified' status in the database
          await usersCollection.updateOne({ email }, { $set: { verified: true } });
    
          // Optionally, you can remove the OTP from otpMap once verified
          delete otpMap[email];
    
          return res.json({ message: "Email verification successful" });
        } else {
          return res.status(400).json({ error: "Invalid OTP" });
        }
      } catch (err) {
        console.error("Error verifying OTP:", err);
        res.status(500).json({ message: "An error occurred" });
      }
    });
    
     //user login
     app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      // Compare the provided password with the stored password
      if (password !== user.password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      // Generate JWT token
      const token = jwt.sign({ us1erId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.json({ message: "Login successfully", token });
    });
    // products
    app.get("/products", async (req, res) => {
      const product = {};
      const cursor = productCollection.find(product);
      const products = await cursor.toArray();
      res.send(products);
    })

  //logout the user

  app.post("/logout", (req, res) => {
    const token = req.headers.authorization;
    delete loggedInUsers[token];
    res.json({ message: "Logged out successfully" });
  });
  
    app.listen(port, () => {
      console.log("Running on port", port);
    });
  } finally {
    // await client.close();
  }
}
function generateVerificationToken() {
  // Generate a random string as a token
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return token;
}
run().catch(console.dir);
