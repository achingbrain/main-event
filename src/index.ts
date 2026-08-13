/**
 * @packageDocumentation
 *
 * Adds types to the EventTarget class.
 *
 * Hopefully this won't be necessary
 * forever:
 *
 * - https://github.com/microsoft/TypeScript/issues/28357
 * - https://github.com/microsoft/TypeScript/issues/43477
 * - https://github.com/microsoft/TypeScript/issues/299
 * - https://www.npmjs.com/package/typed-events
 * - https://www.npmjs.com/package/typed-event-emitter
 * - https://www.npmjs.com/package/typed-event-target
 * - etc
 *
 * In addition to types, a `safeDispatchEvent` method is available which
 * prevents dispatching events that aren't in the event map, and a
 * `listenerCount` method which reports the number of listeners that are
 * currently registered for a given event.
 *
 * @example
 *
 * ```ts
 * import { TypedEventEmitter } from 'main-event'
 * import type { TypedEventTarget } from 'main-event'
 *
 * interface EventTypes {
 *   'test': CustomEvent<string>
 * }
 *
 * const target = new TypedEventEmitter<EventTypes>()
 *
 * // it's a regular EventTarget
 * console.info(target instanceof EventTarget) // true
 *
 * // register listeners normally
 * target.addEventListener('test', (evt) => {
 *   // evt is CustomEvent<string>
 * })
 *
 * // @ts-expect-error 'derp' is not in the event map
 * target.addEventListener('derp', () => {})
 *
 * // use normal dispatchEvent method
 * target.dispatchEvent(new CustomEvent('test', {
 *   detail: 'hello'
 * }))
 *
 * // use type safe dispatch method
 * target.safeDispatchEvent('test', {
 *   detail: 'world'
 * })
 *
 * // report listener count
 * console.info(target.listenerCount('test')) // 0
 *
 * // event emitters can be used purely as interfaces too
 * function acceptTarget (target: TypedEventTarget<EventTypes>) {
 *   // ...
 * }
 * ```
 */

import { setMaxListeners } from './events.ts'

export interface EventCallback<EventType> { (evt: EventType): void }
export interface EventObject<EventType> { handleEvent: EventCallback<EventType> }
export type EventHandler<EventType> = EventCallback<EventType> | EventObject<EventType>

interface Listener {
  /**
   * The original listener
   */
  callback: any

  /**
   * The function actually registered with the native EventTarget. `callback` is
   * never registered directly, so this is what has to be passed to
   * `super.removeEventListener` for the listener to be detached.
   */
  wrapper: EventCallback<Event>

  /**
   * Event listener options normalized according to https://dom.spec.whatwg.org/#interface-eventtarget
   */
  options: AddEventListenerOptions

  /**
   * Callback function added to any passed signal
   */
  onAbort(): void
}

/**
 *
 */
export interface TypedEventTarget <EventMap extends Record<string, any>> extends EventTarget {
  addEventListener<K extends keyof EventMap>(type: K, listener: EventHandler<EventMap[K]> | null, options?: boolean | AddEventListenerOptions): void

  listenerCount (type: string): number

  removeEventListener<K extends keyof EventMap>(type: K, listener?: EventHandler<EventMap[K]> | null, options?: boolean | EventListenerOptions): void

  removeEventListener (type: string, listener?: EventHandler<Event>, options?: boolean | EventListenerOptions): void

  safeDispatchEvent<Detail>(type: keyof EventMap, detail?: CustomEventInit<Detail>): boolean
}

function isEventObject <EventType> (obj?: any): obj is EventObject<EventType> {
  return typeof obj?.handleEvent === 'function'
}

/**
 * Returns true if the passed argument is a boolean value
 */
function isBoolean (obj?: any): obj is boolean {
  return obj === true || obj === false
}

/**
 * @see https://dom.spec.whatwg.org/#concept-flatten-options
 */
function flattenOptions (options?: any): boolean {
  if (isBoolean(options)) {
    return options
  }

  return options?.capture ?? false
}

