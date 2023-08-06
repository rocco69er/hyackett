require("dotenv").config();
const parseTorrent = require("parse-torrent");
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const cors = require("cors");

const type_ = {
  MOVIE: "movie",
  TV: "series",
};

const toStream = (parsed, tor, type, s, e) => {
  const infoHash = parsed.infoHash.toLowerCase();
  let title = tor.extraTag || parsed.name;
  let index = -1;
  if (type === "series") {
    index = (parsed.files ?? []).findIndex((element) => {
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
    sources: (parsed.announce || []).map((x) => {
      return "tracker:" + x;
    }).concat(["dht:" + infoHash]),
    title: title,
  };
};

const streamFromMagnet = (tor, uri, type, s, e) => {
  return new Promise((resolve, reject) => {
    if (uri && uri.startsWith("magnet:?")) { // Add a check for uri to avoid errors
      resolve(toStream(parseTorrent(uri), tor, type, s, e));
    } else {
      resolve(false); // Handle the case when uri is null or not starting with "magnet:?"
    }
  });
};


let stream_results = [];
let torrent_results = [];

let host = "http://100.40.225.234:9117";
let apiKey = "fql6lmpnr2xnw2om8s7arfcmkpd2jinw";

let fetchTorrent = async (query) => {
  let url = `${host}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${query}&_=1691241987837`;
  return await fetch(url, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "x-requested-with": "XMLHttpRequest",
    },
    referrerPolicy: "no-referrer",
    method: "GET",
  })
    .then((res) => res.json())
    .then(async (results) => {
      if (results["Results"].length != 0) {
        torrent_results = await Promise.all(
          results["Results"].map((result) => {
            return new Promise((resolve, reject) => {
              resolve({
                Tracker: result["Tracker"],
                Category: result["CategoryDesc"],
                Title: result["Title"],
                Seeders: result["Seeders"],
                Peers: result["Peers"],
                Link: result["Link"],
              });
            });
          })
        );
        return torrent_results;
      } else {
        return [];
      }
    });
};

function getMeta(id, type) {
  var [tt, s, e] = id.split(":");
  return fetch(`https://v2.sg.media-imdb.com/suggestion/t/${tt}.json`)
    .then((res) => res.json())
    .then((json) => json.d[0])
    .then(({ l, y }) => ({ name: l, year: y }))
    .catch((err) =>
      fetch(`https://v3-cinemeta.strem.io/meta/${type}/${tt}.json`)
        .then((res) => res.json())
        .then((json) => json.meta)
    );
}

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/manifest.json", (req, res) => {
  var json = {
    id: "mikmc.od.org+++",
    version: "3.0.0",
    name: "Hackett",
    description: "Torrent results from Jackett Indexers",
    icon:
      "https://raw.githubusercontent.com/mikmc55/stremio-jackett/main/hy.jpg",
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
  const media = req.params.type;
  let id = req.params.id;
  id = id.replace(".json", "");

  let [tt, s, e] = id.split(":");
  let query = "";
  let meta = await getMeta(tt, media);

  query = meta?.name;

  if (media === "movie") {
    query += " " + meta?.year;
  } else if (media === "series") {
    query += " S" + (s ?? "1").padStart(2, "0");
  }

  query = encodeURIComponent(query);

  let result = await fetchTorrent(query);

  let stream_results = await Promise.all(
    result.map((torrent) => {
      return streamFromMagnet(torrent, torrent["Link"], media, s, e);
    })
  );

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");

  return res.send({ streams: stream_results });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("The server is working on " + (process.env.PORT || 3000));
});
