const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
// const { ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const app = express();



const corsOptions = {
  origin: ["http://localhost:5173", "https://shuboporinoy.netlify.app"],
  credentials: true,
  optionalSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
// app.use(cors());



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
  if (!token) return res.status(401).send({ message: "unauthorized access new" });
  jwt.verify(token, 'fakrulhossain', (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access old" });
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
    const favoritesCollection = db.collection("favoritesPeople");

    // Generate JWT
    app.post("/jwt", (req, res) => {
      try {
        const email = req.body;
        const token = jwt.sign(email, 'fakrul');
        // console.log(email, token);
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

// Check user Data
app.get("/users/role/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const query = { email };
  // console.log(query)
    const result = await usersCollection.findOne(query);
    res.send(result);
  } catch (error) {
    res.send(error.message);
    console.log(error.message)
  }
});
// Verify Admin
const verifyAdmin = async (req, res, next) => {
  const email = req.user?.email;
  const query = { email: email };
  const user = await usersCollection.findOne(query);
  const isAdmin = user?.role === "Admin";
  if (!isAdmin) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};


    // User Registration Route
    app.post("/register", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const user = req.body;

        const isExist = await usersCollection.findOne(query);
        if (isExist) {
          return;
          // res.send("Already Registered");
        }

        const result = await usersCollection.insertOne({
          ...user,
          role: "Customer",
          timestamp: Date.now(),
        });

        res.send(result);
        console.log(result)
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
     }
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
      try {
          const { minAge, maxAge, type, division } = req.query;
  
          // Start with an empty query object
          let query = {};
  
          // Ensure age filtering works correctly
          if (minAge && maxAge) {
              query.age = { $gte: parseInt(minAge), $lte: parseInt(maxAge) };
          }
  
          // Filter by biodata type (Male/Female)
          if (type) {
              query.biodataType = type;
          }
  
          // Filter by division (location)
          if (division) {
              query.division = division;
          }
  
          console.log("Final Query:", query); // Debugging: Check the query object
  
          const biodatas = await biodatasCollection.find(query).toArray();
          res.send(biodatas);
      } catch (error) {
          console.error("Error fetching biodatas:", error);
          res.status(500).send({ message: "Failed to fetch biodatas" });
      }
  });
  

    // Create Biodata route
   
    
    app.get("/biodata/email/:email", async (req, res) => {
      try {
        const userEmail = req.params.email;
        console.log(userEmail)
        const biodata = await biodatasCollection.findOne({ contactEmail: userEmail });
    
        if (!biodata) {
          return res.status(404).json({ message: "Biodata not found" });
        }
        
        res.json(biodata);
      } catch (error) {
        console.error("Error fetching biodata:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // View Single Biodata
    app.get("/biodata/:id", async (req, res) => {
      const { id } = req.params;
      console.log(id)
      const biodata = await biodatasCollection.findOne({ _id: new ObjectId(id) });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });
      res.send(biodata);
    });
    app.get("/checkout/:id", async (req, res) => {
      const { id } = req.params;
      console.log(id)
      const biodata = await biodatasCollection.findOne({ _id: new ObjectId(id) });
      if (!biodata) return res.status(404).send({ message: "Biodata not found" });
      res.send(biodata);
    });
    app.post("/biodata", async (req, res) => {
      try {
        const { email } = req.query;
        const {
          biodataType,
          name,
          dob,
          age,
          height,
          weight,
          occupation,
          race,
          fatherName,
          motherName,
          permanentDivision,
          presentDivision,
          expectedPartnerAge,
          expectedPartnerHeight,
          expectedPartnerWeight,
          contactEmail,
          contactPhone,
          profileImage,
        } = req.body;
    
        // Validate required fields
        if (
          !biodataType ||
          !name ||
          !dob ||
          !height ||
          !weight ||
          !occupation ||
          !race ||
          !permanentDivision ||
          !presentDivision ||
          !expectedPartnerHeight ||
          !expectedPartnerWeight ||
          !contactPhone
        ) {
          return res.status(400).send({ message: "Missing required fields" });
        }
    
        // Find the last biodata to increment biodataId
        const lastBiodata = await biodatasCollection.find().sort({ biodataId: -1 }).limit(1).toArray();
        const lastId = lastBiodata.length > 0 ? lastBiodata[0].biodataId : 1000; // Start from 1001 if no biodata exists
        const newBiodataId = lastId + 1;
    
        const newBiodata = {
          biodataId: newBiodataId, // Incremented biodataId
          biodataType,
          name,
          dob,
          age,
          height,
          weight,
          occupation,
          race,
          fatherName: fatherName || "",
          motherName: motherName || "",
          permanentDivision,
          presentDivision,
          expectedPartnerAge: expectedPartnerAge || null,
          expectedPartnerHeight,
          expectedPartnerWeight,
          contactEmail: contactEmail || email,
          contactPhone,
          profileImage: profileImage || "",
          createdBy: email,
          createdAt: new Date(),
        };
    
        const result = await biodatasCollection.insertOne(newBiodata);
        res.send({ message: "Biodata created successfully", biodataId: newBiodataId });
    
      } catch (error) {
        console.error("Error creating biodata:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });



// Fetch user's favorite biodatas
// const { ObjectId } = require("mongodb");

app.get("/favorites/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // Fetch favorites without lookup to check if data exists
    const favorites = await favoritesCollection.find({ userEmail: email }).toArray();
    console.log("Fetched Favorites:", favorites); // Debugging Step 1

    if (!favorites.length) {
      return res.send([]); // Return empty array if no favorites exist
    }

    const result = await favoritesCollection.aggregate([
      {
        $match: { userEmail: email }, // Match user's favorites
      },
      {
        $lookup: {
          from: "biodatas", // Target collection (biodata)
          localField: "favoritesId", // Field in favoritesCollection
          foreignField: "_id", // Matching field in biodatasCollection
          as: "favoriteBiodata", // Output field
        },
      },
      {
        $unwind: {
          path: "$favoriteBiodata",
          preserveNullAndEmptyArrays: false, // Remove entries without matches
        },
      },
      {
        $project: {
          _id: "$favoriteBiodata._id",
          biodataId: "$favoriteBiodata.biodataId",
          name: "$favoriteBiodata.name",
          profileImage: "$favoriteBiodata.profileImage",
          age: "$favoriteBiodata.age",
          height: "$favoriteBiodata.height",
          weight: "$favoriteBiodata.weight",
          occupation: "$favoriteBiodata.occupation",
          division: "$favoriteBiodata.division",
          race: "$favoriteBiodata.race",
          contactEmail: "$favoriteBiodata.contactEmail",
          contactPhone: "$favoriteBiodata.contactPhone",
          isPremium: "$favoriteBiodata.isPremium",
        },
      },
    ]).toArray();

    console.log("Lookup Result:", result); // Debugging Step 2
    res.send(result);
  } catch (error) {
    console.error("Error fetching favorite biodatas:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});



// Delete favorite biodata
app.delete("/favorites/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await favoritesCollection.deleteOne({ favoritesId: id });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete favorite" });
  }
});


    // Add to Favorites
    app.post("/favorites", async (req, res) => {
      const  favoritesData  = req.body;
      const result = await favoritesCollection.insertOne(favoritesData); 
      res.send(result)
      // const user = await usersCollection.findOne({ email: req.user.email });
console.log(favoritesData)

      // res.send({ message: "Biodata added to favorites" });
    });
    app.get("/biodataSimilar", async (req, res) => {
      const { gender } = req.query;
      // console.log(gender)
      const similarBiodata = await biodatasCollection
      .find({ biodataType: gender})
      .limit(3)
      .toArray();
      // console.log(similarBiodata)
      res.send(similarBiodata);
    });
    
    // Request Contact Information (For normal users)
    app.post("/request-contact", async (req, res) => {
      const { biodataId } = req.body;
      const contactRequest = {
        biodataId,
        userEmail: req.user.email,
        status: "pending", // Default status
      };

      const result = await contactRequestsCollection.insertOne(contactRequest);
      res.send({ message: "Contact request sent successfully" });
    });
app.patch('/premium-requests/:id',async (req,res)=>{
  const id = req.params.id 
  const query = {_id: new ObjectId(id)}
  const updateDoc = {
    $set: {isPremium: 'pending'}
  }
  const result = await biodatasCollection.updateOne(query,updateDoc)
  res.send(result)
  console.log(result)

})
    // Admin routes for premium approval
    app.post("/admin/approve-premium", async (req, res) => {
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
// Payment Related Api

    // Create Payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const id = req.body;
        console.log(id)
        const query = { _id: new ObjectId(id) };
        // const classData = await ClassesData.findOne(query);
        // const price = parseFloat(classData.price);
        const amount = 200;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ ClientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.send(error);
      }
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
