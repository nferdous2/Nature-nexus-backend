const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
app.use(cors());
app.use(express.json());
const { v4: uuidv4 } = require("uuid");
const SSLCommerzPayment = require('sslcommerz-lts')
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require('path');
const fs = require('fs');

// mongodb connection.
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yhxur.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


const port = process.env.PORT || 8000;
let loggedInUsers = {}; // Store logged in users
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

///SSL
const store_id = process.env.STORED_ID
const store_passwd = process.env.STORED_PASS
const is_live = false

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destinationPath = path.join(__dirname, "animal/");
    fs.mkdirSync(destinationPath, { recursive: true }); // Create the 'articles' directory if it doesn't exist
    cb(null, destinationPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});


const upload = multer({ storage: storage }).fields([
  { name: "image", maxCount: 1 },
]);
async function run() {
  try {
    await client.connect();
    const database = client.db("nature_nexus");
    const usersCollection = database.collection("Users");
    const productCollection = database.collection("products");
    const soldCollections = database.collection("sold");
    const reviewCollection = database.collection("review");
    const animalCollection = database.collection("animal");

    //register the user

    app.post("/register", async (req, res) => {
      try {
        const { name, address, email, password, } = req.body;
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ error: "User already exists" });
        }
        const verificationToken = uuidv4();
        const userId = uuidv4()
        const user = {

          role: "user",
          userId,
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

        if (parseInt(otp) === storedOTP) {
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
      console.log(user)
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Compare the provided password with the stored password
      if (password !== user.password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role || "user" }, // Ensure user.role exists or default to "user"
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({ message: "Login successfully", token, role: user.role, userId: user._id });
    });

    //admin add
    app.post("/admin", async (req, res) => {
      try {
        const { email, password } = req.body;
        const user = {
          role: "admin", // Set the role to "admin" for admin registrations
          email,
          password,
        };

        const result = await usersCollection.insertOne(user);

        const token = jwt.sign(
          { userId: result.insertedId, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "1d" }
        );

        res.json({
          message: "Admin registered successfully",
          token,
          role: user.role,
        });
      } catch (err) {
        console.error("Error registering admin:", err);
        res.status(500).json({ message: "An error occurred" });
      }
    });
    ///logout
    app.post("/logout", (req, res) => {
      const token = req.headers.authorization;
      delete loggedInUsers[token];
      res.json({ message: "Logged out successfully" });
    });
    // get USer
    app.get("/users", async (req, res) => {
      const user = {};
      const cursor = usersCollection.find(user);
      const users = await cursor.toArray();
      res.send(users);
    })
    // delete user
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const deletedUser = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(deletedUser)
      res.json(result);

    });
    //add  all products
    app.post("/products", async (req, res) => {
      const { name, price, category, image, description } = req.body;
      const product = { name, price, category, image, description };
      try {
        const result = await productCollection.insertOne(product);
        res.json({ message: "Product added successfully" });
      } catch (error) {
        res.status(500).json({ message: "An error occurred while adding the product" });
      }
    });

    // get products
    app.get("/products", async (req, res) => {
      const product = {};
      const cursor = productCollection.find(product);
      const products = await cursor.toArray();
      res.send(products);
    })
    // delete products
    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const deletedProduct = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(deletedProduct)
      res.json(result);

    });

    //update products
    app.put("/products/:id", async (req, res) => {
      const id = req.params.id;
      const { name, price, image, description } = req.body;

      try {
        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { name, price, image, description, } }
        );

        if (result.modifiedCount > 0) {
          res.json({ message: "Book updated successfully" });
        } else {
          res.status(404).json({ message: "Book not found" });
        }
      } catch (error) {
        console.error("Error updating book:", error);
        res.status(500).json({ message: "An error occurred while updating the book" });
      }
    });
    // get a product by ID for user &Admin
    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      console.log("Received ID:", id);
      const book = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(book)
      res.json(result);

    });
    //SSL Payment
    const tran_id = new ObjectId().toString();
    app.post("/purchase", async (req, res) => {
      console.log(req.body)
      const product = await productCollection.findOne({
        _id: new ObjectId(req.body.productId)
      })
      const order = req.body;
      const userId = order.userId;
      const customerName = order.customerName;
      const address = order.address;
      const phoneNumber = order.phoneNumber;
      // console.log(product)
      // console.log(product)
      const data = {
        userId: userId,
        total_amount: order.totalPrice,
        currency: 'BDT',
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `https://nature-nexus-backend.vercel.app/payment/success/${tran_id}`,
        fail_url: `https://nature-nexus-backend.vercel.app/payment/fail/${tran_id}`,
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: order.productName,
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: order.customerName,
        product_quantity: order.quantity,
        cus_email: 'customer@example.com',
        cus_add1: order.address,
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: order.phoneNumber,
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      console.log(data)
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send({ url: GatewayPageURL });

        //new dats create for order
        const finalOrder = {
          product, paidStatus: false, transjectionId: tran_id, userId, customerName, address, phoneNumber
        };
        const result = soldCollections.insertOne(finalOrder)

        console.log('Redirecting to: ', GatewayPageURL)
      });
      //payment sucess 
      app.post("/payment/success/:tranId", async (req, res) => {
        console.log(req.params.tranId);
        const result = await soldCollections.updateOne({ transjectionId: req.params.tranId },
          {
            $set: { paidStatus: true },
          }
        );
        if (result.modifiedCount > 0) {
          res.redirect(`http://localhost:3000/payment/success/${req.params.tranId}`)
        }

      });
      //if payment failed
      app.post("/payment/fail/:tranId", async (req, res) => {
        // console.log(req.params.tranId);
        const result = await soldCollections.deleteOne({
          transjectionId: req.params.tranId
        });
        if (result.deletedCount) {
          res.redirect(`http://localhost:3000/payment/fail/${req.params.tranId}`)
        }

      })

    })

    // user buy animal
    app.post("/animal", async (req, res) => {
      const { phone, address, animal, userId } = req.body;
      // console.log(phone, address, animal, userId)
      // return;
      const newAnimal = { phone, address, animal, userId, status: false };
      try {
        const result = await animalCollection.insertOne(newAnimal);
        res.status(200).json({ message: "Animal added successfully" });
      } catch (error) {
        res.status(500).json({ message: "An error occurred while adding the product" });
      }
    });
    // get animal by userId
    app.get("/animal/:userId", async (req, res) => {
      const userId = req.params.userId;
      const animal = { userId };
      const cursor = animalCollection.find(animal);
      const animals = await cursor.toArray();
      res.send(animals);
    })
    // post the animal after recieving
    app.patch("/animal/:id", (req, res) => {
      upload(req, res, async (error) => {
        if (error) {
          console.error(error);
          return res.status(400).send({ message: "Error uploading files" });
        }

        const id = req.params.id;
        const { status } = req.body;

        let updatedAnimal = { $set: { status } };

        // Check if files are present in the request
        if (req.files && req.files["image"] && req.files["image"].length > 0) {
          const imageFile = req.files["image"][0];
          updatedAnimal.$set.image = imageFile.filename; // Update image field if a new image is uploaded
        }

        const result = await animalCollection.updateOne(
          { _id: new ObjectId(id) },
          updatedAnimal
        );

        if (result.modifiedCount > 0) {
          res.json({ message: "Animal updated successfully" });
        } else {
          res.status(404).json({ message: "Animal not found" });
        }
      });
    });

    // get products
    app.get("/soldProduct", async (req, res) => {
      const product = {};
      const cursor = soldCollections.find(product);
      const products = await cursor.toArray();
      res.send(products);
    })
    // get products by userId
    app.get("/soldProduct/:userId", async (req, res) => {
      const userId = req.params.userId;
      console.log(userId)
      const product = { userId };
      const cursor = soldCollections.find(product);
      const products = await cursor.toArray();
      res.send(products);
    })
    // delete specific product of a user
    app.delete("/soldProduct/:id", async (req, res) => {
      const id = req.params.id;
      const deletedProduct = { _id: new ObjectId(id) };
      const result = await soldCollections.deleteOne(deletedProduct)
      res.json(result);
    });

    //tree donation
    app.post("/donation", async (req, res) => {
      const { phoneNumber, address, name, userId } = req.body;
      // console.log(phone, address, animal, userId)
      // return;
      const donationForm = { phoneNumber, address, name, userId, status: false };
      try {
        const result = await soldCollections.insertOne(donationForm);
        res.status(200).json({ message: "form added successfully" });
      } catch (error) {
        res.status(500).json({ message: "An error occurred while adding the data" });
      }
    });


    // review
    app.get('/review', async (req, res) => {
      const cursor = reviewCollection.find({});
      const reviews = await cursor.toArray();
      res.send(reviews);
    });
    // for post review
    app.post('/review', async (req, res) => {
      const review = req.body;
      const resultR = await reviewCollection.insertOne(review);
      console.log(resultR);
      res.json(resultR);
    });


    app.listen(port, () => {
      console.log("Running on port", port);
    });
  } finally {
    // await client.close();
  }
}



run().catch(console.dir);
