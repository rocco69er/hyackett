const { addonBuilder, serveHTTP, getInterface } = require("stremio-addon-sdk");
const axios = require("axios");
const parseTorrent = require("parse-torrent");
const cors = require("cors");

const type_ = {
  MOVIE: "movie",
  TV: "series",
};

const toStream = (parsed, tor, type, s, e) => {
  const infoHash = parsed.infoHash.toLowerCase();
  let title = tor.extraTag || parsed.name;
  let index = -1;
  if (type === type_.TV) {
    index = (parsed.files ?? []).findIndex((element, index) => {
      return (
        element["name"]?.toLowerCase()?.includes(`s0${s}`) &&
        element["name"]?.toLowerCase()?.includes(`e0${e}`) &&
        (element["name"]?.toLowerCase()?.includes(`.mkv`) ||
          element["name"]?.toLowerCase()?.includes(`.mp4`) ||
          element["name"]?.toLowerCase()?.includes(`.avi`) ||
          element["name"]?.toLowerCase()?.includes(`.flv`))
      );
    });

    title += index == -1 ? "" : `\n${parsed.files[index]["name"]}`;
  }

  const subtitle = "Seeds: " + tor["Seeders"] + " / Peers: " + tor["Peers"];
  title += (title.indexOf("\n") > -1 ? "\r\n" : "\r\n\r\n") + subtitle;

  return {
    name: tor["Tracker"],
    type: type,
    infoHash: infoHash,
    fileIdx: index == -1 ? 1 : index,
    sources: (parsed.announce || []).map((x) => "tracker:" + x).concat(["dht:" + infoHash]),
    title: title,
  };
};

const streamFromMagnet = async (tor, uri, type, s, e) => {
  if (!uri || typeof uri !== "string") {
    console.error("Invalid URI:", uri);
    return false;
  }

  if (uri.startsWith("magnet:?")) {
    try {
      return toStream(parseTorrent(uri), tor, type, s, e);
    } catch (error) {
      console.error("Invalid magnet URI:", error.message);
      return false;
    }
  }

  try {
    const { data } = await axios.get(uri);
    return toStream(parseTorrent(data), tor, type, s, e);
  } catch (error) {
    console.error("Error fetching torrent data:", error.message);
    return false;
  }
};

let hosts = ["http://104.254.43.51:9117"]; // Replace host:port with your actual Jackett API endpoint
let apiKey = "sttm651zbu0s3mabuwjhary5aax4gke4"; // Replace with your Jackett API key

let fetchTorrent = async (hosts, apiKey, query) => {
  try {
    const results = await Promise.all(
      hosts.map(async (host) => {
        const url = `${host}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${query}&_=${Date.now()}`;
        try {
          const response = await axios.get(url);
          return response.data["Results"];
        } catch (error) {
          console.error(`Error fetching results from ${host}:`, error.message);
          return [];
        }
      })
    );

    // Flatten the results from different hosts into a single array
    const allResults = results.flat();

    if (allResults.length !== 0) {
      return allResults.map((result) => ({
        Tracker: result["Tracker"],
        Category: result["CategoryDesc"],
        Title: result["Title"],
        Seeders: result["Seeders"],
        Peers: result["Peers"],
        Link: result["Link"],
      }));
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error fetching torrent results:", error.message);
    return [];
  }
};

const getMeta = async (id, type) => {
  const [tt, s, e] = id.split(":");
  const queryUrl = `https://v2.sg.media-imdb.com/suggestion/t/${tt}.json`;

  try {
    const response = await axios.get(queryUrl);
    const suggestions = response.data?.d || [];

    const meta = suggestions.find((item) => item.id === id);
    if (!meta) {
      throw new Error("Meta data not found for the given ID.");
    }

    return { name: meta.l, year: meta.y };
  } catch (error) {
    console.error("Error fetching meta data:", error.message);
    // Fallback to an empty object if meta data is not available
    return {};
  }
};

const app = require("express")();

app.use(cors()); // Enable CORS for all routes

app.get("/manifest.json", (req, res) => {
  const manifest = {
    id: "mikmc.od.org+++",
    version: "3.0.0",
    name: "Hackett",
    description: "Torrent results from Jackett Indexers",
    icon: "https://raw.githubusercontent.com/mikmc55/stremio-jackett/main/hy.jpg",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
  };
  res.setHeader("Content-Type", "application/json");
  return res.send(manifest);
});

app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  const [tt, s, e] = id.split(":");
  const query = s ? `${tt} s${s} e${e}` : tt;
  const results = await fetchTorrent(hosts, apiKey, query);
  const streams = await Promise.all(
    results.map(async (result) => streamFromMagnet(result, result["Link"], type, s, e))
  );

  const meta = await getMeta(id, type);

  const metas = streams.map((stream) => ({
    id: `${tt}:${stream.type === "series" ? s + ":" + e : ""}${stream.infoHash.toUpperCase()}`,
    name: stream.title,
    type: stream.type,
    infoHash: stream.infoHash,
    season: stream.type === "series" ? parseInt(s) : null,
    episode: stream.type === "series" ? parseInt(e) : null,
    title: meta.name,
    year: meta.year,
    poster: `https://m.media-amazon.com/images/M/${tt}.jpg`,
    background: `https://m.media-amazon.com/images/M/${tt}.jpg`,
  }));

  res.setHeader("Content-Type", "application/json");
  return res.send({ metas });
});

const builder = new addonBuilder(getInterface(app));
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { port: process.env.PORT || 3000 });
