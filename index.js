const express = require("express");
const app = express();
const fetch = require("node-fetch");
const parseTorrent = require("parse-torrent");

const type_ = {
  MOVIE: "movie",
  TV: "series",
};

const toStream = (parsed, tor, type, s, e) => {
  // ... same toStream function implementation as in the original code ...
};

const streamFromMagnet = (tor, uri, type, s, e) => {
  // ... same streamFromMagnet function implementation as in the original code ...
};

let stream_results = [];
let torrent_results = [];

const makeAPIRequest = async (host, port, apiKey, query) => {
  const url = `${host}:${port}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${encodeURIComponent(query)}&_=${Date.now()}`;

  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      throw new Error("API request failed");
    }
  } catch (error) {
    console.error("Error making API request:", error.message);
    return null;
  }
};

const host = "http://100.40.225.234";
const port = 9117;
const apiKey = "fql6lmpnr2xnw2om8s7arfcmkpd2jinw";
const query = "Avatar: The Way of Water";

makeAPIRequest(host, port, apiKey, query)
  .then((data) => {
    if (data) {
      torrent_results = data.Results.map((result) => {
        return {
          Tracker: result.Tracker,
          Category: result.CategoryDesc,
          Title: result.Title,
          Seeders: result.Seeders,
          Peers: result.Peers,
          Link: result.Link,
        };
      });

      console.log("Torrent results:", torrent_results);
    }
  })
  .catch((error) => {
    console.error("Error:", error.message);
  });

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
    catalogs: [],
  };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  return res.send(json);
});

app.get("/stream/:type/:id", async (req, res) => {
  const media = req.params.type === "series" ? "TV" : "MOVIE";
  const [tt, s, e] = req.params.id.split(":");
  const query = encodeURIComponent(tt);
  const result = await makeAPIRequest(host, port, apiKey, query);

  if (result) {
    stream_results = await Promise.all(
      result.Results.map((torrent) => {
        return streamFromMagnet(torrent, torrent.Link, media, s, e);
      })
    );

    console.log("Stream results:", stream_results);
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");

  return res.send({ streams: stream_results });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("The server is working on " + (process.env.PORT || 3000));
});
