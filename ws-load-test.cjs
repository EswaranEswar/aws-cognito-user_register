// load-test.cjs (CommonJS)
const axios = require("axios");
const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// ====== CONFIG ======
const URL = process.env.URL || "https://app.qa.astraops.ai";
const WS_PATH = process.env.WS_PATH || "/socket.io";
const LOGIN_API = process.env.LOGIN_API || "http://localhost:3006/api/users/get-cookies";
const VERSION_ID = process.env.VERSION_ID || "68caaf76804279b010e9bc32"; // override with env if needed

const MAX_CLIENTS = 100; // upper bound on concurrent clients
const CLIENT_CREATION_INTERVAL_IN_MS = 100; // ramp-up speed
const EMIT_INTERVAL_IN_MS = 3000; // default message interval per client (ms)
const PACKETS_PER_USER = 1; // default messages per interval per client
const PROFILE = (process.env.PROFILE || 'basic').toLowerCase(); // basic | medium | advanced | single
const SINGLE = process.env.SINGLE === 'true' || PROFILE === 'single';
const TOTAL_MSGS_PER_SEC = Number(process.env.TOTAL_MSGS_PER_SEC || 0); // optional global throughput target
const TEST_DURATION_MS = Number(process.env.TEST_DURATION_MS || 60000); // total test duration
// =====================

let clientCount = 0;
let lastReport = Date.now();
let packetsSinceLastReport = 0;
let totalPacketsReceived = 0;
let ackCountSinceLastReport = 0;
let totalAckCount = 0;
let positionUpdatedSinceLastReport = 0;
let totalPositionUpdated = 0;
let rateLimitedSinceLastReport = 0;
let totalRateLimited = 0;
let errorSinceLastReport = 0;
let totalErrorEvents = 0;
let reportIntervalId;

// Runtime-adjustable send controls (derived after cookie count known)
let emitIntervalMs = EMIT_INTERVAL_IN_MS;
let packetsPerUser = PACKETS_PER_USER;
let configuredClientCap = MAX_CLIENTS;

// ---- LOGGING SETUP ----
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, "data", `ws-load-errors-${Date.now()}.log`);
try {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
} catch (_) {}
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
function logErrorLine(lineObj) {
  try {
    logStream.write(JSON.stringify({
      time: new Date().toISOString(),
      ...lineObj,
    }) + "\n");
  } catch (_) {}
}

// ---- STEP 1: Fetch cookies from your API ----
async function fetchUserCookie(input) {
  const res = await axios.post(LOGIN_API, {
    input: input,
  });

  if (res.status < 200 || res.status >= 300) {
    console.log(res.status, res.data);
    throw new Error(`Failed to fetch cookie for ${input}`);
  }
  if (!Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`No cookies found in response for ${input}`);
  }

  return res.data;
}

