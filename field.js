import { EventQueue } from './threading.js'
export const SCALE = 30
let tileSheet = new Image()
tileSheet.src = 'data:image/png;base64,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'
await new Promise(r => tileSheet.onload = r)

export class Tile {
  /**
  @param {number} x
  @param {number} y */
  constructor(x, y) {
    this.x = x
    this.y = y
    this.mine = false
    this.adjacent = 0
    /** @type {TileState} */
    this.state = 'default'
  }
  getTileSheetIndex() {
    switch (this.state) {
      case 'pushed': return 1
      case 'detonated': return 2
      case 'wrong': return 3
      case 'question': return 4
      case 'flagged': return 5
      case 'mine': return 6
      case 'cleared': return 7 + this.adjacent
      default: return 0
    }
  }  
  render(ctx) {
    ctx.drawImage(tileSheet, 
      this.getTileSheetIndex() * SCALE, 0,  SCALE, SCALE,
      this.x * SCALE, this.y * SCALE,       SCALE, SCALE
    )
  }   
}

export class Field {
  /** @param {TileMap} tileMap */
  constructor(width, height, mines) {
    this.width = width
    this.height = height
    this.mines = mines
    this.tiles = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.tiles.push(new Tile(x, y))
      }
    }
    let mineTiles = this.tiles.slice()
    for (let i = 0; i < mines; i++) {
      let j = Math.random() * mineTiles.length | 0
      let tile = mineTiles[j]
      mineTiles[j] = mineTiles[mineTiles.length - 1]
      mineTiles.pop()
      tile.mine = true
      for (let atile of this.adjacentTiles(tile)) {
        atile.adjacent += 1
      }      
    }    
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    this.canvas.width = this.width * SCALE
    this.canvas.height = this.height * SCALE    
    for (let tile of this.tiles) {
      tile.render(this.ctx)
    }     
    /** @type {Tile[]} */
    this.pending = []
    /** @type {Promise<void>} */
    this.updated = null
    this.tilesToReveal = this.tiles.length - this.mines
    this.minesToFlag = this.mines
    this.canvas.addEventListener('contextmenu', e => e.preventDefault())
  }
 
  /** @returns {EventQueue<FieldEvent> & { destroy: () => void }} */
  createEventQueue() {
    let { take, put } = new EventQueue()
    let handler = e => {
      let { clientX, clientY, type, button } = e
      let { top, left } = this.canvas.getBoundingClientRect()
      let x = Math.floor((clientX - left) / SCALE)
      let y = Math.floor((clientY - top) / SCALE)
      put({ x, y, type, button })
    }      
    let destroy = () => {
      this.canvas.removeEventListener('mousedown', handler)
      this.canvas.removeEventListener('mouseup', handler)     
    }      
    this.canvas.addEventListener('mousedown', handler)
    this.canvas.addEventListener('mouseup', handler)     
    return { take, put, destroy }
  }

  revealAll() {
    for (let tile of this.tiles) {
      if (tile.mine) {
        if (tile.state == 'cleared') {
          this.updateTile(tile, { state: 'detonated' })
        } else if (tile.state != 'flagged') {
          this.updateTile(tile, { state: 'mine' })
        }
      } else {
        if (tile.state === 'flagged') {
          this.updateTile(tile, { state: 'wrong' })
        }
      }
    }
    return this.updated
  }
  /**
  @param {Iterable<Tile>} tiles
  @param {Partial<Tile>} props */
  updateTiles(tiles, props) {  
    for (let tile of tiles) {
      this.updateTile(tile, props)
    }
    return this.updated
  }
  /**
  @param {Tile} tile
  @param {Partial<Tile>} props */
  updateTile(tile, props) {
    let cleared = tile.state === 'cleared'
    let flagged = tile.state === 'flagged'
    Object.assign(tile, props)
    if (cleared !== (tile.state === 'cleared')) {
      this.tilesToReveal += cleared ? 1 : -1
    }
    if (flagged !== (tile.state === 'flagged')) {
      this.minesToFlag += flagged ? 1 : -1
    }
    this.pending.push(tile)
    if (!this.updated) {
      this.updated = Promise.resolve().then(() => {
        this.updated = null
        while (this.pending.length) {
          this.pending.pop().render(this.ctx)
        }
      })
    }
    return this.updated
  }
  /** 
  @param {object} a
  @param {number} a.x
  @param {number} a.y */  
  adjacentTiles({ x, y }) {
    let ret = []
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (oy == 0 && ox == 0) continue
        let rx = x + ox, ry = y + oy
        if (rx < 0 || ry < 0) continue
        if (rx >= this.width || ry >= this.height) continue
        ret.push(this.tiles[ry * this.width + rx])
      }
    }
    return ret    
  }
  /** 
  @param {object} a
  @param {number} a.x
  @param {number} a.y */
  getTileAt({ x, y }) {
    return this.tiles[y * this.width + x]
  }  
}
