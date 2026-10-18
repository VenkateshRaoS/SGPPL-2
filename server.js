require("dotenv").config();

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(publicDir, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

// -------------------- IMAGE UPLOADS --------------------

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error("Only JPG, PNG or WEBP images are allowed."));
    }
    cb(null, true);
  }
});

app.use("/uploads", express.static(uploadDir, {
  maxAge: "7d",
  immutable: true
}));

app.use(express.static(publicDir, { maxAge: "1h" }));

// -------------------- DATABASE MODELS --------------------

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  village: { type: String, required: true, trim: true },

  role: {
    type: String,
    enum: ["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"],
    required: true
  },

  photoUrl: { type: String, required: true },
  utr: { type: String, required: true, unique: true, index: true },
  paymentScreenshotUrl: { type: String, default: "" },

  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "SOLD", "UNSOLD"],
    default: "PENDING",
    index: true
  },

  auctionEligible: { type: Boolean, default: false, index: true },
  soldTeam: { type: String, default: "" },
  soldPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const teamSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  totalPoints: { type: Number, default: 15000 },
  spentPoints: { type: Number, default: 0 },
  playerCount: { type: Number, default: 0 },
  maxPlayers: { type: Number, default: 25 }
});

const auctionSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },

  status: {
    type: String,
    enum: ["IDLE", "LIVE", "SOLD", "UNSOLD"],
    default: "IDLE"
  },

  currentPlayerId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  baseBid: { type: Number, default: 50 },
  currentBid: { type: Number, default: 0 },
  highestTeam: { type: String, default: "" },
  bidIncrement: { type: Number, default: 50 },

  bidHistory: [{
    team: String,
    amount: Number,
    at: Date
  }],

  // Snapshot of the previous auction action for the Undo button.
  lastAction: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  updatedAt: { type: Date, default: Date.now }
});

const Player = mongoose.model("Player", playerSchema);
const Team = mongoose.model("Team", teamSchema);
const Auction = mongoose.model("Auction", auctionSchema);

// -------------------- DEFAULT TEAMS --------------------

const DEFAULT_TEAMS = [
  ["RCJ", "RCJ Warriors"],
  ["JCB", "JCB Titans"],
  ["SS", "Sandur Strikers"],
  ["HH", "Hospet Heroes"],
  ["BB", "Bellary Blasters"],
  ["MW", "Mining Warriors"],
  ["KK", "Kudligi Kings"],
  ["TG", "Toranagallu"]
];

async function seedTeams() {
  for (const [code, name] of DEFAULT_TEAMS) {
    await Team.updateOne(
      { code },
      {
        $set: {
          totalPoints: 15000,
          maxPlayers: 25
        },
        $setOnInsert: {
          code,
          name,
          spentPoints: 0,
          playerCount: 0
        }
      },
      { upsert: true }
    );
  }

  // Fill accounting fields if older team records do not have them.
  await Team.updateMany(
    { spentPoints: { $exists: false } },
    { $set: { spentPoints: 0 } }
  );

  await Team.updateMany(
    { playerCount: { $exists: false } },
    { $set: { playerCount: 0 } }
  );

  await Auction.updateOne(
    { key: "main" },
    {
      $setOnInsert: {
        key: "main",
        status: "IDLE",
        baseBid: 50,
        currentBid: 0,
        highestTeam: "",
        bidIncrement: 50,
        bidHistory: [],
        lastAction: null
      }
    },
    { upsert: true }
  );
}

// -------------------- ADMIN AUTHENTICATION --------------------

function signAdmin() {
  return jwt.sign(
    { admin: true },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.sgppl_admin;
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.admin) {
      throw new Error("Not admin");
    }

    next();
  } catch {
    res.status(401).json({ error: "Admin login required." });
  }
}

// -------------------- PLAYER HELPERS --------------------

function safePlayer(player) {
  return {
    id: String(player._id),
    name: player.name,
    phone: player.phone,
    village: player.village,
    role: player.role,
    photoUrl: player.photoUrl,
    utr: player.utr,
    status: player.status,
    auctionEligible: player.auctionEligible,
    soldTeam: player.soldTeam,
    soldPoints: player.soldPoints,
    createdAt: player.createdAt
  };
}

function removeUploadedFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return;

  const filename = path.basename(fileUrl);
  const filePath = path.join(uploadDir, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Could not remove upload:", err.message);
  }
}

// -------------------- UNDO SNAPSHOTS --------------------

async function createUndoSnapshot(
  auction,
  playerIds = [],
  teamCodes = []
) {
  const validPlayerIds = [...new Set(
    playerIds.filter(Boolean).map(String)
  )];

  const validTeamCodes = [...new Set(
    teamCodes.filter(Boolean).map(String)
  )];

  const players = validPlayerIds.length
    ? await Player.find({
        _id: { $in: validPlayerIds }
      })
      .select("_id status auctionEligible soldTeam soldPoints")
      .lean()
    : [];

  const teams = validTeamCodes.length
    ? await Team.find({
        code: { $in: validTeamCodes }
      })
      .select("code spentPoints playerCount")
      .lean()
    : [];

  return {
    auction: {
      status: auction.status,
      currentPlayerId: auction.currentPlayerId
        ? String(auction.currentPlayerId)
        : null,
      baseBid: auction.baseBid,
      currentBid: auction.currentBid,
      highestTeam: auction.highestTeam,
      bidIncrement: auction.bidIncrement,
      bidHistory: (auction.bidHistory || []).map(bid => ({
        team: bid.team,
        amount: bid.amount,
        at: bid.at
      })),
      updatedAt: auction.updatedAt
    },

    players: players.map(player => ({
      id: String(player._id),
      status: player.status,
      auctionEligible: player.auctionEligible,
      soldTeam: player.soldTeam,
      soldPoints: player.soldPoints
    })),

    teams: teams.map(team => ({
      code: team.code,
      spentPoints: team.spentPoints || 0,
      playerCount: team.playerCount || 0
    }))
  };
}

async function restoreUndoSnapshot(auction, snapshot) {
  if (!snapshot || !snapshot.auction) {
    throw new Error("Undo information is unavailable.");
  }

  for (const player of snapshot.players || []) {
    await Player.updateOne(
      { _id: player.id },
      {
        $set: {
          status: player.status,
          auctionEligible: player.auctionEligible,
          soldTeam: player.soldTeam,
          soldPoints: player.soldPoints
        }
      }
    );
  }

  for (const team of snapshot.teams || []) {
    await Team.updateOne(
      { code: team.code },
      {
        $set: {
          spentPoints: team.spentPoints,
          playerCount: team.playerCount
        }
      }
    );
  }

  const old = snapshot.auction;

  auction.status = old.status;
  auction.currentPlayerId = old.currentPlayerId || null;
  auction.baseBid = old.baseBid;
  auction.currentBid = old.currentBid;
  auction.highestTeam = old.highestTeam;
  auction.bidIncrement = old.bidIncrement;
  auction.bidHistory = old.bidHistory || [];
  auction.updatedAt = new Date();

  // One-step undo: do not allow the same action to be undone repeatedly.
  auction.lastAction = null;
  auction.markModified("lastAction");

  await auction.save();
}

// -------------------- PUBLIC AUCTION STATE --------------------

async function getPublicState() {
  const [auctionDoc, teams, players] = await Promise.all([
    Auction.findOne({ key: "main" }).lean(),

    Team.find()
      .sort({ code: 1 })
      .lean(),

    Player.find({ auctionEligible: true })
      .select(
        "name village role photoUrl status soldTeam soldPoints createdAt"
      )
      .sort({ createdAt: 1, _id: 1 })
      .lean()
  ]);

  let auction = null;

  if (auctionDoc) {
    const { lastAction, ...safeAuction } = auctionDoc;

    auction = {
      ...safeAuction,
      canUndo: Boolean(lastAction)
    };
  }

  let currentPlayer = null;

  if (auction?.currentPlayerId) {
    const player = await Player.findById(
      auction.currentPlayerId
    ).lean();

    if (player) {
      currentPlayer = safePlayer(player);
    }
  }

  return {
    auction,
    currentPlayer,

    teams: teams.map(team => ({
      code: team.code,
      name: team.name,
      totalPoints: team.totalPoints,
      spentPoints: team.spentPoints || 0,
      remainingPoints:
        (team.totalPoints || 0) - (team.spentPoints || 0),
      playerCount: team.playerCount || 0,
      maxPlayers: team.maxPlayers || 25
    })),

    players: players.map(safePlayer)
  };
}

