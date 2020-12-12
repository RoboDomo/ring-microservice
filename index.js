process.title = process.env.TITLE || "ring-microservice";

const debug = require("debug")("ring"),
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

class CameraHost extends HostBase {
  constructor(camera, location) {
    console.log(location.locationDetails);
    super(mqtt_host, topic + "/" + location.locationDetails.name + '/' + camera.description);
    this.camera = camera;
    const d = camera.initialData;
    this.info = {
      id: camera.id,
      type: camera.deviceType,
      model: camera.model,
      description: d.description,
      deviceId: d.device_id,
      batteryLife: d.battery_life,
      kind: d.kind,
      locationId: d.location_id,
      created: new Date(d.created_at),
    };
    console.log("construct camera");
    console.dir(this.info);
    console.log("");
    for (const key in camera) {
      console.log(key);
    }
  }
}

class ChimeHost extends HostBase {
  constructor(chime, location) {
    super(mqtt_host, topic + "/" + location.locationDetails.name + '/' + chime.description);
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
    };
    console.log("construct chime");
    console.dir(this.info);
    console.log("");
    //    const d = camera.initialData;
    //    this.info = {
    //      id: camera.id,
    //      type: camera.deviceType,
    //      model: camera.model,
    //      description: d.description,
    //      deviceId: d.device_id,
    //      batteryLife: d.battery_life,
    //      kind: d.kind,
    //      locationId: d.location_id,
    //      created: new Date(d.created_at),
    //    };
    //    console.log("construct camera");
    //    console.dir(this.info);
    //    console.log("");
    for (const key in chime) {
      console.log(key);
    }
    console.log("");
    console.log(chime.initialData);
  }
}

const cameraHosts = [],
  chimeHosts = [];

const processCameras = async (location) => {
  console.log("");
  console.log("");
  console.log("");
  for (const camera of location.cameras) {
    cameraHosts.push(new CameraHost(camera, location));
  }
};

const processChimes = async (location) => {
  console.log("");
  console.log("");
  console.log("");
  for (const chime of location.chimes) {
    chimeHosts.push(new ChimeHost(chime, location));
    //    console.log("chime", chime);
  }
};

const processLocation = async (location) => {
  console.log("cameras", location.cameras.length);
  await processCameras(location);
  console.log("chimes", location.chimes.length);
  await processChimes(location);
  for (const key in location) {
    console.log(key);
  }
  console.log(location.locationDetails);
  console.log(location.options);
};

const main = async () => {
  const locations = await ring.getLocations(),
    location = locations[0];
  console.log("locations", locations.length);
  await processLocation(location);
  return;

  try {
    const cameras = await ring.getCameras(),
      camera = cameras[0],
      eventsResponse = await location.getCameraEvents();
    //      eventsResponse = await camera.getEvents({
    //        kind: "ding",
    //        state: "accepted",
    //      }),
    events = eventsResponse.events;
    //    cosnt events = await camera.getEvents();
    console.log("events", events.length);
    for (const event of events) {
      //      const url = await camera.getRecordingUrl(event.ding_id_str, { transcoded: false});
      console.log("");
      console.log("");
      console.log(
        `${new Date(event.created_at).toLocaleString()}, kind(${event.kind})`
      );
      console.log("");
      console.log("");
      //      console.log(url);
      console.log("");
      console.log("");
    }
    console.log(events[0]);

    const locationBeamsEvents = await location.getHistory({
      category: "beams",
    });
    console.log("beams", locationBeamsEvents);
  } catch (e) {
    console.log("e", e);
  }
  //  console.log(RingAPI);
  //  console.log("");
  //  console.log("ring", ring);
};

console.log("");
console.log("");
console.log("");
console.log("");
console.log("");
console.log("Starting");
main();
