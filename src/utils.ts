import { Presets, SingleBar } from 'cli-progress'
import consola from 'consola'

type AsyncFn<Args extends any[], R> = (...args: Args) => Promise<R>

interface WithRetryOptions {
  retries?: number
  baseDelay?: number
  shouldRetry?: (err: any) => boolean
}

export function withRetry<Args extends any[], R>(
  fn: AsyncFn<Args, R>,
  {
    retries = 3,
    baseDelay = 500,
    shouldRetry = (err: any) =>
      err?.response?.status >= 500 || /network/i.test(err.message),
  }: WithRetryOptions = {},
): AsyncFn<Args, R> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  return async function retry(...args: Args): Promise<R> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args)
      }
      catch (err) {
        if (!shouldRetry(err))
          throw err
        const delay = baseDelay * 2 ** i + Math.random() * baseDelay
        consola.warn(`retry #${i + 1}, waiting ${delay}ms...`)
        await sleep(delay)
      }
    }
    // 最后一试，不 catch
    return fn(...args)
  }
}

export function rateLimit<Args extends any[], R>(
  fn: (...args: Args) => R | Promise<R>,
  qps = 8,
  maxQueue = Infinity,
) {
  let interval = 1000 / qps
  let last = Date.now()
  const queue: Array<{ args: Args, resolve: (r: R) => void, reject: (e: any) => void }> = []

  const bar = new SingleBar({
    hideCursor: true,
    format: '📘 Translate progress |{bar}| {percentage}% | {value}/{total}',
  }, Presets.shades_classic)
  let total = 0
  let done = 0

  function refill() {
    const now = Date.now()
    const tokens = Math.floor((now - last) / interval)
    if (tokens > 0) {
      last += tokens * interval
      for (let i = 0; i < tokens && queue.length; i++) {
        const { args, resolve, reject } = queue.shift()!
        Promise.resolve(fn(...args))
          .then(resolve, reject)
          .finally(() => {
            done++
            bar.increment()
            if (done === total)
              bar.stop()
          })
      }
    }
  }

  const timer = setInterval(refill, interval)

  const wrapped = (...args: Args): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      if (queue.length >= maxQueue)
        return reject(new Error('rateLimit queue overflow'))
      queue.push({ args, resolve, reject })
      refill()

      total++
      bar.setTotal(total)
      if (total === 1)
        bar.start(0, 0)
    })

  return Object.assign(wrapped, {
    stop: () => clearInterval(timer),
    updateQps: (newQps: number) => {
      clearInterval(timer)
      interval = 1000 / newQps
      setInterval(refill, interval)
    },
  })
}
