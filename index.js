#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const util = require('util')
const glob = require('glob')
const fetch = require('node-fetch')
const childProcess = require('child_process')
const videoStitch = require('video-stitch')
const chalk = require('chalk')
const inquirer = require('inquirer')
const ProgressCli = require('cli-progress')
const colors = require('colors')
const SpinnerCli = require('cli-spinner')

const videos = require('./videos')
const outputPath = path.resolve('./.temp')

async function main() {
  try {
    console.log(chalk.yellow('\n\t\t\tNext Level Week 2\n'))
    const options = await getVideoOptions()

    removeFile(outputPath)
    fs.mkdirSync(outputPath)

    await downloadFiles(options)
    await concatAllFiles(options)

    removeFile(outputPath)
    console.log(chalk.green.bold(`\n\n${options.title}`) + chalk.white(' baixada com sucesso'))
  } catch (err) {
    console.error(chalk.red(err.message))
  }
}
main()

async function getVideoOptions() {
  try {
    const videoTitle = await inquirer.prompt([
      {
        type: 'list',
        name: 'title',
        message: 'Escolha uma aula',
        choices: videos.map((v) => v.title),
      },
    ])
    const chosenVideo = videos.find((v) => videoTitle.title === v.title)

    const videoResolution = await inquirer.prompt({
      type: 'list',
      name: 'resolution',
      message: 'Escolha a resolução',
      choices: chosenVideo.resolutions.map((r) => r.resolution).reverse(),
    })
    const chosenResolution = chosenVideo.resolutions.find(
      (v) => v.resolution === videoResolution.resolution
    )

    const options = {
      title: chosenVideo.title,
      saveName: chosenVideo.saveName,
      segments: chosenVideo.segments,
      resolution: chosenResolution.resolution,
      url: chosenResolution.url,
    }

    return options
  } catch (err) {
    console.error(chalk.red(err.message))
  }
}

function removeFile(fileName) {
  if (fs.existsSync(fileName)) {
    const rmCommand = process.platform === 'win32' ? 'rmdir /S /Q' : 'rm -Rf'
    childProcess.execSync(`${rmCommand} ${fileName}`)
  }
}

async function downloadFiles(options) {
  const writeFile = util.promisify(fs.writeFile)
  const execAsync = util.promisify(childProcess.exec)

  console.log('')

  const progress = new ProgressCli.SingleBar({
    format: `Baixando ${colors.green('{bar}')} {percentage}% | {value}/{total} chunks`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  })
  progress.start(options.segments, 0)

  const maxFetchIndex = options.segments
  const maxStackSize = 50
  let fetchIndex = 1
  let stackSize = 0
  let done = false

  return new Promise((resolve, reject) => {
    function fetchFile(videoId = 0, retryCount = 0) {
      while (fetchIndex <= maxFetchIndex && stackSize < maxStackSize) {
        const id = videoId || fetchIndex
        const writePathTs = path.resolve(outputPath, `${String(id).padStart(6, '0')}.ts`)
        const writePathMP4 = path.resolve(outputPath, `${String(id).padStart(6, '0')}.mp4`)

        fetch(`${options.url}/seg-${id}-v1-a1.ts`)
          .then((res) => res.buffer())
          .then((res) => writeFile(writePathTs, res))
          .then(() =>
            execAsync(`ffmpeg -i ${writePathTs} -vcodec copy -acodec copy ${writePathMP4}`)
          )
          .then(() => {
            stackSize--
            progress.increment()
            fetchFile()
          })
          .catch((err) => {
            fetchFile(id, retryCount + 1)
            if (retryCount >= 3) {
              console.error(chalk.red(err.message))
              process.exit()
            }
          })

        fetchIndex++
        stackSize++
      }

      if (fetchIndex > maxFetchIndex && stackSize <= 5 && !done) {
        setTimeout(() => {
          progress.stop()
          resolve()
        }, 1000)
        done = true
      }
    }

    fetchFile()
  })
}

async function concatAllFiles(options) {
  try {
    console.log('')

    const videos = glob.sync(`${outputPath}/*.mp4`).map((e) => ({ fileName: path.resolve(e) }))
    const spinner = new SpinnerCli.Spinner('Montando o arquivo MP4 %s')
    spinner.start()

    await videoStitch
      .concat({ silent: true, overwrite: true })
      .clips(videos)
      .output(path.resolve(`./${options.saveName}(${options.resolution}).mp4`))
      .concat()

    spinner.stop()
  } catch (err) {
    console.log(chalk.red(err.message))
  }
}