/**
 * @see https://dom.spec.whatwg.org/#event-flatten-more
 */
function flattenMoreOptions (options?: any): AddEventListenerOptions {
  const opts: AddEventListenerOptions = {
    capture: flattenOptions(options),
    once: Boolean(options?.once)
  }

  if (options?.passive != null) {
    opts.passive = options?.passive
  }

  if (options?.signal != null) {
    opts.signal = options?.signal
  }

  return opts
}

/**
 * An implementation of a typed event target
 */
export class TypedEventEmitter<EventMap extends Record<string, any>> extends EventTarget implements TypedEventTarget<EventMap> {
  readonly #listeners = new Map<any, Listener[]>()

  constructor () {
    super()

    // silence MaxListenersExceededWarning warning on Node.js, this is a red
    // herring almost all of the time
    setMaxListeners(Infinity, this)
  }

  listenerCount (type: string): number {
    const listeners = this.#listeners.get(type)

    if (listeners == null) {
      return 0
    }

    return listeners.length
  }

  addEventListener<K extends keyof EventMap>(type: K, listener: EventHandler<EventMap[K]> | null, options?: boolean | AddEventListenerOptions): void
  addEventListener (type: string, listener: EventHandler<Event>, opts?: boolean | AddEventListenerOptions): void {
    const options = flattenMoreOptions(opts)

    if (options?.signal?.aborted === true) {
      return
    }

    // the wrapper - and not `listener` - is what is registered with the native
    // EventTarget, so a reference to it must be kept in order to be able to
    // remove it again later
    const wrapper = (evt: Event): void => {
      if (options.once) {
        this.removeEventListener(type, listener, options)
      }

      if (isEventObject<Event>(listener)) {
        listener.handleEvent(evt)
      } else {
        listener(evt)
      }
    }

    let list = this.#listeners.get(type)

    if (list == null) {
      list = []
      this.#listeners.set(type, list)
    }

    // if there is already an entry in the list for the same type, callback and
    // capture value, listening again is a no-op
    // @see https://dom.spec.whatwg.org/#add-an-event-listener
    const alreadyListening = list.some(entry => {
      if (entry.callback !== listener) {
        return false
      }

      // listener is already present, check capture options
      return this.#captureIsEqual(entry.options, options)
    })

    if (alreadyListening) {
      return
    }

    super.addEventListener(type, wrapper, options)

    const onAbort = (): void => {
      this.removeEventListener(type, listener, options)
    }
    options.signal?.addEventListener('abort', onAbort)

    list.push({
      callback: listener,
      wrapper,
      options,
      onAbort
    })
  }

  removeEventListener<K extends keyof EventMap>(type: K, listener?: EventHandler<EventMap[K]> | null, options?: boolean | EventListenerOptions): void
  removeEventListener (type: string, listener?: EventHandler<Event>, opts?: boolean | EventListenerOptions): void {
    const list = this.#listeners.get(type)

    if (list == null) {
      super.removeEventListener(type, listener ?? null, opts)
      return
    }

    this.#listeners.set(type, list.filter(entry => {
      if (entry.callback !== listener) {
        return true
      }

      // listeners are the same so we need to check the capture argument
      if (!this.#captureIsEqual(entry.options, opts)) {
        return true
      }

      super.removeEventListener(type, entry.wrapper, opts)

      // remove abort signal abort event listener if set
      entry.options?.signal?.removeEventListener('abort', entry.onAbort)

      return false
    }))
  }

  safeDispatchEvent<Detail>(type: keyof EventMap, detail: CustomEventInit<Detail> = {}): boolean {
    return this.dispatchEvent(new CustomEvent<Detail>(type as string, detail))
  }

  #captureIsEqual (optsA?: boolean | AddEventListenerOptions, optsB?: boolean | EventListenerOptions): boolean {
    return flattenMoreOptions(optsA).capture === flattenMoreOptions(optsB).capture
  }
}

export { setMaxListeners }
