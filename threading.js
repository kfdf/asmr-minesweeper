/**
@param {AbortSignal=} sig */
export function throwIfAborted(sig) {
  if (sig?.aborted) {
    throw new DOMError('AbortError')
  }
}
/**
@param {AbortSignal=} sig
@param {(err: DOMException) => void} callback */
export function onAbort(sig, callback) {
  if (!sig) return () => {}
  function handler() {
    callback(new DOMError('AbortError'))
  }
  if (sig.aborted) {
    Promise.resolve().then(handler)
  } else {
    sig.addEventListener('abort', handler)
  }
  return function() {
    sig.removeEventListener('abort', handler)
  }
}
/**
@template T */
export class Thread {
  /**
  @param {(sig: AbortSignal) => Promise<T>} callback
  @param {AbortSignal=} sig */
  constructor(callback, sig) {
    let controller = new AbortController()
    let cleanup = onAbort(sig, () => {
      controller.abort()
    })
    /** @type {Promise<T>} */
    let promise = Promise.resolve()
      .then(() => callback(controller.signal))
      .finally(cleanup)
      .catch(err => {
        if (err?.name !== 'AbortError') throw err
      })  
    this.abort = function() {
      controller.abort()
      return this
    }
    this.join = function(sig) {
      return abortable(promise, sig)
    }
  }
}
/**
@template T
@param {Promise<T>} promise
@param {AbortSignal=} sig 
@returns {Promise<T>} */
export function abortable(promise, sig) {
  if (!sig) return promise
  return new Promise((resolve, reject) => {
    let cleanup = onAbort(sig, reject)
    return promise.finally(cleanup).then(resolve, reject)
  })
}
/**
@param {number} ms
@param {AbortSignal=} sig */
export function sleep(ms, sig) {
  return new Promise((resolve, reject)  => {
    let cleanup = onAbort(sig, err => {
      clearTimeout(id)
      reject(err)
    })    
    let id = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
  })
}
/**
@template T */
export class EventQueue {
  constructor() {
    let tail = []
    let head = []
    let waiters = new Set()  
    let iterator = waiters[Symbol.iterator]()
    /** @param {T} item */
    this.put = item => {
      if (waiters.size) {
        let waiter = iterator.next().value
        waiters.delete(waiter)
        waiter(item)
      } else {
        tail.push(item)
      }
    }
    /**
    @param {AbortSignal=} sig 
    @returns {Promise<T>} */
    this.take = sig => {
      return new Promise((resolve, reject) => {
        if (tail.length + head.length) {
          throwIfAborted(sig)
          if (!head.length) {
            tail.reverse()
            let temp = head
            head = tail
            tail = temp
          }
          resolve(head.pop())
        } else {
          let cleanup = onAbort(sig, err => {
            waiters.delete(waiter)
            reject(err)
          })    
          function waiter(item) {
            cleanup()
            resolve(item)          
          }          
          waiters.add(waiter)
        }      
      })
    }
  }
}

export class Lock {
  constructor(n = 1) {
    /** @private */
    this.eq = new EventQueue()
    while (--n >= 0) this.eq.put()
  }
  async* acquire(sig) {
    await this.eq.take(sig)
    try {
      yield
    } finally {
      this.eq.put()
    }
  }
}
