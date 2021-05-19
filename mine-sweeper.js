import { Tile, Field } from './field.js'
import { Thread, sleep, throwIfAborted, EventQueue } from './threading.js'

class GameOver {
  constructor(won) {
    this.won = won
  }
}

export class MineSweeper extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        canvas {
          border-top: 1px solid #b2b2b2;
          border-left: 1px solid #b2b2b2;
          display: block;
        }
      </style>
    `    
    /** @type {Field} */
    this.field = null
    /** @type {GameState} */
    this._state = 'created'
    this.thread = null
    this.firstAction = false
  }
  isHalted() {
    switch (this.state) {
      case 'lost':
      case 'won':
      case 'idle': return true
      default: return false
    }
  }
  get state() {
    return this._state
  }
  set state(value) {
    if (this._state == value) return
    this._state = value
    this.dispatchEvent(new CustomEvent('minesweeper-state', {
      detail: value,
      bubbles: true,
      composed: true,
    }))
  }
  /**
  @param {number} width
  @param {number} height
  @param {number} mines */
  async startGame(width, height, mines) {
    if (this.state == 'starting') return
    this.state = 'starting'
    await this.thread?.abort().join()
    this.field?.canvas.remove()
    this.field = new Field(width, height, mines)
    this.shadowRoot.append(this.field.canvas)
    this.state = 'running'
    this.thread = new Thread(sig => this.mainloop(sig))
    this.firstAction = false
    this.dispatchFlaggedCount()

  }
  async startMainLoop() {
    if (this.state != 'idle') return
    this.state = 'running'
    this.thread = new Thread(sig => this.mainloop(sig))
    await this.thread.join()
  }
  async halt() {
    if (this.isHalted()) return
    await this.thread.abort().join()
  }
  async startAuto(action) {
    if (this.state != 'idle') return
    this.state = 'running'
    this.thread = new Thread(async sig => {
      let aborted = false
      try {
        await action(sig)
      } catch (err) {
        aborted = err.name == 'AbortError'
        await this.handleGameOver(err)
      } finally {
        if (!this.isHalted()) this.state = 'idle'
        try {
          await interrupter.abort().join(sig)
        } finally {
          return aborted
        }
      }
    })
    let interrupter = new Thread(async sig => {
      let events = this.field.createEventQueue()
      try {
        await events.take(sig)
        await this.thread.abort().join(sig)
      } finally {
        events.destroy()
      }
    })    
    let aborted = await this.thread.join()
    this.dispatchFlaggedCount()    
    return aborted
  }
  async startAutoplay() {
    return await this.startAuto(sig => this.autoplay(sig))
  }
  async startSolver() {
    return await this.startAuto(sig => this.solve(sig))
  }
  /** 
  @private 
  @param {Tile} tile */
  async openTile(tile, sig) {
    let { field } = this
    if (tile.state == 'cleared') return
    let seen = new Set([tile])
    field.updateTile(tile, { state: 'cleared' })
    if (tile.mine) throw new GameOver(false)
    let i = seen.size, j = 0
    for (let tile of seen) {
      if (!sig?.aborted && j++ >= i) {
        i = seen.size
        await field.updated
        try {
          await sleep(30, sig)
        } catch (err) {
          if (err.name != 'AbortError') throw err
          if (this.state == 'starting') throw err
        }
      } 
      if (tile.adjacent != 0) continue
      let newTiles = field
        .adjacentTiles(tile)
        .filter(tile => !seen.has(tile))
      newTiles.forEach(t => seen.add(t))
      field.updateTiles(newTiles, { state: 'cleared' })
    }  
    await field.updated
    throwIfAborted(sig)
  }
  /**
  @private
  @param {Tile[]} tiles */
  blinkingQuestions(tiles) {
    let { field } = this
    return async sig => {
      try {
        while (true) {
          await field.updateTiles(tiles, { state: 'question' })
          await sleep(300, sig)
          await field.updateTiles(tiles, { state: 'default' })
          await sleep(300, sig)
        }
      } finally {
        await field.updateTiles(tiles, { state: 'default' })
      }
    }
  }
  /**
  @private */
  async solve(sig) {
    let { field } = this
    this.dispatchFirstAction()
    let anotherpass = true
    while (anotherpass) {
      anotherpass = false
      for (let tile of field.tiles) {
        if (tile.state != 'cleared' || tile.adjacent == 0) continue
        let atiles = field.adjacentTiles(tile)
        let empty = atiles.filter(t => t.state == 'default')
        let flagged = atiles.filter(t => t.state == 'flagged')
        let dubious = atiles.filter(t => t.state == 'question')
        if (empty.length + dubious.length != 0 && 
          empty.length + flagged.length + dubious.length == tile.adjacent) {
          anotherpass = true
          field.updateTiles(empty, { state: 'flagged' })
          await field.updateTiles(dubious, { state: 'flagged' })
          await sleep(30, sig)
        } else if (empty.length != 0 && dubious.length == 0 && 
          flagged.length == tile.adjacent) {
          anotherpass = true
          for (let tile of empty) {
            await this.openTile(tile, sig)
            if (field.tilesToReveal == 0) {
              throw new GameOver(true)
            }
          }  
          await sleep(30, sig)
        }      
      }
    }
  }
  /** 
  @private 
  @param {Tile} tile
  @param {EventQueue<FieldEvent>} */
  async leftClick(tile, events, sig) {
    let { field } = this
    if (tile.state == 'default') {
      await field.updateTile(tile, { state: 'pushed' })
      let revert = true
      try {
        let e = await events.take(sig)
        if (e.type == 'mouseup' && e.button == 0) {
          revert = false
          await this.openTile(tile, sig)
          if (field.tilesToReveal == 0) throw new GameOver(true)
        }
      } finally {
        if (revert) await field.updateTile(tile, { state: 'default' })
      }
    } else if (tile.state == 'cleared' && tile.adjacent) {
      let atiles = field.adjacentTiles(tile)
      let empty = atiles.filter(t => t.state == 'default')
      let flagged = atiles.filter(t => t.state == 'flagged')
      let dubious = atiles.filter(t => t.state == 'question')
      if (empty.length == 0) {
        // pass
      } else if (dubious.length == 0 && flagged.length == tile.adjacent) {
        await field.updateTiles(empty, { state: 'pushed' })
        let revert = true
        try {
          let e = await events.take(sig)
          if (e.type == 'mouseup' && e.button == 0) {
            revert = false
            for (let tile of empty) {
              await this.openTile(tile, sig)
              if (field.tilesToReveal == 0) throw new GameOver(true)
            }
          }
        } finally {
          if (revert) await field.updateTiles(empty, { state: 'default' })
        }
      } else {
        let blinking = new Thread(this.blinkingQuestions(empty), sig)
        await events.take(sig)  
        await blinking.abort().join(sig)
      }
    }  
  }
  /** 
  @private 
  @param {Tile} tile
  @param {EventQueue<FieldEvent>} */
  async rightClick(tile, events, sig) {
    let { field } = this
    if (tile.state == 'default') {
      await field.updateTile(tile, { state: 'flagged' })
    } else if (tile.state == 'flagged') {
      await field.updateTile(tile, { state: 'question' })
    } else if (tile.state == 'question') {
      await field.updateTile(tile, { state: 'default' })
    } else if (tile.state == 'cleared' && tile.adjacent) {
      let atiles = field.adjacentTiles(tile)
      let empty = atiles.filter(t => t.state == 'default')
      let flagged = atiles.filter(t => t.state == 'flagged')
      let dubious = atiles.filter(t => t.state == 'question')
      if (dubious.length + empty.length + flagged.length == tile.adjacent) {
        field.updateTiles(empty, { state: 'flagged' })
        await field.updateTiles(dubious, { state: 'flagged' })
      } else {
        let blinking = new Thread(this.blinkingQuestions(empty), sig)
        await events.take(sig)
        await blinking.abort().join(sig)
        await field.updated
      }
    }  
  }
  /**
  @returns {Promise<boolean | undefined>} */
  async mainloop(sig) {
    let events = this.field.createEventQueue()
    try {
      if (this.field.tilesToReveal == 0) throw new GameOver(true)
      while (true) {
        let { minesToFlag } = this.field
        let e = await events.take(sig)
        let tile = this.field.getTileAt(e)
        if (!tile) continue
        this.dispatchFirstAction()
        if (e.type == 'mousedown' && e.button == 0) {
          await this.leftClick(tile, events, sig)
        } else if (e.type == 'mousedown' && e.button == 2) {
          await this.rightClick(tile, events, sig)
        }
        if (this.field.minesToFlag != minesToFlag) {
          this.dispatchFlaggedCount()
        }
      }
    } catch (err) {
      await this.handleGameOver(err)
    } finally {
      if (!this.isHalted()) this.state = 'idle'
      events.destroy()
    }
  }  
  async autoplay(sig) {
    let events = new EventQueue()
    while (true) {
      await this.solve(sig)
      this.dispatchFlaggedCount()
      await sleep(300, sig)
      let tiles = this.field.tiles.filter(t => t.state == 'default')
      let tile
      for (let i = 0; i < 100 && tiles.length; i++) {
        let index = Math.random() * tiles.length | 0
        tile = tiles[index]
        let atiles = this.field.adjacentTiles(tile)
        if (atiles.every(t => t.state !== 'cleared')) break
        tiles[index] = tiles[tiles.length - 1]
        tiles.pop()
      }
      let leftClick = new Thread(sig => this.leftClick(tile, events, sig), sig)
      await sleep(200)
      events.put({ x: tile.x, y: tile.y, type: 'mouseup', button: 0 })
      await leftClick.join(sig)
      // await this.openTile(tile, sig)
      await sleep(300, sig)
    }
  }
  async handleGameOver(err) {
    if (!(err instanceof GameOver)) throw err
    await this.field.revealAll()
    this.state = err.won ? 'won' : 'lost'    
  }
  dispatchFlaggedCount() {
    this.dispatchEvent(new CustomEvent('mines-to-flag', {
      detail: this.field.minesToFlag,
      bubbles: true,
      composed: true
    }))    
  }
  dispatchFirstAction() {
    if (this.firstAction) return
    this.firstAction = true
    this.dispatchEvent(new Event('first-action', {
      bubbles: true,
      composed: true
    }))    
  }  
}

customElements.define('mine-sweeper', MineSweeper)
