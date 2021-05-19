import { MineSweeper } from './mine-sweeper.js'
import { StopWatch } from './stopwatch.js'
import { abortable, sleep, Thread } from './threading.js'

let width = 20, height = 10, mines = 30
/** @type {MineSweeper} */
let minesweeper = document.querySelector('mine-sweeper')
let restartButton = document.querySelector('#restart')
let helperButton = document.querySelector('#helper')
let autoplayButton = document.querySelector('#autoplay')
let startButton = document.querySelector('#start')
let menuBar = document.querySelector('#menu-bar')
let optionsPanel = document.querySelector('#options-panel')
let widthInput = optionsPanel.querySelector('#width-input')
let heightInput = optionsPanel.querySelector('#height-input')
let minesInput = optionsPanel.querySelector('#mines-input')
let mineDensity = optionsPanel.querySelector('#mine-density')
let optionsWrapper = document.querySelector('#options-wrapper')
let flagCount = document.querySelector('#flag-count')
let stopwatchDisplay = document.querySelector('#stopwatch')
let stopwatch = new StopWatch()
restartButton.addEventListener('click', e => {
  optionsWrapper.classList.toggle('open')
  restartButton.classList.toggle('open')
})
function asInt(str) {
  if (!/^\d{1,6}$/.test(str)) return NaN
  return parseInt(str, 10)
}
function handleInput() {
  let width = asInt(widthInput.value)
  let height = asInt(heightInput.value)
  let mines = asInt(minesInput.value)
  startButton.disabled = false
  if (isNaN(width) || width < 1 || width > 300) {
    widthInput.classList.add('error')
    startButton.disabled = true
  } else {
    widthInput.classList.remove('error')
  }
  if (isNaN(height) || height < 1 || height > 300) {
    heightInput.classList.add('error')
    startButton.disabled = true
  } else {
    heightInput.classList.remove('error')
  }
  if (isNaN(mines) || mines < 1 || mines > width * height) {
    minesInput.classList.add('error')
    startButton.disabled = true
  } else {
    minesInput.classList.remove('error')
  }  
  mineDensity.textContent = (width * height / mines).toFixed(1)
}
optionsPanel.addEventListener('input', handleInput)
widthInput.value = width
heightInput.value = height
minesInput.value = mines
handleInput()

let currTask = new Thread(() => { })
startButton.addEventListener('click', e => {
  let prevTask = currTask
  currTask = new Thread(async () => {
    await prevTask.abort().join()
    width = asInt(widthInput.value)
    height = asInt(heightInput.value)
    mines = asInt(minesInput.value)
    optionsWrapper.classList.remove('open')  
    restartButton.classList.remove('open')  
    minesweeper.startGame(width, height, mines)
  })
})

helperButton.addEventListener('click', e => {
  let open = helperButton.classList.contains('open')
  let prevTask = currTask
  currTask = new Thread(async sig => {
    try {
      helperButton.classList.add('open')
      await prevTask.abort().join()
      await abortable(minesweeper.halt(), sig)
      if (!open) await abortable(minesweeper.startSolver(), sig)
      minesweeper.startMainLoop()
    } finally {
      helperButton.classList.remove('open')
    }
  })
})
autoplayButton.addEventListener('click', e => {
  let open = autoplayButton.classList.contains('open')
  let prevTask = currTask
  currTask = new Thread(async sig => {
    try {
      await prevTask.abort().join()
      if (!open) {
        autoplayButton.classList.add('open')
        let w = width
        let h = height
        let m = mines
        let sleepTime = Math.min(1000, Math.log(w * h) * 300)
        while (true) {
          await abortable(minesweeper.halt(), sig)
          let aborted = await abortable(minesweeper.startAutoplay(), sig)
          if (aborted) break
          await sleep(sleepTime, sig)
          await abortable(minesweeper.startGame(w, h, m), sig)
        }
        minesweeper.startMainLoop()
      } else {
        await abortable(minesweeper.halt(), sig)
        minesweeper.startMainLoop()
      }
    } finally {
      autoplayButton.classList.remove('open')
    }
  })
})
document.addEventListener('first-action', e => {
  stopwatch.start()
})
document.addEventListener('minesweeper-state', e => {
 
  if (e.detail == 'starting') {
    menuBar.classList.remove('won')
    menuBar.classList.remove('lost')
    stopwatch.stop()
    stopwatch.reset()
  }

  if (e.detail == 'won' || e.detail == 'lost') {
    menuBar.classList.add(e.detail)
    stopwatch.stop()
  }
})
stopwatch.addEventListener('tick', e => {
  stopwatchDisplay.textContent = e.detail
})

document.addEventListener('mines-to-flag', e => {
  flagCount.textContent = e.detail
})

minesweeper.startGame(width, height, mines)
