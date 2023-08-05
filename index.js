const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
app.use(cors());
app.use(express.json());
const jwt = require("jsonwebtoken");

// mongodb connection.
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yhxur.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const port = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.send("Running nature_naxus site");
});

// All functionality starts
async function run() {
  try {
    await client.connect();
    const database = client.db("aeaw");
    const usersCollection = database.collection("aeawUsers");

    // Register the user
    app.post("/register", async (req, res) => {
      try {
        const {
          name,
          address,
          email,
          password,
  
     
        } = req.body;

        // Check if the user with the provided email already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ error: "User already exists" });
        }

        // Create the user object
        const user = {
          name,
          address,
          email,
          password,
                  };

        // Insert the user into the database
        const result = await usersCollection.insertOne(user);

        res.json({
          message: "User registered successfully.",
          userId: result.insertedId,
        });
      } catch (err) {
        console.error("Error registering user:", err);
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
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
          expiresIn: "1h",
        });
  
        res.json({ message: "Login successfully", token });
      });
    // User login
    // app.post("/login", async (req, res) => {
    //   const { email, password } = req.body;

    //   // Find the user with the provided email
    //   const user = await usersCollection.findOne({ email });

    //   if (!user) {
    //     return res.status(401).json({ error: "Invalid email or password" });
    //   }

    //   // Compare the provided password with the stored password
    //   if (password !== user.password) {
    //     return res.status(401).json({ error: "Invalid email or password" });
    //   }

    //   res.json({ message: "Login successful" });
    // });
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

run().catch(console.dir);
