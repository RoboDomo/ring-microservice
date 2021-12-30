process.title = process.env.TITLE || "ring-microservice";

process.env.DEBUG = "HostBase,Ring";

const debug = require("debug")("Ring"),
  promisify = require("util").promisify,
  fs = require("fs"),
  { writeFile, readFile } = fs,
  HostBase = require("microservice-core/HostBase");

const mqtt_host = process.env.MQTT_HOST || "mqtt";
const topic = process.env.MQTT_TOPIC || "ring";

const RingAPI = require("ring-client-api"),
  ring = new RingAPI.RingApi({
    cameraStatusPollingSeconds: 20,
    cameraDingsPollingSeconds: 2,
    avoidSnapshotBatteryDrain: true,
    refreshToken: process.env.RING_TOKEN,
  });

ring.onRefreshTokenUpdated.subscribe(
  async ({ newRefreshToken, oldRefreshToken }) => {
    console.log("Refresh Token Updated: ", newRefreshToken);

    // If you are implementing a project that use `ring-client-api`, you should subscribe to onRefreshTokenUpdated and update your config each time it fires an event
    // Here is an example using a .env file for configuration
    if (!oldRefreshToken) {
      return;
    }

    const currentConfig = await promisify(readFile)(".env"),
      updatedConfig = currentConfig
        .toString()
        .replace(oldRefreshToken, newRefreshToken);

    await promisify(writeFile)(".env", updatedConfig);
  },
);

function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }

  return true;
}

function isObject(object) {
  return object != null && typeof object === "object";
}

class DelayedTask {
  constructor(fn, time) {
    this.fn = fn;
    this.timer = setTimeout(fn, time);
  }

  defer(time) {
    this.cancel();
    this.timer = setTimeout(this.fn, time);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

class CameraHost extends HostBase {
  constructor(camera, location) {
    super(
      mqtt_host,
      topic +
        "/" +
        location.locationDetails.name +
        "/" +
        camera.initialData.description,
      true,
    );
    debug("construct camera", this.topic);
    this.alert("alert", process.title, " running");
    this.camera = camera;
    this.device = camera.initialData.description;
    const d = camera.initialData;
    this.info = {
      id: camera.id,
      type: camera.deviceType,
      model: camera.model,
      description: d.description,
      deviceId: d.device_id,
      isDoorBot: camera.isDoorbot,
      hasBattery: camera.hasBattery,
      hasSiren: camera.hasSiren,
      hasLight: camera.hasLight,
      batteryLife: d.battery_life,
      kind: d.kind,
      locationId: d.location_id,
      created: new Date(d.created_at),
      data: camera.data,
    };

    this.events = {};
    this.data = {}; // camera.initialData;

    this.run();
  }

  async processEvents() {
    while (this.processing) {
      await this.wait(100);
    }
    this.processing = true;
    try {
      //    debug("processEvents");
      const eventResponse = await this.camera.getEvents({ limit: 10000 }),
        events = eventResponse.events;

      let update = false;
      this.events = {};
      for (const event of events) {
        const created = new Date(event.created_at),
          key = created.getTime();

        event.created = created;

        if (!this.events[key]) {
          //        console.log("update", key);
          const url = await this.camera.getRecordingUrl(event.ding_id_str, {
            transcoded: false,
          });
          event.url = url;
          this.events[key] = {
            event: event,
            url: url,
          };
          update = true;
        }
      }
      if (update) {
        debug(
          ">>>>>>>>>>>>>>>>>>>>>>>>>> processEvents UPDATE >>>>>>>>>>>>>>>>>>>>",
        );
        this.retain = true;
        this.state = { events: this.events };
      }
    } catch (e) {}

    this.processing = false;
  }

  async run() {
    this.client.on("connect", async () => {
      this.camera.onData.subscribe(async (data) => {
        debug("<<<<<< onData", JSON.stringify(data).substr(0, 40));
        if (!deepEqual(data, this.data)) {
          this.retain = true;
          this.state = { battery: Number(data.battery_life) };
          const newInfo = Object.assign({}, this.info);
          newInfo.data = data;
          this.retain = true;
          this.state = { info: newInfo };
          this.data = data;
        }
        await this.processEvents();
      });

      this.camera.onNewDing.subscribe(async (data) => {
        debug("<<<<<< newDing data", data);
        this.retain = false;
        this.state = { ding: data };
        await this.processEvents();
      });

      this.camera.onDoorbellPressed.subscribe(async (state) => {
        debug("<<<<<< doorbell pressed", state);
        this.retain = false;
        this.state = { doorbell: "active" };
        this.alert(
          "ALERT",
          `There is someone ringing the doorbell at ${this.device}.`,
        );
        if (this.delayedTask) {
          this.delayedTask.defer(2000);
        } else {
          this.delayedTask = new DelayedTask(async () => {
            this.retain = true;
            this.state = { doorbell: "inactive" };
            this.delayedTask = null;
          }, 2000);
        }
        await this.processEvents();
      });

      this.camera.onMotionDetected.subscribe(async (state) => {
        debug("<<<<<< detected motion state", state);
        this.retain = true;
        this.state = { motion: state ? "active" : "inactive" };
        if (state) {
          this.alert("ALERT", `There is motion at ${this.device}.`);
        }
        await this.processEvents();
      });

      this.retain = true;
      this.state = { doorbell: "inactive" };
    });
  }
}

class ChimeHost extends HostBase {
  constructor(chime, location) {
    super(
      mqtt_host,
      topic +
        "/" +
        location.locationDetails.name +
        "/" +
        chime.initialData.description,
      true,
    );
    debug("construct chime", this.topic);
    this.retain = false;
    this.chime = chime;
    const d = chime.initialData;
    this.info = {
      id: chime.id,
      type: chime.deviceType,
      model: chime.model,
      description: d.description,
      deviceId: d.device_id,
      kind: d.kind,
      created: new Date(d.created_at),
      data: chime.data,
    };
    this.run();
  }

  async run() {
    for (;;) {
      await this.wait(15000);
    }
  }

  async command(topic, command) {
    debug("command", topic, command);
    await chime.playSound(command);
  }
}

const cameraHosts = [],
  chimeHosts = [];

const processCameras = async (location) => {
  debug("cameras", location.cameras.length);
  for (const camera of location.cameras) {
    cameraHosts.push(new CameraHost(camera, location));
  }
  debug("");
};

const processChimes = async (location) => {
  debug("chimes", location.chimes.length);
  for (const chime of location.chimes) {
    chimeHosts.push(new ChimeHost(chime, location));
  }
  debug("");
};

const processLocation = async (location) => {
  await processCameras(location);
  await processChimes(location);
};

const main = async () => {
  try {
    const locations = await ring.getLocations();

    debug("locations", locations.length);
    for (const location of locations) {
      await processLocation(location);
    }
  } catch (e) {
    console.log("e", e);
  }
};

//
console.clear();
main();
