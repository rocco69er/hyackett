require("dotenv").config();
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const parseTorrent = require("parse-torrent");

const type_ = {
  MOVIE: "movie",
  TV: "series",
};

const toStream = (parsed, tor, type, s, e) => {
  const infoHash = parsed.infoHash.toLowerCase();
  let title = tor.extraTag || parsed.name;
  let index = -1;
  if (type === "series") {
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
    sources: (parsed.announce || [])
      .map((x) => {
        return "tracker:" + x;
      })
      .concat(["dht:" + infoHash]),
    title: title,
  };
};

const streamFromMagnet = (tor, uri, type, s, e) => {
  return new Promise((resolve, reject) => {
    if (uri.startsWith("magnet:?")) {
      resolve(toStream(parseTorrent(uri), tor, type, s, e));
    }
    parseTorrent.remote(uri, (err, parsed) => {
      if (!err) {
        resolve(toStream(parsed, tor, type, s, e));
      } else {
        resolve(false);
      }
    });
  });
};

let stream_results = [];
let torrent_results = [];

let host = "http://100.40.225.234:9117"; // Update to your desired host
let apiKey = "fql6lmpnr2xnw2om8s7arfcmkpd2jinw"; // Update to your desired API key

let fetchTorrent = async (query) => {
  try {
    let url = `${host}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${query}&_=1691241987837`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Error fetching data from the API");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
};

app.get("/manifest.json", (req, res) => {
  var json = {
    id: "mikmc.od.org+++",
    version: "3.0.0",
    name: "Hackett",
    description: "Torrent results from Jackett Indexers",
    icon: "https://raw.githubusercontent.com/mikmc55/stremio-jackett/main/hy.jpg",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
  };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  return res.send(json);
});

app.get("/stream/:type/:id", async (req, res) => {
  try {
    const media = req.params.type === "series" ? "TV" : "MOVIE";
    const [tt, s, e] = req.params.id.split(":");
    const query = encodeURIComponent(tt);
    const result = await fetchTorrent(query);

    let stream_results = await Promise.all(
      result.map((torrent) => {
        return streamFromMagnet(torrent, torrent["Link"], media, s, e);
      })
    );

    // Send response
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");
    return res.send({ streams: stream_results });
  } catch (error) {
    console.error("Error processing request:", error);
    // Send error response
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("The server is working on " + process.env.PORT || 3000);
});
