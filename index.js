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
  "https://embed-fastly.wistia.com/deliveries/faead41b95cc915b54389b98ce40c3de241fac00.m3u8";

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
  const fileSavePromises = [];
  const writeFile = util.promisify(fs.writeFile);

  for (let i = 1; i <= totalSegments; i += 1) {
    const promise = fetch(`${baseURL}/seg-${i}-v1-a1.ts`)
      .then((res) => res.buffer())
      .then((res) =>
        writeFile(
          path.resolve(outputPath, `${String(i).padStart(6, "0")}.ts`),
          res
        )
      )
      .catch(console.error);

    fileSavePromises.push(promise);
  }
  await Promise.all(fileSavePromises);
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
