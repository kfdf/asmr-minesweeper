import * as ff from './fibers-futures'
export class Signal extends ff.Emitter<void> {
  #signaled = false
  reset() {
    this.#signaled = false
  }
  set() {
    if (this.#signaled) return
    this.#signaled = true
    this.emit()
  }
}
export class BatchEmitter<T> extends ff.Emitter<Set<T>> {
  #batch = new Set<T>()
  #future = ff.settled('resolved')
  reset() {
    this.#future.cancel()
    this.#batch.clear()
  }
  push(event: T) {
    if (!this.#future.pending) {
      this.#future = ff.sleep('micro').then(() => {
        this.emit(this.#batch)
        this.#batch.clear()
      })
    }
    this.#batch.add(event)
  }
}