const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
// const { ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const port = process.env.PORT || 5000;
const app = express();

const corsOptions = {
  origin: ["http://localhost:5173", ""],
  credentials: true,
  optionalSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());



const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0-shard-00-00.5s9bg.mongodb.net:27017,cluster0-shard-00-01.5s9bg.mongodb.net:27017,cluster0-shard-00-02.5s9bg.mongodb.net:27017/?ssl=true&replicaSet=atlas-12sq4a-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  jwt.verify(token, 'fakrul', (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
  });
  next();
};

async function run() {
  try {
    const db = client.db("ShubhoPorinoyDB"); // Update to your DB name
    const usersCollection = db.collection("users");
    const biodatasCollection = db.collection("biodatas");
    const premiumRequestsCollection = db.collection("premiumRequests");
    const contactRequestsCollection = db.collection("contactRequests");

    // Generate JWT
    app.post("/jwt", (req, res) => {
      try {
        const email = req.body;
        const token = jwt.sign(email, 'fakrul');
        console.log(email, token);
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (error) {
        res.send(error.message);
      }
    });

    // Logout and clear cookie
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });




    // User Registration Route
    app.post("/register", async (req, res) => {
      const { name, email, password, photoURL } = req.body;
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) return res.status(400).send({ message: "User already exists" });
      
      const newUser = {
        name,
        email,
        password, // You should hash this password using bcrypt
        photoURL,
      };

      const result = await usersCollection.insertOne(newUser);
      res.send({ message: "User registered successfully" });
    });

    // User Login Route
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await usersCollection.findOne({ email });
      if (!user || user.password !== password) {
        return res.status(401).send({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Get Biodata route (Fetch all biodatas, include pagination if necessary)
    app.get("/biodatas", async (req, res) => {
      const biodatas = await biodatasCollection.find().toArray();
      res.send(biodatas);
    });

    // Create Biodata route
    app.post("/biodata", verifyToken, async (req, res) => {
      const { biodataType, name, age, occupation, division, profileImage } = req.body;
      const newBiodata = {
        biodataType,
        name,
        age,
        occupation,
        division,
        profileImage,
        createdBy: req.user.email,
      };
      const result = await biodatasCollection.insertOne(newBiodata);
      res.send({ message: "Biodata created successfully", biodataId: result.insertedId });
    });

    // View Single Biodata
    app.get("/biodata/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const biodata = await biodatasCollection.findOne({ _id: new ObjectId(id) });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });
      res.send(biodata);
    });

    // Add to Favorites
    app.post("/favorites", verifyToken, async (req, res) => {
      const { biodataId } = req.body;
      const user = await usersCollection.findOne({ email: req.user.email });
      if (!user) return res.status(404).send({ message: "User not found" });

      await usersCollection.updateOne(
        { email: req.user.email },
        { $push: { favorites: new ObjectId(biodataId) } }
      );

      res.send({ message: "Biodata added to favorites" });
    });

    // Request Contact Information (For normal users)
    app.post("/request-contact", verifyToken, async (req, res) => {
      const { biodataId } = req.body;
      const contactRequest = {
        biodataId,
        userEmail: req.user.email,
        status: "pending", // Default status
      };

      const result = await contactRequestsCollection.insertOne(contactRequest);
      res.send({ message: "Contact request sent successfully" });
    });

    // Admin routes for premium approval
    app.post("/admin/approve-premium", verifyToken, async (req, res) => {
      if (req.user.role !== "admin") return res.status(403).send({ message: "Access denied" });

      const { biodataId } = req.body;
      await biodatasCollection.updateOne(
        { _id: new ObjectId(biodataId) },
        { $set: { isPremium: true } }
      );

      res.send({ message: "Biodata marked as premium" });
    });

    // Admin can view all premium requests
    app.get("/admin/premium-requests", verifyToken, async (req, res) => {
      if (req.user.role !== "admin") return res.status(403).send({ message: "Access denied" });

      const premiumRequests = await premiumRequestsCollection.find().toArray();
      res.send(premiumRequests);
    });

    // Ping MongoDB to confirm successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } finally {
    // Client will close automatically if you uncomment the following:
    // await client.close();
  }
}
run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("Hello  Shubho  Porinoy server...");
});

// Start the server
app.listen(port, () => console.log(`Server is running on port ${port}`));
