/* eslint-disable */
const fs = require("fs");
const path = require("path");
const util = require("util");
const glob = require("glob");
const fetch = require("node-fetch");
const childProcess = require("child_process");
const videoStitch = require("video-stitch");

const outputPath = path.resolve(__dirname, ".temp");
const totalSegments = parseInt(process.argv[2], 10) || 10;
const baseURL =
  "https://embed-fastly.wistia.com/deliveries/308d5b4a0ef2fd0b0ec28df64f8372c9b43d335d.m3u8";

(async () => {
  try {
    removeFile(outputPath);
    fs.mkdirSync(outputPath);

    await downloadFiles();
    console.log("video segments finished downloading");

    await convertFiles();
    console.log("video segments were converted to mp4");

    await concatAllFiles();
    console.log("video converted");

    removeFile(outputPath);
  } catch (err) {
    console.error(err.message);
  }
})();

function removeFile(fileName) {
  if (fs.existsSync(fileName)) {
    const rmCommand = process.platform === "win32" ? "rmdir /S /Q" : "rm -Rf";
    childProcess.execSync(`${rmCommand} ${fileName}`);
  }
}

async function downloadFiles() {
  const writeFile = util.promisify(fs.writeFile);

  const maxFetchIndex = totalSegments;
  const maxStackSize = 50;
  let fetchIndex = 1;
  let stackSize = 0;
  let abort = false;

  return new Promise((resolve, reject) => {
    function fetchFile() {
      while (
        fetchIndex <= maxFetchIndex &&
        stackSize < maxStackSize &&
        !abort
      ) {
        const id = fetchIndex;

        fetch(`${baseURL}/seg-${id}-v1-a1.ts`)
          .then((res) => res.buffer())
          .then((res) =>
            writeFile(
              path.resolve(outputPath, `${String(id).padStart(6, "0")}.ts`),
              res
            )
          )
          .then(() => {
            stackSize--;
            fetchFile();
          })
          .catch((err) => {
            abort = true;
            console.error(err.message);
          });

        fetchIndex++;
        stackSize++;
      }

      if ((abort || fetchIndex > maxFetchIndex) && stackSize <= 2) resolve();
    }

    fetchFile();
  });
}

async function convertFiles() {
  const convertionPromises = [];
  const execAsync = util.promisify(childProcess.exec);
  const videos = glob.sync(`${outputPath}/*.ts`).map((e) => path.resolve(e));

  videos.map((video) => {
    const promise = execAsync(
      `ffmpeg -i ${video} -vcodec copy -acodec copy ${video.replace(
        /\.ts/i,
        ".mp4"
      )}`
    ).catch((err) => console.error(err.message));

    convertionPromises.push(promise);
  });

  await Promise.all(convertionPromises);
}

async function concatAllFiles() {
  const videos = glob
    .sync(`${outputPath}/*.mp4`)
    .map((e) => ({ fileName: path.resolve(e) }));

  await videoStitch
    .concat({ silent: true, overwrite: true })
    .clips(videos)
    .output(path.resolve(__dirname, `video-${Date.now()}.mp4`))
    .concat();
}