// ---- STEP 2: Create socket client with cookie ----
function createClient(cookie, userId) {
  const cookieHeader = cookie.includes('=') ? cookie : `connect.sid=${cookie}`;
  const socket = io(URL, {
    transports: ["websocket"],
    path: WS_PATH,
    extraHeaders: {
      Cookie: cookieHeader,
      Origin: URL,
    },
    query: {
      clientType: 'load-test',
      userId: userId,
    },
  });

  if (!SINGLE) {
    setInterval(() => {
      for (let i = 0; i < packetsPerUser; i++) {
        const payload = buildUpdatePayload();
        socket.emit(
          "update-position",
          payload,
          () => {
            ackCountSinceLastReport++;
          }
        );
      }
    }, emitIntervalMs);
  } else {
    // One-shot: emit once after connect then finish
    socket.on("connect", () => {
      const payload = buildUpdatePayload();
      socket.emit(
        "update-position",
        payload,
        () => {
          ackCountSinceLastReport++;
        }
      );
      setTimeout(() => {
        try { socket.disconnect(); } catch (_) {}
      }, 300);
    });
  }

  // Count server events
  socket.on("position-updated", () => {
    positionUpdatedSinceLastReport++;
  });

  socket.on("rate-limited", () => {
    rateLimitedSinceLastReport++;
    logErrorLine({ userId, event: "rate-limited" });
  });

  let lastEventLog = 0;
  socket.onAny((eventName) => {
    const now = Date.now();
    if (now - lastEventLog > 2000) {
      console.log(`Client ${userId} received event:`, eventName);
      lastEventLog = now;
    }
  });

  socket.on("connect_error", (err) => {
    try {
      console.log(`Client ${userId} connect_error:`, err?.message || err);
      if (err && err.response && err.response.status) {
        console.log(`Status: ${err.response.status}`);
      }
      if (err && err.description) {
        console.log(`Description:`, err.description);
      }
      if (err && err.context) {
        console.log(`Context:`, err.context);
      }
    } catch (_) {}
  });

  socket.on("error", (err) => {
    console.log(`Client ${userId} error:`, err?.message || err);
    errorSinceLastReport++;
    logErrorLine({
      userId,
      event: "error",
      message: (err && err.message) || String(err),
      raw: err && err.stack ? err.stack : err,
    });
  });

  socket.on("connect", () => {
    console.log(`Client ${userId} connected`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Client ${userId} disconnected: ${reason}`);
  });

  clientCount++;
}

// Build payload to match server contract
function buildUpdatePayload() {
  const randomX = 1500 + Math.random() * 600;
  const randomY = 600 + Math.random() * 400;
  return [
    {
      versionId: VERSION_ID,
      edgeModelList: [],
      nodeModelList: [
        {
          id: "e45a82f5-0a3b-4967-ab1a-cc51f1b8c7ae",
          type: "COMPONENT",
          position: {
            x: Number(randomX.toFixed(3)),
            y: Number(randomY.toFixed(3)),
          },
          measured: {
            width: 800,
            height: 800,
          },
          data: {
            id: "e45a82f5-0a3b-4967-ab1a-cc51f1b8c7ae",
            label: "Provider",
            isValid: true,
            width: 800,
            height: 800,
            hadResourceEdit: true,
            category: "Component",
            type: "COMMON_CLOUD_PROVIDER",
            userDefinedName: "Provider-creating...",
            serviceName: "CLOUD_PROVIDER",
            parentNodeId: "no-parent",
            provider: "AZURE",
            enableResize: true,
            childType: "default",
            resourceType: "METARESOURCE",
            style: {
              cornerRadius: 4,
              strokeType: "dashed",
              strokeWeight: 2,
              borderStyle: "dashed",
              borderColor: "#00000070",
              borderWidth: "2px",
              borderRadius: "4px",
            },
          },
        },
      ],
    },
  ];
}

// ---- STEP 3: Run the test ----
async function startTest() {
  console.log("Fetching cookies for test users...");
  let cookies = [];
  
  try {
    // Fetch all cookies from database in one call
    const allCookies = await fetchUserCookie("cookies");
    console.log(`Found ${allCookies.length} cookies in database`);
    
    cookies = allCookies;
  } catch (err) {
    console.error("Failed to fetch cookies:", err.message);
    return;
  }

  // Derive profile-based settings
  const cookieCount = cookies.length;
  const availableClients = Math.min(MAX_CLIENTS, cookieCount);

  switch (PROFILE) {
    case 'advanced':
      configuredClientCap = availableClients; // up to cookies
      emitIntervalMs = 500; // faster
      packetsPerUser = 2; // more messages per tick
      break;
    case 'medium':
      configuredClientCap = Math.min(20, availableClients);
      emitIntervalMs = 2000;
      packetsPerUser = 1;
      break;
    case 'single':
      configuredClientCap = Math.min(1, availableClients);
      emitIntervalMs = 1000;
      packetsPerUser = 1;
      break;
    case 'basic':
    default:
      configuredClientCap = Math.min(10, availableClients);
      emitIntervalMs = 3000;
      packetsPerUser = 1;
      break;
  }

  // Optional global throughput target overrides per-client settings
  if (TOTAL_MSGS_PER_SEC > 0 && configuredClientCap > 0) {
    const perClientPerSec = TOTAL_MSGS_PER_SEC / configuredClientCap;
    if (perClientPerSec >= 1) {
      emitIntervalMs = 1000; // tick per second
      packetsPerUser = Math.max(1, Math.floor(perClientPerSec));
    } else {
      packetsPerUser = 1;
      emitIntervalMs = Math.max(50, Math.round(1000 / perClientPerSec));
    }
  }

  console.log("Starting load test...");
  console.log(`Profile: ${PROFILE}`);
  console.log(`Configured clients: ${configuredClientCap} (cookies: ${cookieCount})`);
  if (TOTAL_MSGS_PER_SEC > 0) {
    console.log(`Throughput target: ${TOTAL_MSGS_PER_SEC} msg/sec total`);
  }
  console.log(`Client send config: packetsPerUser=${packetsPerUser}, emitIntervalMs=${emitIntervalMs}`);
  let userIndex = 0;
  const testStartTime = Date.now();

  function spawnClient() {
    if (clientCount >= configuredClientCap) return;

    const cookie = cookies[userIndex % cookies.length];
    const userId = `user-${clientCount + 1}`;
    createClient(cookie, userId);

    userIndex++;
    setTimeout(spawnClient, CLIENT_CREATION_INTERVAL_IN_MS);
  }

  spawnClient();

  const finish = () => {
    const elapsedSec = ((Date.now() - testStartTime) / 1000).toFixed(1);
    // Roll up totals
    packetsSinceLastReport = ackCountSinceLastReport + positionUpdatedSinceLastReport + rateLimitedSinceLastReport + errorSinceLastReport;
    totalPacketsReceived += packetsSinceLastReport;
    totalAckCount += ackCountSinceLastReport;
    totalPositionUpdated += positionUpdatedSinceLastReport;
    totalRateLimited += rateLimitedSinceLastReport;
    totalErrorEvents += errorSinceLastReport;
    packetsSinceLastReport = 0;
    ackCountSinceLastReport = 0;
    positionUpdatedSinceLastReport = 0;
    rateLimitedSinceLastReport = 0;
    errorSinceLastReport = 0;
    if (reportIntervalId) clearInterval(reportIntervalId);

    const avgPacketsPerSecOverall = (totalPacketsReceived / (Number(elapsedSec) || 1)).toFixed(2);
    console.log("\n===== Load Test Summary =====");
    console.log(`URL: ${URL}${WS_PATH}`);
    console.log(`Clients connected: ${clientCount}/${MAX_CLIENTS}`);
    console.log(`Cookies used: ${cookies.length}`);
    console.log(`Total events: ${totalAckCount + totalPositionUpdated + totalRateLimited + totalErrorEvents}`);
    console.log(` - acks: ${totalAckCount}`);
    console.log(` - position-updated: ${totalPositionUpdated}`);
    console.log(` - rate-limited: ${totalRateLimited}`);
    console.log(` - error: ${totalErrorEvents}`);
    console.log(`Average packets/sec (overall): ${avgPacketsPerSecOverall}`);
    console.log(`Test duration (sec): ${elapsedSec}`);
    console.log("============================\n");
    try { logStream.end(); } catch (_) {}
    process.exit(0);
  };

  if (SINGLE) {
    // Finish shortly after one-shot send
    setTimeout(finish, 1500);
  } else {
    setTimeout(finish, TEST_DURATION_MS);
  }
}

startTest();

// ---- STEP 4: Reporting ----
function printReport() {
  const now = Date.now();
  const durationSinceLastReport = (now - lastReport) / 1000;
  // Aggregate events for this window
  packetsSinceLastReport = ackCountSinceLastReport + positionUpdatedSinceLastReport + rateLimitedSinceLastReport + errorSinceLastReport;
  const packetsPerSecond = (packetsSinceLastReport / durationSinceLastReport).toFixed(2);

  console.log(
    `clients: ${clientCount} | avg packets/sec: ${packetsPerSecond}`
  );

  totalPacketsReceived += packetsSinceLastReport;
  totalAckCount += ackCountSinceLastReport;
  totalPositionUpdated += positionUpdatedSinceLastReport;
  totalRateLimited += rateLimitedSinceLastReport;
  totalErrorEvents += errorSinceLastReport;
  packetsSinceLastReport = 0;
  ackCountSinceLastReport = 0;
  positionUpdatedSinceLastReport = 0;
  rateLimitedSinceLastReport = 0;
  errorSinceLastReport = 0;
  lastReport = now;
}

reportIntervalId = setInterval(printReport, 5000);


