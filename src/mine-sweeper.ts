import { Field, FieldEvent } from './field'
import { BatchEmitter, Signal } from './emitters'
import * as ff from './fibers-futures'

type Mode = 'play' | 'help' | 'auto'
export type StateChangedEvent = 'result' | 'mode' | 'mines'
export class MineSweeper {
  #field: Field
  readonly stateChanged: BatchEmitter<StateChangedEvent>
  readonly firstAction: Signal
  #result: 'pending' | 'won' | 'lost'
  #mode: Mode
  #loop: ff.Evictor
  constructor(canvas: HTMLCanvasElement, width: number, height: number, mines: number) {
    this.stateChanged = new BatchEmitter()
    this.firstAction = new Signal()
    this.#field = new Field(canvas, width, height, mines)
    this.#field.stateChanged.add(this.stateChanged.emit)
    this.#result = 'pending'
    this.#mode = 'play'
    this.#loop = new ff.Evictor(() => this.#mainGen())
    this.#loop.start()
  }
  get minesToFlag() { return this.#field.minesToFlag }
  get result() { return this.#result }
  private set result(value) {
    if (this.#result == value) return
    this.#result = value
    this.stateChanged.push('result')
  }
  get mode() { return this.#mode }
  private set mode(value) {
    if (this.#mode == value) return
    this.#mode = value
    this.stateChanged.push('mode')

  }
  dispose() {
    this.#loop.abort()
    this.#field.dispose()
  }
  restart(width: number, height: number, mines: number) {
    this.#loop.abort()
    this.#field.resize(width, height, mines)
    this.mode = 'play'
    this.#loop.start() 
  }
  #modeCommands = new ff.Emitter<Mode>()
  switchMode(mode: Mode) {
    if (this.result == 'pending') {
      this.#modeCommands.emit(mode)
    } else {
      this.#loop.abort()
      this.#field.reset()
      this.mode = 'auto'
      this.#loop.start() 
    }
  }
  * #mainGen() {
    try {
      this.result = 'pending'
      this.firstAction.reset()
      while (true) {
        if (this.mode == 'help') {
          this.mode = yield* ff.any(
            ff.once(this.#modeCommands, c => c != 'help'),
            ff.once(this.#field.mouseEvents).then(() => 'play' as const),
            ff.fiber(this.#solverGen()).then(() => 'play' as const)
          )
        } else if (this.mode == 'auto') {
          this.mode = yield* ff.any(
            ff.once(this.#modeCommands, c => c != 'auto'),
            ff.once(this.#field.mouseEvents).then(() => 'play' as const),
            ff.fiber(function*(that) {
              while (true) {
                try {
                  that.firstAction.reset()
                  yield* that.#autoplayGen()
                } catch (err) {
                  that.#field.revealAll()
                  that.result = err as any
                  yield ff.sleep(2000)
                  that.#field.reset()
                  that.result = 'pending'
                }
              }
            }(this))
          )
          if (this.result != 'pending') return
        } else if (this.mode == 'play') {
          this.mode = yield* ff.any(
            ff.once(this.#modeCommands, c => c != 'play'),
            ff.fiber(this.#gameGen())
          )
        }
      }
    } catch (err) {
      this.#field.revealAll()
      this.result = err as any
    }
  }
  * #openTileGen(ti: number) {
    let f = this.#field
    if (f.getTile(ti) == 'cleared') return
    let seen = new Set<number>().add(ti)
    f.setTile(ti, 'cleared')
    if (f.getMines(ti) < 0) throw 'lost'
    let waveSize = seen.size, i = 0
    let abortRequested = false
    for (let ti of seen) {
      if (!abortRequested && i++ >= waveSize) {
        waveSize = seen.size
        try {
          try {
            abortRequested = true
            yield ff.sleep(30)
            abortRequested = false
          } finally {
            if (abortRequested) throw null
          }
        } catch { }
      } 
      if (f.getMines(ti) > 0) continue
      f.getAdjacentTileIndexes(ti).forEach(ti => {
        f.setTile(ti, 'cleared')
        seen.add(ti)
      })
    }
    if (abortRequested) yield null
  }
  * #blinkingQuestionsGen(tileIndexes: number[]) {
    let f = this.#field
    try {
      while (true) {
        f.setTiles(tileIndexes, 'question')
        yield ff.sleep(300)
        f.setTiles(tileIndexes, 'default')
        yield ff.sleep(300)
      }
    } finally {
      f.setTiles(tileIndexes, 'default')
    }
  }
  * #solverGen() {
    this.firstAction.set()
    let f = this.#field
    let anotherpass = true
    while (anotherpass) {
      anotherpass = false
      for (let ti = 0; ti < f.size; ti++) {
        if (f.getTile(ti) != 'cleared') continue
        if (f.getMines(ti) == 0) continue
        let { empty, flagged, dubious } = this.#getAdjacentTiles(ti)
        if (
          empty.length + dubious.length != 0 && 
          empty.length + dubious.length + flagged.length == f.getMines(ti)
        ) {
          anotherpass = true
          f.setTiles(empty, 'flagged')
          f.setTiles(dubious, 'flagged')
          yield ff.sleep(30)
        } else if (
          empty.length != 0 && 
          dubious.length == 0 && 
          flagged.length == f.getMines(ti)
        ) {
          anotherpass = true
          for (let ti of empty) {
            yield* this.#openTileGen(ti)
            if (f.tilesToReveal == 0) throw 'won'
          }  
          yield ff.sleep(30)
        }      
      }
    }
  }
  * #leftClickGen(ti: number) {
    let f = this.#field
    if (f.getTile(ti) == 'default') {
      f.setTile(ti, 'pushed')
      let e: FieldEvent
      try {
        e = yield ff.once(f.mouseEvents)
      } finally {
        f.setTile(ti, 'default')
      }
      if (e.type == 'mouseup' && e.button == 0) {
        yield* this.#openTileGen(ti)
        if (f.tilesToReveal == 0) throw 'won'
      }
    } else if (f.getTile(ti) == 'cleared' && f.getMines(ti) > 0) {
      let { empty, flagged, dubious } = this.#getAdjacentTiles(ti)
      if (empty.length == 0) {
        // pass
      } else if (dubious.length == 0 && flagged.length == f.getMines(ti)) {
        f.setTiles(empty, 'pushed')
        let e: FieldEvent
        try {
          e = yield ff.once(f.mouseEvents)
        } finally {
          f.setTiles(empty, 'default')
        }
        if (e.type == 'mouseup' && e.button == 0) {
          for (let tile of empty) {
            yield* this.#openTileGen(tile)
            if (f.tilesToReveal == 0) throw 'won'
          }
        }
      } else {
        yield ff.any(
          ff.once(f.mouseEvents),
          ff.fiber(this.#blinkingQuestionsGen(empty))
        )
      }
    }  
  }
  * #rightClickGen(ti: number) {
    let f = this.#field
    if (f.getTile(ti) == 'default') {
      f.setTile(ti, 'flagged')
    } else if (f.getTile(ti) == 'flagged') {
      f.setTile(ti, 'question')
    } else if (f.getTile(ti) == 'question') {
      f.setTile(ti, 'default')
    } else if (
      f.getTile(ti) == 'cleared' && 
      f.getMines(ti) > 0
    ) {
      let { empty, flagged, dubious } = this.#getAdjacentTiles(ti)
      if (dubious.length + empty.length + flagged.length == f.getMines(ti)) {
        f.setTiles(empty, 'flagged')
        f.setTiles(dubious, 'flagged')
      } else {
        yield ff.any(
          ff.once(f.mouseEvents),
          ff.fiber(this.#blinkingQuestionsGen(empty))
        )
      }
    }  
  }
  #getAdjacentTiles(ti: number) {
    let f = this.#field
    let tis = f.getAdjacentTileIndexes(ti)
    let empty = tis.filter(i => f.getTile(i) == 'default')
    let flagged = tis.filter(i => f.getTile(i) == 'flagged')
    let dubious = tis.filter(i => f.getTile(i) == 'question')
    return { empty, flagged, dubious }
  }
  * #gameGen(): Generator<any, never, any> {
    let f = this.#field
    if (f.tilesToReveal == 0) throw 'won'
    while (true) {
      let e = yield* ff.once(f.mouseEvents, e => e.type == 'mousedown')
      this.firstAction.set()
      let tileIndex = f.getTileIndex(e.x, e.y)
      if (e.button == 0) {
        yield* this.#leftClickGen(tileIndex)
      } else if (e.button == 2) {
        yield* this.#rightClickGen(tileIndex)
      }
    }
  }  
  * #autoplayGen() {
    let f = this.#field
    while (true) {
      yield* this.#solverGen()
      yield ff.sleep(300)
      let tis: number[] = []
      for (let i = 0; i < f.size; i++) {
        if (f.getTile(i) == 'default') tis.push(i)
      }
      if (tis.length == 0) throw 'lost'
      let ti: number
      for (let i = 0; i < 100 && tis.length; i++) {
        let index = Math.random() * tis.length | 0
        ti = tis[index]
        let atis = f.getAdjacentTileIndexes(ti)
        if (atis.every(i => f.getTile(i) !== 'cleared')) break
        tis[index] = tis.at(-1)!
        tis.pop()
      }
      try {
        f.setTile(ti!, 'pushed')
        yield ff.sleep(200)
      } finally {
        f.setTile(ti!, 'default')
      }
      yield* this.#openTileGen(ti!)
      if (f.tilesToReveal == 0) throw 'won'
      yield* ff.sleep(300)
    }
  }
}
