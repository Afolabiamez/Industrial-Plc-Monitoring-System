const { InfluxDB, Point } = require("@influxdata/influxdb-client");

const influx = new InfluxDB({
  url: "http://localhost:8086",
  token: "VeD5nHy40Q7pYNO8bOGcTHSPKZO7l1RWxjNivBLCQOHWwxzJ-kLk1XzLkwmX-z4xeCAdfXYi2eO-lrT9waW5oA=="
});

const writeApi = influx.getWriteApi(
  "admin",
  "plc-data"
);

const net = require("net");
const express = require("express");
const client = new net.Socket();

const app = express();
const PORT = 4000;

// latest PLC values
let latestData = {
  pressure: 0,
  pump: "OFF",
  alarm: false,
  alarmCount: 0
};

client.connect(5010, "192.168.3.39", () => {
  console.log("Connected to PLC");
  setInterval(sendRead, 2000);
});

function sendRead() {
  const packet = Buffer.from([
    0x50,0x00,
    0x00,0xFF,
    0xFF,0x03,
    0x00,
    0x0C,0x00,
    0x10,0x00,
    0x01,0x04,
    0x00,0x00,

    // ===== START DEVICE: D0 =====
    0x00,0x00,0x00,
    0xA8,

    // ===== NUMBER OF WORDS =====
    0x0D,0x00   // 13 words
  ]);

  client.write(packet);
}

client.on("data", (data) => {
  const DEVICE_OFFSET = 11;
  // helper: read D-register word
  const getD = (n) => {
    return data.readUInt16LE(DEVICE_OFFSET + (n * 2));
  }

  // ===== PLC MAPPED REGISTERS =====
  const pressure = getD(0);     // D0 = pressure (initial = 90)
  const pumpReg = getD(10);     // D10 = pump state (0/1)
  const alarm = getD(11);       // D11 = alarm (0/1)
  const alarmCount = getD(12);  // D12 = alarm counter

  // ===== STATE INTERPRETATION =====
  
  const pump = pumpReg === 1 ? "ON" : "OFF";

  console.log(`Pressure: ${pressure}`);
  console.log(`Pump: ${pump}`);
  console.log(`Alarm: ${alarm}`);
  console.log(`AlarmCount: ${alarmCount}`);
  console.log("<---------------------->");

  latestData = {
    pressure,
    pump,
    alarm,
    alarmCount
  };

  const point = new Point("pump_monitor_v2")
    .tag("device", "mitsubishi_q03")
    .floatField("pressure", pressure)
    .intField("pumpState", pumpReg)
    .intField("alarmState", alarm)
    .intField("alarmCount", alarmCount);

writeApi.writePoint(point);

});

setInterval(() => {
  writeApi.flush();
}, 5000);

client.on("error", console.error);


// EXPRESS UI

app.get("/", (req, res) => {

  res.send(`
    <html>
      <head>
        <title>Pump Dashboard</title>
        <meta http-equiv="refresh" content="3">

        <style>
          body {
            font-family: Arial;
            background: #111;
            color: white;
            padding: 30px;
          }

          .card {
            background: #222;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
          }

          h1 {
            color: #00ff99;
          }
        </style>

      </head>

      <body>

        <h1>Pump Monitoring Dashboard</h1>

        <div class="card">
          <h2>Pressure</h2>
          <p>${latestData.pressure}</p>
        </div>

        <div class="card">
          <h2>Pump Status</h2>
          <p>${latestData.pump}</p>
        </div>

        <div class="card">
          <h2>Alarm</h2>
          <p>${latestData.alarm}</p>
        </div>

        <div class="card">
          <h2>Alarm Count</h2>
          <p>${latestData.alarmCount}</p>
        </div>

      </body>
    </html>
  `);

});

app.listen(PORT, () => {
  console.log(
    `Dashboard running at http://localhost:${PORT}`
  );
});