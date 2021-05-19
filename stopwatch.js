export class StopWatch extends EventTarget {
  constructor() {
    super()
    this._tick = 0
    this.thread = undefined
  }
  get tick() {
    return this._tick
  }
  set tick(value) {
    if (this._tick == value) return
    this._tick = value
    this.dispatchEvent(new CustomEvent('tick', { detail: value }))
  }
  handler = () => {
    this.tick += 1
    let delay = this.startTime + (this.tick + 1) * 1000 - Date.now()
    this.thread = setTimeout(this.handler, delay)
  }  
  start() {
    if (this.thread != null) return
    this.startTime = Date.now()
    this.thread = setTimeout(this.handler, 1000)
  }
  stop() {
    if (this.thread == null) return
    clearTimeout(this.thread)
    this.thread = undefined
  }
  reset() {
    if (this.thread != null) return
    this.tick = 0
  }
}
