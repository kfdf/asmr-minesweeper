export type FutureStatus = 'resolved' | 'rejected' | 'cancelled'
export type FutureHandler<T> = (status: FutureStatus, result: T) => void
export let pendingFutures = 0
export class Future<T = any> {
  #status?: FutureStatus
  #result?: T
  #handler?: FutureHandler<T>
  #handlers?: FutureHandler<T> | FutureHandler<T>[]
  constructor() {
    pendingFutures++
  }
  get pending() { 
    return this.#status === undefined 
  }
  #invoke(handler: FutureHandler<T>) {
    try { 
      handler(this.#status!, this.#result!) 
    } catch (error) { 
      unhandledErrors.emit(error)
    }
  }
  onSettle(handler: FutureHandler<T>) {
    if (this.#status !== undefined) {
      return this.#invoke(handler)
    }
    if (this.#handlers === undefined) {
      if (this.#handler === undefined) {
        this.#handler = handler
      } else {
        this.#handlers = handler
      }
    } else {
      if (this.#handler === undefined) {
        let handlers = this.#handlers as FutureHandler<T>[]
        handlers.push(handler)
      } else {
        let secondHandler = this.#handlers as FutureHandler<T>
        this.#handlers = [this.#handler, secondHandler, handler]
        this.#handler = undefined
      }
    }
  }
  settle(status: 'resolved', result: T): void
  settle(status: 'rejected', result?: any): void
  settle(status: 'cancelled'): void
  settle(status: FutureStatus, result: any): void
  settle(status: FutureStatus, result?: any) {
    if (this.#status !== undefined || status === undefined) return
    this.#status = status
    this.#result = result
    pendingFutures--
    if (this.#handler !== undefined) {
      this.#invoke(this.#handler)
      this.#handler = undefined
      if (this.#handlers !== undefined) {
        this.#invoke(this.#handlers as FutureHandler<T>)
        this.#handlers = undefined
      }
    } else {
      let handlers = this.#handlers as FutureHandler<T>[]
      if (handlers !== undefined) {
        while (handlers.length != 0) {
          this.#invoke(handlers.shift()!)
        }
        this.#handlers = undefined
      }
    }
  }

  then<T1 = T, T2 = never>(
    onResolved?: ((result: T) => (PromiseLike<T1> | T1)) | null, 
    onRejected?: ((error: any) => (PromiseLike<T2> | T2)) | null
  ): Future<T1 | T2> {
    let ret = new Future<T1 | T2>()
    let source: Future = this
    ret.onSettle((status, result) => {
      source.settle(status, result)
    })
    this.onSettle((status, result) => {
      let callback = 
        status == 'resolved' ? onResolved :
        status == 'rejected' ? onRejected : null
      if (callback == null) {
        ret.settle(status, result)
      } else try {
        let value = callback(result) as any
        if (value != null && typeof value.then === 'function') {
          source = promise(value)
          source.onSettle(ret.settle.bind(ret))
        } else {
          ret.settle('resolved', value)
        }
      } catch (error) {
        ret.settle('rejected', error)
      } 
    })
    return ret
  }
  cancel() {
    this.settle('cancelled')
  }
  *[Symbol.iterator](): Generator<Future<T>, T> {
    return (yield this) as T
  }
}
let abortOnSettle = Symbol()
export type FiberState = 'ready' | 'running' | 'finished' | 'faulted' | 'aborted'
export type GenOrGenFunc<T = any> = Generator<unknown, T> | (() => Generator<unknown, T>)
export class Fiber<T = any> {
  #gen: Generator<unknown, T>
  #result: any
  #joined?: Future
  #joinedMap?: Map<Future, boolean | undefined>
  #state: FiberState
  get state() { return this.#state }
  get result() { return this.#result }
  constructor(generator: GenOrGenFunc<T>) {
    this.#gen = generator as any
    this.#state = 'ready'
  }
  start() {
    if (this.#state != 'ready') return this
    this.#state = 'running'
    let callerFiber = currentFiber
    currentFiber = this
    try {
      if (typeof this.#gen == 'function') {
        this.#gen = (this.#gen as any)()
      }
      this.#loop(this.#gen.next())
    } catch (value) {
      this.#loop({ done: 'faulted', value })
    } finally {
      currentFiber = callerFiber
    }
    return this
  }
  abort() {
    if (this.#state == 'ready') {
      this.#loop({ done: 'aborted' })
    } else if (this.#state == 'running') {
      let future = this.#result as Future
      if (future.pending) {
        future.cancel()
      } else {
        throw new TypeError('Fiber is already running')
      }
    }
  }
  #settle(future: Future<any>, consumeErrors?: boolean) {
    if (this.#state == 'finished') {
      future.settle('resolved', this.#result)
    } else if (consumeErrors !== undefined) {
      future.settle('resolved', undefined)
    } else if (this.#state == 'faulted') {
      future.settle('rejected', this.#result)
    } else {
      future.cancel()
    }
  }
  #continue = (status: FutureStatus, result: any) => {
    let callerFiber = currentFiber
    currentFiber = this
    try {
      if (status == 'resolved') {
        this.#loop(this.#gen.next(result))
      } else if (status == 'rejected') {
        this.#loop(this.#gen.throw(result))
      } else {
        while (true) {
          let { done, value } = (this.#gen as any).return()
          if (done) break
          if (value != null &&
            typeof value.then == 'function' &&
            typeof value.cancel == 'function'
          ) try {
            value.cancel()
          } catch (error) {
            unhandledErrors.emit(error)
          }
        }
        this.#loop({ done: 'aborted' })
      }
    } catch (value) {
      this.#loop({ done: 'faulted', value })
    } finally {
      currentFiber = callerFiber
    }
  }
  #settleJoined() {
    let errorIgnored = this.#state == 'faulted'
    if (this.#joined !== undefined) {
      let consumeErrors = this.#joinedMap as any
      errorIgnored &&= consumeErrors === false
      this.#settle(this.#joined, consumeErrors)
    } else if (this.#joinedMap !== undefined) {
      for (let [future, consumeErrors] of this.#joinedMap) {
        errorIgnored &&= consumeErrors === false
        this.#settle(future, consumeErrors)
      }
      this.#joinedMap = undefined
    }
    if (errorIgnored) {
      unhandledErrors.emit(this.#result)
    }
  }
  #loop({ done, value }: { done?: boolean | 'faulted' | 'aborted', value?: any }) {
    if (done) {
      this.#result = value
      this.#state = done === true ? 'finished' : done
      this.#gen = undefined as any
      this.#settleJoined()
    } else try {
      if (value == null || typeof value.then !== 'function') {
        this.#loop(this.#gen.next(value))
      } else try {
        let future = promise(value)
        this.#result = future
        future.onSettle(this.#continue)
      } catch (error) {
        this.#loop(this.#gen.throw(error))
      }
    } catch (error) {
      this.#loop({ done: 'faulted', value: error })
    }
  }
  join(): Future<T>
  join(consumeErrors: boolean): Future<T | undefined>
  join(consumeErrors?: any, flag?: any): any {
    let ret = new Future<T>()
    if (this.#state == 'running' || this.#state == 'ready') {
      if (this.#joined === undefined) {
        if (this.#joinedMap === undefined) {
          this.#joined = ret
          this.#joinedMap = consumeErrors
        } else {
          this.#joinedMap.set(ret, consumeErrors)
        }
      } else {
        this.#joinedMap = new Map()
          .set(this.#joined, this.#joinedMap)
          .set(ret, consumeErrors)
        this.#joined = undefined
      }
      ret.onSettle(() => {
        if (this.#joined === undefined) {
          this.#joinedMap!.delete(ret)
        } else {
          this.#joined = undefined
          this.#joinedMap = undefined
        }
        if (flag === abortOnSettle) {
          this.abort()
        }
      })  
    } else {
      this.#settle(ret, consumeErrors)  
    }
    return ret
  }
}
type Handler<T> = (event: T) => void
export class Emitter<T = any> {
  #handlers = new Map<Handler<T>, number>()
  #lastId = 0
  #interrupt = false
  get size() {
    return this.#handlers.size
  }
  add(handler: Handler<T>, once = false) {
    if (this.#handlers.has(handler)) return
    let id = ++this.#lastId
    this.#handlers.set(handler, once ? -id : id)
  }
  remove(handler: Handler<T>) {
    this.#handlers.delete(handler)
  }
  interrupt() {
    this.#interrupt = true
  }
  emit = (event: T) => {
    let interrupt = this.#interrupt
    this.#interrupt = false
    let invokeId = this.#lastId
    for (let [handler, id] of this.#handlers) {
      if (this.#interrupt) break
      if (id > invokeId || -id > invokeId) break
      try {
        handler(event)
      } catch (error) {
        if (this !== unhandledErrors) {
          unhandledErrors.emit(error)
        } else {
          // really?!
        }
      } finally {
        if (id < 0) this.remove(handler)
      }
    }
    this.#interrupt = interrupt
  }
}
let emptyGenFunc = function*(){ }
export let finishedFiber: Fiber<any> = new Fiber(emptyGenFunc)
export let currentFiber = finishedFiber
finishedFiber.start()
export let unhandledErrors = new Emitter()

export class Evictor<T extends any[] = never> {
  #generatorSource?: (...args: T) => Generator
  #fiber = finishedFiber
  get fiber() { return this.#fiber }
  constructor(generatorSource?: (...args: T) => Generator) {
    this.#generatorSource = generatorSource
  }
  start(generator: GenOrGenFunc): void
  start(...args: T): void
  start(...args: any) {
    let rator = typeof this.#generatorSource == 'function' ?
       this.#generatorSource(...args) : args[0]
    this.#fiber.abort()
    this.#fiber = new Fiber(rator)
    this.#fiber.start()
  }
  startJoin<T>(
    generator: GenOrGenFunc<T>, consumeErrors: boolean = true
  ): Generator<unknown, T> {
    if (currentFiber == this.#fiber) {
      if (typeof generator == 'function') {
        return generator()
      } else {
        return generator
      }
    } else {
      this.#fiber.abort()
      this.#fiber = new Fiber(generator)
      let fiber = this.#fiber as any
      let ret = fiber.join(consumeErrors, abortOnSettle)[Symbol.iterator]()
      fiber.start()
      return ret
    }
  }
  get running() {
    return this.#fiber.state == 'running'
  }
  abort() {
    if (currentFiber == this.#fiber) return
    this.#fiber.abort()
  }
}

export class Semaphore {
  #tickets: any[] = []
  #queue = new Emitter<void>()
  #guests = new Map()
  constructor(count = 1) {
    while (this.#tickets.length < count) {
      this.#tickets.push()
    }
  }
  * acquire() {
    let dist = this.#guests.get(currentFiber)
    if (dist) {
      this.#guests.set(currentFiber, dist + 1)
    } else {
      if (!this.#tickets.length) {
        yield onceAvailable(this.#queue, this.#tickets)
      } 
      this.#guests.set(currentFiber, 1)
      this.#tickets.pop()
    }
  }
  release() {
    let dist = this.#guests.get(currentFiber)
    if (dist > 1) {
      this.#guests.set(currentFiber, dist - 1)
    } else if (dist == 1) {
      this.#guests.delete(currentFiber)
      this.#tickets.push()
      this.#queue.emit()
    } else {
      throw new TypeError("Can't release unacquired semaphore")
    }
  }
}
export function settled<T = void>(status: 'resolved', result?: T): Future<T>
export function settled(status: 'rejected', result?: any): Future<never>
export function settled(status: 'cancelled'): Future<never>
export function settled(status: any, result?: any) {
  let ret = new Future()
  ret.settle(status, result)
  return ret as any
}
export function cleanup(callback: FutureHandler<any>) { 
  let ret = new Future<never>()
  ret.onSettle(callback)
  return ret
}
export function fiber<T>(generator: GenOrGenFunc<T>, consumeErrors?: boolean): Future<T> {
  let fiber = new Fiber(generator) as any
  let ret = fiber.join(consumeErrors, abortOnSettle)
  fiber.start()
  return ret
}
export function promise<T>(thenable: PromiseLike<T> & { cancel?: () => void }) {
  if (thenable instanceof Future) {
    return thenable as Future<T>
  }
  let ret = new Future<T>()
  let settled = false
  thenable.then(result => {
    settled = true
    ret.settle('resolved', result)
  }, error => {
    settled = true
    ret.settle('rejected', error)
  })
  if (typeof thenable.cancel === 'function') {
    ret.onSettle(() => {
      if (settled) return
      thenable.cancel!()
    })
  }
  return ret
}
export function any<T1>(f1: Future<T1>): Future<T1>
export function any<T1, T2>(f1: Future<T1>, f2: Future<T2>): Future<T1 | T2>
export function any<T1, T2, T3>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>): Future<T1 | T2 | T3>
export function any<T1, T2, T3, T4>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>): Future<T1 | T2 | T3 | T4>
export function any<T1, T2, T3, T4, T5>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>, f5: Future<T5>): Future<T1 | T2 | T3 | T4 | T5>
export function any<T1, T2, T3, T4, T5, T6>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>, f5: Future<T5>, f6: Future<T6>): Future<T1 | T2 | T3 | T4 | T5 | T6>
export function any<T>(...futures: Future<T>[]): Future<T>
export function any(...futures: Future[]) {
  let ret = new Future()
  let settle = ret.settle.bind(ret)
  for (let future of futures) {
    future.onSettle(settle)
  }
  ret.onSettle(() => {
    for (let future of futures) {
      future.cancel()
    }
  })
  return ret
}

export function all<T1>(f1: Future<T1>): Future<[T1]>
export function all<T1, T2>(f1: Future<T1>, f2: Future<T2>): Future<[T1, T2]>
export function all<T1, T2, T3>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>): Future<[T1, T2, T3]>
export function all<T1, T2, T3, T4>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>): Future<[T1, T2, T3, T4]>
export function all<T1, T2, T3, T4, T5>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>, f5: Future<T5>): Future<[T1, T2, T3, T4, T5]>
export function all<T1, T2, T3, T4, T5, T6>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>, f5: Future<T5>, f6: Future<T6>): Future<[T1, T2, T3, T4, T5, T6]>
export function all<T>(...futures: Future<T>[]): Future<T[]>
export function all(...futures: Future[]) {
  let ret = new Future()
  let results = new Array(futures.length).fill(undefined)
  let count = 0
  for (let i = 0; i < futures.length; i++) {
    futures[i].onSettle((status, result) => {
      if (status == 'resolved') {
        results[i] = result
        if (++count == results.length) {
          ret.settle('resolved', results)
        }
      } else {
        ret.settle(status, result)
      }
    })
  }
  ret.onSettle(() => {
    for (let future of futures) {
      future.cancel()
    }
  })
  return ret
}
function onceAvailable(notifier: Emitter, queue: any[]) {
  return once(notifier, () => {
    let isEmpty = queue.length == 0
    if (isEmpty) notifier.interrupt()
    return !isEmpty
  })
}
function* take(notifier: Emitter, settled: Future[]): Generator {
  if (!settled.length) {
    yield onceAvailable(notifier, settled)
  }
  return yield settled.shift()
}
export type GenOfGenFuncs<T = any> = Generator<Generator<unknown, T, void>, void, void>
export function race<T1>(f1: Future<T1>): GenOfGenFuncs<T1>
export function race<T1, T2>(f1: Future<T1>, f2: Future<T2>): GenOfGenFuncs<T1 | T2>
export function race<T1, T2, T3>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>): GenOfGenFuncs<T1 | T2 | T3>
export function race<T1, T2, T3, T4>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>): GenOfGenFuncs<T1 | T2 | T3 | T4>
export function race<T1, T2, T3, T4, T5>(f1: Future<T1>, f2: Future<T2>, f3: Future<T3>, f4: Future<T4>, f5: Future<T5>): GenOfGenFuncs<T1 | T2 | T3 | T4 | T5>
export function race<T>(...futures: Future<T>[]): GenOfGenFuncs<T>
export function* race(...futures: Future[]) {
  let pending = new Set<Future>(futures)
  let settled: Future[] = []
  let notifier = new Emitter<void>()
  for (let future of pending) {
    future.onSettle(() => {
      pending.delete(future)
      settled.push(future)
      notifier.emit()
    })
  }
  try {
    for (let i = 0; i < futures.length; i++) {
      yield take(notifier, settled)
    }
  } finally {
    for (let future of pending) {
      future.cancel()
    }
  }
}

export function sleep(): Future<never>
export function sleep(ms: number): Future<void>
export function sleep(until: 'micro'): Future<void>
export function sleep(until: 'frame'): Future<number>
export function sleep(ms?: any): any {
  let ret = new Future<void>()
  let resolved = false
  if (typeof ms === 'number') {
    let id = setTimeout(() => {
      resolved = true
      ret.settle('resolved')
    }, ms)
    ret.onSettle(() => {
      if (resolved) return
      clearTimeout(id)
    })
  } else if (ms === 'micro') {
    queueMicrotask(() => {
      ret.settle('resolved')
    })
  } else if (ms === 'frame') {
    let id = requestAnimationFrame(now => {
      resolved = true
      ret.settle('resolved', now)
    })
    ret.onSettle(() => {
      if (resolved) return
      cancelAnimationFrame(id)
    })
  }
  return ret
}
function subscribeImpl<T>(ret: Future<T>, target: any, type: any, handler: any, options: any) {
  if (type === null) {
    target.add(handler)
    ret.onSettle(() => target.remove(handler))
  } else {
    if (typeof target.removeEventListener == 'function') {
      target.addEventListener(type, handler, options)  
      ret.onSettle(() => target.removeEventListener(type, handler, options))
    } else {
      target.on(type, handler)
      ret.onSettle(() => target.off(type, handler))
    }
  }
}
interface EventEmitter {
  on(type: string, listener: Function): void
  off(type: string, listener: Function): void
}
export function subscribe<T>(target: Emitter<T>, handler: Handler<T>): Future<never>
export function subscribe<T extends Event>(target: EventTarget, type: string, handler: Handler<T>, options?: boolean | AddEventListenerOptions): Future<never>
export function subscribe<T>(target: EventEmitter, type: string, handler: Handler<T>): Future<never>
export function subscribe(target: any, type: any, handler?: any, options?: any) {
  if (typeof type != 'string') {
    handler = type, type = null
  }
  let ret = new Future<never>()
  subscribeImpl(ret, target, type, handler, options)
  return ret
}
type Predicate<T> = (event: T) => any
export function once<T>(target: Emitter<T>, predicate?: Predicate<T>): Future<T>
export function once<T extends Event>(target: EventTarget, type: string, predicate?: Predicate<T> | null, options?: boolean | AddEventListenerOptions): Future<T>
export function once<T>(target: EventEmitter, type: string, predicate?: Predicate<T>): Future<T>
export function once(target: any, type: any, predicate?: any, options?: any) {
  if (typeof type != 'string') {
    predicate = type, type = null
  }
  let ret = new Future()
  let hasPredicate = typeof predicate == 'function'
  subscribeImpl(ret, target, type, (event: any) => {
    try {
      if (hasPredicate && !predicate(event)) return
      ret.settle('resolved', event)
    } catch (error) {
      ret.settle('rejected', error)
    }
  }, options)
  return ret
}
export function fetch(
  input: RequestInfo | URL, init: RequestInit = {}
) {
  let controller = new AbortController()
  let { signal } = controller
  let ret = promise(self.fetch(input, { ...init, signal }))
  ret.onSettle(() => controller.abort())
  return ret
}
