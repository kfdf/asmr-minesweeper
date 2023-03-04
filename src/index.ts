import { MineSweeper, StateChangedEvent } from './mine-sweeper'
import * as ff from './fibers-futures'
ff.unhandledErrors.add(console.warn)
setInterval(() => console.log(ff.pendingFutures), 10000)
// import { StopWatch } from './stopwatch.js'
// import { abortable, sleep, Thread } from './threading.js'


let width = 20, height = 10, mines = 30
// /** @type {MineSweeper} */
let minesweeper = new MineSweeper(
  document.querySelector('#mine-sweeper > canvas')!,
  width, height, mines
) 

let restartButton = document.querySelector('#restart')!
let helperButton = document.querySelector('#helper')!
let autoplayButton = document.querySelector('#autoplay')!
let startButton = document.querySelector('#start') as HTMLButtonElement
let menuBar = document.querySelector('#menu-bar')!
let optionsPanel = document.querySelector('#options-panel') as HTMLElement
let widthInput = optionsPanel.querySelector('#width-input') as HTMLInputElement
let heightInput = optionsPanel.querySelector('#height-input') as HTMLInputElement
let minesInput = optionsPanel.querySelector('#mines-input') as HTMLInputElement
let mineDensity = optionsPanel.querySelector('#mine-density') as HTMLElement
let optionsWrapper = document.querySelector('#options-wrapper')!
let minesToFlag = document.querySelector('#flag-count')!
let stopwatchDisplay = document.querySelector('#stopwatch')!

ff.fiber(function*() {
  let e: Set<StateChangedEvent> | null = null
  while (true) {
    if (!e || e.has('mines')) {
      minesToFlag.textContent = String(minesweeper.minesToFlag)
    }
    if (!e || e.has('result')) {
      menuBar.classList.toggle('won', minesweeper.result == 'won')
      menuBar.classList.toggle('lost', minesweeper.result == 'lost')
    }
    if (!e || e.has('mode')) {
      autoplayButton.classList.toggle('open', minesweeper.mode == 'auto')
      helperButton.classList.toggle('open', minesweeper.mode == 'help')
    }
    e = yield* ff.once(minesweeper.stateChanged)
  }
})
let stopwatch = new ff.Evictor(function*() {
  let count = 0
  let start = Date.now()
  try {
    while (true) {
      stopwatchDisplay.textContent = String(count)
      count++
      yield ff.sleep(start + count * 1000 - Date.now())
    }
  } catch {
    stopwatchDisplay.textContent = '0'
  }
})
function stopwatchReset() {
  if (stopwatch.running) {
    stopwatch.fiber.result.settle('rejected')
  }
}
ff.subscribe(minesweeper.firstAction, () => {
  stopwatch.start()
})
ff.subscribe(minesweeper.stateChanged, e => {
  if (e.has('result') && minesweeper.result != 'pending') {
    stopwatch.abort()
  }
})
restartButton.addEventListener('mousedown', e => {
  optionsWrapper.classList.toggle('open')
  restartButton.classList.toggle('open')
})
ff.fiber(function*() {
  widthInput.value = '20'
  heightInput.value = '10'
  minesInput.value = '30'
  while (true) {
    yield* ff.once(restartButton, 'mousedown')
    yield ff.sleep(0)
    optionsWrapper.classList.add('open')
    restartButton.classList.add('open')
    while (true) {
      let width = Number.parseInt(widthInput.value)
      let height = Number.parseInt(heightInput.value)
      let mines = Number.parseInt(minesInput.value)
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
      let result = yield* ff.any(
        ff.once(optionsPanel, 'input').then(() => null),
        ff.once(startButton, 'mousedown').then(() => true),
        ff.once(document.body, 'mousedown', e => (
          !optionsPanel.contains(e.target as any)
        )).then(() => false)
      )
      if (result == null) continue
      optionsWrapper.classList.remove('open')
      restartButton.classList.remove('open')
      if (result) {
        minesweeper.restart(width, height, mines)
        stopwatchReset()
      }
      break
    }
  }
})
ff.subscribe(helperButton, 'mousedown', () => {
  minesweeper.switchMode(minesweeper.mode == 'help' ? 'play' : 'help')
})
ff.subscribe(autoplayButton, 'mousedown', () => {
  minesweeper.switchMode(minesweeper.mode == 'auto' ? 'play' : 'auto')
})