async function broadcastState() {
  const state = await getPublicState();
  io.to("auction-room").emit("auction:state", state);
}

// -------------------- PLAYER REGISTRATION --------------------

app.post(
  "/api/register",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "paymentScreenshot", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { name, phone, village, role, utr } = req.body;

      if (
        !name ||
        !phone ||
        !village ||
        !role ||
        !utr ||
        !req.files?.photo?.[0]
      ) {
        return res.status(400).json({
          error:
            "Name, phone, village, role, UTR and player photo are required."
        });
      }

      const existing = await Player.findOne({
        utr: utr.trim()
      });

      if (existing) {
        return res.status(409).json({
          error: "This UTR is already registered."
        });
      }

      const photoUrl = `/uploads/${req.files.photo[0].filename}`;

      const paymentScreenshotUrl =
        req.files.paymentScreenshot?.[0]
          ? `/uploads/${req.files.paymentScreenshot[0].filename}`
          : "";

      const player = await Player.create({
        name,
        phone,
        village,
        role,
        utr: utr.trim(),
        photoUrl,
        paymentScreenshotUrl
      });

      res.status(201).json({
        message:
          "Registration submitted. Admin will match your UTR before auction eligibility.",
        playerId: player._id
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          error: "This UTR is already registered."
        });
      }

      res.status(500).json({ error: err.message });
    }
  }
);

// -------------------- ADMIN LOGIN --------------------

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "change-me";

  if (
    username !== expectedUser ||
    password !== expectedPassword
  ) {
    return res.status(401).json({
      error: "Invalid admin login."
    });
  }

  res.cookie("sgppl_admin", signAdmin(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000
  });

  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  res.clearCookie("sgppl_admin");
  res.json({ ok: true });
});

// -------------------- UTR VERIFICATION --------------------

