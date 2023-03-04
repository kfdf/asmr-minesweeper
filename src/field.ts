import * as ff from './fibers-futures'
import { BatchEmitter } from './emitters'
export const SCALE = 30
let tileSheet = new Image()
tileSheet.src = 'data:image/png;base64,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'
await ff.once(tileSheet, 'load')
export type TileState = 'default' | 'pushed' | 
  'detonated' | 'wrong' | 'question' | 
  'flagged'   | 'mine'  | 'cleared'

export interface FieldEvent {
  x: number
  y: number
  type: 'mouseup' | 'mousedown'
  button: 0 | 1 | 2
}  
export class Field {
  get tilesToReveal() { return this.#tilesToReveal }
  get minesToFlag() { return this.#minesToFlag }
  get size() { return this.#tiles.length }
  #width: number
  #height: number
  #mines: number
  #tiles!: number[]
  #states!: TileState[]
  #tilesToReveal!: number
  #minesToFlag!: number
  #canvas: HTMLCanvasElement
  #updatedTiles: Set<number>
  #subs: ff.Future<never>
  readonly mouseEvents: ff.Emitter<FieldEvent>
  readonly stateChanged: BatchEmitter<'mines'>
  constructor(
    canvas: HTMLCanvasElement,
    width: number, height: number, mines: number
  ) {
    this.#width = width
    this.#height = height
    this.#mines = mines
    this.#canvas = canvas
    this.stateChanged = new BatchEmitter()
    this.mouseEvents = new ff.Emitter()
    let mouseEventHandler = (e: MouseEvent) => {
      let { clientX, clientY, type, button } = e
      let { top, left } = this.#canvas.getBoundingClientRect()
      let x = Math.floor((clientX - left) / SCALE)
      let y = Math.floor((clientY - top) / SCALE)
      this.mouseEvents.emit({ x, y, type, button } as any)
    }   
    this.#subs = ff.any(
      ff.subscribe(this.#canvas, 'contextmenu', e => e.preventDefault()),
      ff.subscribe(this.#canvas, 'mousedown', mouseEventHandler),
      ff.subscribe(this.#canvas, 'mouseup', mouseEventHandler)
    )
    this.#updatedTiles = new Set()
    this.reset()
  }
  resize(width: number, height: number, mines: number) {
    this.#width = width
    this.#height = height
    this.#mines = mines
    this.reset()
  }
  reset() {
    this.#tiles = new Array(this.#width * this.#height).fill(0)
    this.#states = new Array(this.#width * this.#height).fill('default')
    let tileIndexes = this.#tiles.map((_, i) => i)
    for (let i = 0; i < this.#mines; i++) {
      let j = Math.random() * tileIndexes.length | 0
      let idx = tileIndexes[j]
      tileIndexes[j] = tileIndexes.at(-1)!
      tileIndexes.pop()
      this.#tiles[idx] = -100
      for (let aidx of this.getAdjacentTileIndexes(idx)) {
        this.#tiles[aidx] += 1
      }      
    }    
    this.#canvas.width = this.#width * SCALE
    this.#canvas.height = this.#height * SCALE
    let ctx = this.#canvas.getContext('2d')!
    for (let i = 0; i < this.#tiles.length; i++) {
      this.#render(i, ctx)
    }
    this.#tilesToReveal = this.#tiles.length - this.#mines
    this.#minesToFlag = this.#mines
    this.stateChanged.push('mines')
  }
  dispose() {
    this.#subs.cancel()
    this.#pendingUpdates.cancel()
    this.stateChanged.reset()
    this.#tiles = undefined as any
    this.#states = undefined as any
  }
  getMines(tileIndex: number) {
    return this.#tiles[tileIndex]
  }
  getTile(tileIndex: number) {
    return this.#states[tileIndex]
  }
  setTile(tileIndex: number, state: TileState) {
    let prevState = this.#states[tileIndex]
    if (prevState === state) return
    this.#states[tileIndex] = state
    this.tileUpdated(tileIndex, prevState)
  }
  setTiles(tileIndexes: number[], state: TileState) {
    for (let tileIndex of tileIndexes) {
      this.setTile(tileIndex, state)
    }
  }  
  revealAll() {
    for (let i = 0; i < this.#tiles.length; i++) {
      if (this.getMines(i) < 0) {
        if (this.getTile(i) == 'cleared') {
          this.setTile(i, 'detonated')
        } else if (this.getTile(i) != 'flagged') {
          this.setTile(i, 'mine')
        }
      } else {
        if (this.getTile(i) == 'flagged') {
          this.setTile(i, 'wrong')
        }
      }
    }
  }
  #pendingUpdates = ff.settled('resolved')
  tileUpdated(tileIndex: number, prevState: TileState) {
    let cleared = this.getTile(tileIndex) === 'cleared'
    let flagged = this.getTile(tileIndex) === 'flagged'
    if (cleared !== (prevState === 'cleared')) {
      this.#tilesToReveal += cleared ? -1 : 1
    }
    if (flagged !== (prevState === 'flagged')) {
      this.#minesToFlag += flagged ? -1 : 1
      this.stateChanged.push('mines')
    }
    if (!this.#pendingUpdates.pending) {
      this.#pendingUpdates = ff.sleep('micro').then(() => {
        let ctx = this.#canvas.getContext('2d')!
        for (let idx of this.#updatedTiles) {
          this.#render(idx, ctx)
        }
        this.#updatedTiles.clear()
      })
    }
    this.#updatedTiles.add(tileIndex)
  }
  getAdjacentTileIndexes(tileIndex: number) {
    let ret = []
    let y = tileIndex / this.#width | 0
    let x = tileIndex % this.#width
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (oy == 0 && ox == 0) continue
        let rx = x + ox, ry = y + oy
        if (rx < 0 || ry < 0) continue
        if (rx >= this.#width || ry >= this.#height) continue
        ret.push(this.getTileIndex(rx, ry))
      }
    }
    return ret    
  }
  getTileIndex(x: number, y: number) {
    return this.#width * y + x
  }  
  #getTileSheetIndex(tileIndex: number) {
    switch (this.getTile(tileIndex)) {
      case 'pushed': return 1
      case 'detonated': return 2
      case 'wrong': return 3
      case 'question': return 4
      case 'flagged': return 5
      case 'mine': return 6
      case 'cleared': return 7 + this.getMines(tileIndex)
      default: return 0
    }
  }
  #render(tileIndex: number, ctx: CanvasRenderingContext2D) {
    let sx = SCALE * this.#getTileSheetIndex(tileIndex)
    let dy = SCALE * (tileIndex / this.#width | 0)
    let dx = SCALE * (tileIndex % this.#width)
    ctx.drawImage(tileSheet, sx, 0, SCALE, SCALE, dx, dy, SCALE, SCALE)
  }   
}