app.post(
  "/api/admin/verify-utr",
  requireAdmin,
  async (req, res) => {
    try {
      const utr = String(req.body.utr || "").trim();

      if (!utr) {
        return res.status(400).json({
          error: "Enter the received UTR."
        });
      }

      const player = await Player.findOne({ utr });

      if (!player) {
        return res.status(404).json({
          error: "UTR NOT FOUND. Check the UTR and try again."
        });
      }

      if (
        player.status === "CONFIRMED" ||
        player.status === "SOLD"
      ) {
        return res.json({
          message: "UTR already verified.",
          player: safePlayer(player)
        });
      }

      player.status = "CONFIRMED";
      player.auctionEligible = true;

      await player.save();
      await broadcastState();

      res.json({
        message: "Payment matched. Player is now auction eligible.",
        player: safePlayer(player)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// -------------------- ADMIN PLAYER LIST --------------------

app.get("/api/admin/players", requireAdmin, async (req, res) => {
  const players = await Player.find()
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  res.json(players.map(safePlayer));
});

// -------------------- EDIT / RE-AUCTION SOLD OR UNSOLD PLAYER --------------------

// For a SOLD player, the original sale points are refunded.
// For an UNSOLD player, the player gets another auction chance.
// If another player is live, that player returns to the waiting list.

app.post(
  "/api/admin/players/:id/re-auction",
  requireAdmin,
  async (req, res) => {
    try {
      const player = await Player.findById(req.params.id);

      if (!player) {
        return res.status(404).json({
          error: "Player not found."
        });
      }

      if (
        player.status !== "SOLD" &&
        player.status !== "UNSOLD"
      ) {
        return res.status(400).json({
          error: "Only SOLD or UNSOLD players can use this option."
        });
      }

      const auction = await Auction.findOne({ key: "main" });

      if (!auction) {
        return res.status(500).json({
          error: "Auction is not initialized."
        });
      }

      const playerIds = [player._id];
      const teamCodes = [player.soldTeam];

      let displacedPlayer = null;

      if (
        auction.status === "LIVE" &&
        auction.currentPlayerId &&
        String(auction.currentPlayerId) !== String(player._id)
      ) {
        displacedPlayer = await Player.findById(
          auction.currentPlayerId
        );

        if (displacedPlayer) {
          playerIds.push(displacedPlayer._id);
        }
      }

      const snapshot = await createUndoSnapshot(
        auction,
        playerIds,
        teamCodes
      );

      // Return the current live player to the confirmed queue.
      if (
        displacedPlayer &&
        displacedPlayer.status === "CONFIRMED" &&
        displacedPlayer.auctionEligible
      ) {
        displacedPlayer.status = "CONFIRMED";
        await displacedPlayer.save();
      }

      // Refund the previous sale if this player was SOLD.
      if (
        player.status === "SOLD" &&
        player.soldTeam &&
        player.soldPoints > 0
      ) {
        const oldTeam = await Team.findOne({
          code: player.soldTeam
        });

        if (oldTeam) {
          oldTeam.spentPoints = Math.max(
            0,
            (oldTeam.spentPoints || 0) - player.soldPoints
          );

          oldTeam.playerCount = Math.max(
            0,
            (oldTeam.playerCount || 0) - 1
          );

          await oldTeam.save();
        }
      }

      player.status = "CONFIRMED";
      player.auctionEligible = true;
      player.soldTeam = "";
      player.soldPoints = 0;

      await player.save();

      // Put the selected player back into the live auction immediately.
      auction.status = "LIVE";
      auction.currentPlayerId = player._id;
      auction.baseBid = 50;
      auction.currentBid = 0;
      auction.highestTeam = "";
      auction.bidIncrement = 50;
      auction.bidHistory = [];
      auction.updatedAt = new Date();
      auction.lastAction = snapshot;
      auction.markModified("lastAction");

      await auction.save();
      await broadcastState();

      res.json({
        ok: true,
        message:
          "Player returned to the live auction. Previous sale was reversed if necessary."
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// -------------------- REMOVE PLAYER --------------------

app.delete(
  "/api/admin/players/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const player = await Player.findById(req.params.id);

      if (!player) {
        return res.status(404).json({
          error: "Player not found."
        });
      }

      const auction = await Auction.findOne({ key: "main" });

      if (
        auction?.currentPlayerId &&
        String(auction.currentPlayerId) === String(player._id)
      ) {
        return res.status(400).json({
          error:
            "This player is currently live. Finish or undo this auction before removing the player."
        });
      }

      if (
        player.status === "SOLD" &&
        player.soldTeam &&
        player.soldPoints > 0
      ) {
        const team = await Team.findOne({
          code: player.soldTeam
        });

        if (team) {
          team.spentPoints = Math.max(
            0,
            (team.spentPoints || 0) - player.soldPoints
          );

          team.playerCount = Math.max(
            0,
            (team.playerCount || 0) - 1
          );

          await team.save();
        }
      }

      removeUploadedFile(player.photoUrl);
      removeUploadedFile(player.paymentScreenshotUrl);

      await Player.deleteOne({ _id: player._id });

      // Clear undo if a player is deleted to prevent stale snapshots.
      if (auction) {
        auction.lastAction = null;
        auction.markModified("lastAction");
        await auction.save();
      }

      await broadcastState();

      res.json({
        ok: true,
        message: "Player removed successfully."
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// -------------------- PUBLIC STATE --------------------

app.get("/api/public/state", async (req, res) => {
  try {
    res.json(await getPublicState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- ADMIN STATE --------------------

app.get("/api/admin/state", requireAdmin, async (req, res) => {
  try {
    const state = await getPublicState();

    const players = await Player.find()
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    res.json({
      ...state,
      allPlayers: players.map(safePlayer)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- AUTOMATIC NEXT PLAYER --------------------

async function startNextConfirmedPlayer(
  auction,
  excludedPlayerId = null
) {
  const query = {
    auctionEligible: true,
    status: "CONFIRMED"
  };

  if (excludedPlayerId) {
    query._id = { $ne: excludedPlayerId };
  }

  const nextPlayer = await Player.findOne(query)
    .sort({ createdAt: 1, _id: 1 });

  if (!nextPlayer) {
    auction.status = "IDLE";
    auction.currentPlayerId = null;
    auction.currentBid = 0;
    auction.highestTeam = "";
    auction.baseBid = 50;
    auction.bidIncrement = 50;
    auction.bidHistory = [];
    auction.updatedAt = new Date();

    await auction.save();
    return null;
  }

  auction.status = "LIVE";
  auction.currentPlayerId = nextPlayer._id;
  auction.currentBid = 0;
  auction.highestTeam = "";
  auction.baseBid = 50;
  auction.bidIncrement = 50;
  auction.bidHistory = [];
  auction.updatedAt = new Date();

  await auction.save();

  return nextPlayer;
}

// -------------------- AUCTION ACTIONS --------------------

async function adminAuctionAction(action, body) {
  const auction = await Auction.findOne({ key: "main" });

  if (!auction) {
    throw new Error("Auction not initialized.");
  }

  // UNDO LAST ACTION
  if (action === "undo") {
    if (!auction.lastAction) {
      throw new Error("There is no recent action to undo.");
    }

    const snapshot = auction.lastAction;

    await restoreUndoSnapshot(auction, snapshot);
    return;
  }

  // START A PLAYER
  if (action === "start") {
    if (auction.status === "LIVE") {
      throw new Error(
        "A player is already live. Finish the current auction first."
      );
    }

    const player = await Player.findOne({
      _id: body.playerId,
      auctionEligible: true,
      status: "CONFIRMED"
    });

    if (!player) {
      throw new Error("Player is not auction eligible.");
    }

    const snapshot = await createUndoSnapshot(auction);

    auction.status = "LIVE";
    auction.currentPlayerId = player._id;
    auction.currentBid = 0;
    auction.highestTeam = "";
    auction.baseBid = 50;
    auction.bidIncrement = 50;
    auction.bidHistory = [];
    auction.updatedAt = new Date();
    auction.lastAction = snapshot;
    auction.markModified("lastAction");

    await auction.save();
    return;
  }

  // TEAM BID
  if (action === "bid") {
    if (
      auction.status !== "LIVE" ||
      !auction.currentPlayerId
    ) {
      throw new Error("No live player.");
    }

    const team = await Team.findOne({
      code: body.teamCode
    });

    if (!team) {
      throw new Error("Invalid team.");
    }

    if ((team.playerCount || 0) >= team.maxPlayers) {
      throw new Error(
        `${team.code} already has ${team.maxPlayers} players.`
      );
    }

    // Automatic bid increments:
    // ₹50, ₹100, ₹150 ... ₹500, then ₹600, ₹700 ...
    const nextBid =
      auction.currentBid === 0
        ? 50
        : auction.currentBid < 500
          ? auction.currentBid + 50
          : auction.currentBid + 100;

    const remaining =
      team.totalPoints - (team.spentPoints || 0);

    if (remaining < nextBid) {
      throw new Error(
        `${team.code} does not have enough points for ₹${nextBid}.`
      );
    }

    const snapshot = await createUndoSnapshot(auction);

    auction.currentBid = nextBid;
    auction.highestTeam = team.code;

    auction.bidHistory.push({
      team: team.code,
      amount: nextBid,
      at: new Date()
    });

    auction.updatedAt = new Date();
    auction.lastAction = snapshot;
    auction.markModified("lastAction");

    await auction.save();
    return;
  }

  // SOLD: DEDUCT POINTS, MARK SOLD, MOVE TO NEXT PLAYER
  if (action === "sold") {
    if (
      auction.status !== "LIVE" ||
      !auction.currentPlayerId ||
      !auction.highestTeam ||
      !auction.currentBid
    ) {
      throw new Error(
        "There is no valid highest bid to sell."
      );
    }

    const team = await Team.findOne({
      code: auction.highestTeam
    });

    const player = await Player.findById(
      auction.currentPlayerId
    );

    if (!team || !player) {
      throw new Error("Auction data is invalid.");
    }

    if ((team.playerCount || 0) >= team.maxPlayers) {
      throw new Error("Team has reached 25 players.");
    }

    if (
      team.totalPoints - (team.spentPoints || 0) <
      auction.currentBid
    ) {
      throw new Error("Team no longer has enough points.");
    }

    const snapshot = await createUndoSnapshot(
      auction,
      [player._id],
      [team.code]
    );

    team.spentPoints =
      (team.spentPoints || 0) + auction.currentBid;
    team.playerCount = (team.playerCount || 0) + 1;

    await team.save();

    player.status = "SOLD";
    player.auctionEligible = true;
    player.soldTeam = team.code;
    player.soldPoints = auction.currentBid;

    await player.save();

    auction.lastAction = snapshot;
    auction.markModified("lastAction");
    await auction.save();

    // Automatically start the next confirmed player.
    await startNextConfirmedPlayer(
      auction,
      player._id
    );

    return;
  }

  // UNSOLD: MARK UNSOLD AND MOVE TO NEXT PLAYER
  if (action === "unsold") {
    if (
      auction.status !== "LIVE" ||
      !auction.currentPlayerId
    ) {
      throw new Error("No live player.");
    }

    const currentPlayer = await Player.findById(
      auction.currentPlayerId
    );

    if (!currentPlayer) {
      throw new Error("Current player not found.");
    }

    const snapshot = await createUndoSnapshot(
      auction,
      [currentPlayer._id]
    );

    currentPlayer.status = "UNSOLD";
    currentPlayer.auctionEligible = true;
    currentPlayer.soldTeam = "";
    currentPlayer.soldPoints = 0;

    await currentPlayer.save();

    auction.lastAction = snapshot;
    auction.markModified("lastAction");
    await auction.save();

    await startNextConfirmedPlayer(
      auction,
      currentPlayer._id
    );

    return;
  }

  // RESET AUCTION SCREEN
  if (action === "reset") {
    const snapshot = await createUndoSnapshot(auction);

    auction.status = "IDLE";
    auction.currentPlayerId = null;
    auction.currentBid = 0;
    auction.highestTeam = "";
    auction.baseBid = 50;
    auction.bidIncrement = 50;
    auction.bidHistory = [];
    auction.updatedAt = new Date();
    auction.lastAction = snapshot;
    auction.markModified("lastAction");

    await auction.save();
    return;
  }

  throw new Error("Unknown auction action.");
}

app.post(
  "/api/admin/auction/:action",
  requireAdmin,
  async (req, res) => {
    try {
      await adminAuctionAction(
        req.params.action,
        req.body || {}
      );

      await broadcastState();

      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// -------------------- LIVE VIEWERS --------------------

io.on("connection", socket => {
  socket.join("auction-room");

  getPublicState()
    .then(state => {
      socket.emit("auction:state", state);
    })
    .catch(err => {
      console.error(
        "Could not send initial auction state:",
        err.message
      );
    });
});

// -------------------- ERROR HANDLING --------------------

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image is too large. Maximum allowed size is 10 MB."
        : err.message;

    return res.status(400).json({ error: message });
  }

  res.status(400).json({
    error: err.message || "Something went wrong."
  });
});

// -------------------- START SERVER --------------------

async function start() {
  await mongoose.connect(
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/sgppl2"
  );

  await seedTeams();

  server.listen(PORT, () => {
    console.log(
      `SGPPL-2 running on http://localhost:${PORT}`
    );
  });
}

start().catch(err => {
  console.error("Server failed to start:", err);
  process.exit(1);
});