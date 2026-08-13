/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { isElectron, isNode } from 'wherearewe'
import { TypedEventEmitter } from '../src/index.ts'

interface EventTypes {
  test: CustomEvent<string>
  other: CustomEvent<string>
}

interface AddRemoveTestOptions {
  addA?: AddEventListenerOptions | boolean,
  addB?: AddEventListenerOptions | boolean,
  remove?: EventListenerOptions | boolean
}

function supportsListenerCount (obj: any): obj is EventTarget & Pick<TypedEventEmitter<any>, 'listenerCount'> {
  return typeof obj.listenerCount === 'function'
}

const addRemoveTests: Array<{ name: string, options: AddRemoveTestOptions }> = [{
  name: 'should remove all listeners with default args',
  options: {}
}]

const useCaptureVariations = [
  undefined,
  true,
  false, {
    capture: undefined
  }, {
    capture: true
  }, {
    capture: false
  }
]

function printCapture (arg?: any): string {
  if (arg === true || arg === false) {
    return arg
  }

  if (Object.keys(arg ?? {}).includes('capture')) {
    return `{ capture: ${arg.capture} }`
  }

  return 'undefined'
}

// add all useCapture variations
for (let i = 0; i < useCaptureVariations.length; i++) {
  for (let j = 0; j < useCaptureVariations.length; j++) {
    for (let k = 0; k < useCaptureVariations.length; k++) {
      const addA = useCaptureVariations[i]
      const addB = useCaptureVariations[j]
      const remove = useCaptureVariations[k]

      addRemoveTests.push({
        name: `should add and remove listener with [${printCapture(addA)}, ${printCapture(addB)}] and remove ${printCapture(remove)}`,
        options: {
          addA,
          addB,
          remove
        }
      })
    }
  }
}

function isBoolean (obj?: any): obj is boolean {
  return obj === true || obj === false
}

function findCapture (opts?: any): boolean {
  if (isBoolean(opts)) {
    return opts
  }

  return opts?.capture ?? false
}

function createAddRemoveTest (name: string, createEmitter: () => EventTarget, options: AddRemoveTestOptions): void {
  it(name, function () {
    if ((isNode || isElectron) && (isBoolean(options.addA) || isBoolean(options.addB) || isBoolean(options.remove))) {
      // remove after fix for https://github.com/nodejs/node/issues/65244 ships
      this.skip()
    }

    const removedAll = findCapture(options.addA) === findCapture(options.addB) && findCapture(options.addB) === findCapture(options.remove)
    const target = createEmitter()

    let invocations = 0
    const listener: EventListener = (): void => {
      invocations++
    }

    let expectedInvocations = 1

    if (removedAll) {
      expectedInvocations = 0
    }

    let expectedListeners = 2

    if (findCapture(options.addA) === findCapture(options.addB)) {
      expectedListeners = 1
    }

    target.addEventListener('test', listener, options.addA)
    target.addEventListener('test', listener, options.addB)

    if (supportsListenerCount(target)) {
      expect(target.listenerCount('test')).to.equal(expectedListeners, 'reported incorrect number of listeners before removal')
    }

    target.removeEventListener('test', listener, options.remove)
    target.dispatchEvent(new CustomEvent('test'))

    expect(invocations).to.equal(expectedInvocations, 'incorrect number of invocations recorded')

    if (supportsListenerCount(target)) {
      expect(target.listenerCount('test')).to.equal(expectedInvocations, 'reported incorrect number of listeners after removal')
    }
  })
}

describe('main-event', () => {
  it('should be an EventTarget', async () => {
    const target = new TypedEventEmitter()

    expect(target).to.be.an.instanceOf(EventTarget)
  })

  it('should type event emitters', async () => {
    const target = new TypedEventEmitter<EventTypes>()
    const deferred = Promise.withResolvers()
    target.addEventListener('test', (evt) => {
      deferred.resolve(evt.detail)
    })

    // @ts-expect-error 'derp' is not in EventTypes
    target.addEventListener('derp', () => {})

    target.safeDispatchEvent('test', {
      detail: 'hello'
    })

    await expect(deferred.promise).to.eventually.equal('hello')
  })

  it('should report event listener count', () => {
    const target = new TypedEventEmitter<EventTypes>()

    expect(target.listenerCount('test')).to.equal(0)

    target.addEventListener('test', () => {})

    expect(target.listenerCount('test')).to.equal(1)
  })

  it('should reduce event listener count after dispatch', () => {
    const target = new TypedEventEmitter<EventTypes>()

    expect(target.listenerCount('test')).to.equal(0)

    target.addEventListener('test', () => {}, {
      once: true
    })

    expect(target.listenerCount('test')).to.equal(1)

    target.safeDispatchEvent('test', {
      detail: 'hello'
    })

    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should reduce event listener count after dispatch when listener is an object', () => {
    const target = new TypedEventEmitter<EventTypes>()
    target.addEventListener('test', {
      handleEvent: (evt) => {}
    }, {
      once: true
    })

    expect(target.listenerCount('test')).to.equal(1)

    target.dispatchEvent(new CustomEvent('test', {
      detail: 'hello'
    }))

    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should reduce event listener count after removal', () => {
    const target = new TypedEventEmitter<EventTypes>()

    expect(target.listenerCount('test')).to.equal(0)

    const listener = (): void => {}

    target.addEventListener('test', listener, {
      once: true
    })

    expect(target.listenerCount('test')).to.equal(1)

    target.removeEventListener('test', listener)

    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should allow regular dispatch', () => {
    const target = new TypedEventEmitter<EventTypes>()

    expect(target.listenerCount('test')).to.equal(0)

    target.addEventListener('test', () => {}, {
      once: true
    })

    expect(target.listenerCount('test')).to.equal(1)

    target.dispatchEvent(new CustomEvent('test', {
      detail: 'hello'
    }))

    target.dispatchEvent(new CustomEvent('derp'))

    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should not remove `once` listener if earlier event propagation was stopped', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let firstListenerInvoked = false
    let secondListenerInvoked = false

    expect(target.listenerCount('test')).to.equal(0)

    target.addEventListener('test', (evt) => {
      firstListenerInvoked = true
      evt.stopImmediatePropagation()
    }, {
      once: true
    })

    target.addEventListener('test', () => {
      secondListenerInvoked = true
    }, {
      once: true
    })

    target.dispatchEvent(new CustomEvent('test', {
      detail: 'hello'
    }))

    expect(firstListenerInvoked).to.be.true()
    expect(secondListenerInvoked).to.be.false()
    expect(target.listenerCount('test')).to.equal(1)

    target.dispatchEvent(new CustomEvent('test', {
      detail: 'world'
    }))

    expect(secondListenerInvoked).to.be.true()
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should remove listeners that are not present', () => {
    const target = new TypedEventEmitter<EventTypes>()
    expect(target.listenerCount('other')).to.equal(0)
    target.removeEventListener('other')
    expect(target.listenerCount('other')).to.equal(0)
  })

  it('should stop invoking a listener after removal', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)

    target.removeEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should stop invoking a `once` listener removed before it fires', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { once: true })
    target.removeEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))

    expect(invocations).to.equal(0)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should stop invoking an object listener after removal', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = {
      handleEvent: (): void => {
        invocations++
      }
    }

    target.addEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)

    target.removeEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(0)
  })

  describe('add/remove event listener compatibility (EventTarget)', () => {
    addRemoveTests.forEach(test => {
      createAddRemoveTest(test.name, () => new EventTarget(), test.options)
    })
  })

  describe('add/remove event listener compatibility (TypedEventEmitter)', () => {
    addRemoveTests.forEach(test => {
      createAddRemoveTest(test.name, () => new TypedEventEmitter(), test.options)
    })
  })

  it('should leave other listeners attached when one is removed', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let removedInvocations = 0
    let retainedInvocations = 0
    const removed = (): void => {
      removedInvocations++
    }
    const retained = (): void => {
      retainedInvocations++
    }

    target.addEventListener('test', removed)
    target.addEventListener('test', retained)
    target.removeEventListener('test', removed)
    target.dispatchEvent(new CustomEvent('test'))

    expect(removedInvocations).to.equal(0)
    expect(retainedInvocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(1)
  })

  it('should detach a listener added with capture', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { capture: true })
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)

    target.removeEventListener('test', listener, { capture: true })
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should detach a listener added with useCapture', function () {
    if ((isNode || isElectron)) {
      // remove after fix for https://github.com/nodejs/node/issues/65244 ships
      this.skip()
    }

    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    // the boolean and the options object are two spellings of the same flag, so
    // either may be used to remove a listener added with the other
    target.addEventListener('test', listener, true)
    target.removeEventListener('test', listener, { capture: true })

    target.addEventListener('test', listener, { capture: true })
    target.removeEventListener('test', listener, true)

    target.dispatchEvent(new CustomEvent('test'))

    expect(invocations).to.equal(0)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should not detach a listener when the capture flag does not match', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { capture: true })

    // capture is the only option removeEventListener takes into account, and it
    // has to match, so none of these remove anything
    target.removeEventListener('test', listener)
    target.removeEventListener('test', listener, false)
    target.removeEventListener('test', listener, { capture: false })

    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(1)

    target.removeEventListener('test', listener, { capture: true })
    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should treat capturing and non-capturing registrations as distinct', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { capture: true })
    target.addEventListener('test', listener)
    expect(target.listenerCount('test')).to.equal(2)

    target.removeEventListener('test', listener, { capture: true })
    target.dispatchEvent(new CustomEvent('test'))

    expect(invocations).to.equal(1)
    expect(target.listenerCount('test')).to.equal(1)
  })

  it('should treat capturing and default-capturing registrations as distinct', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { capture: true })
    target.addEventListener('test', listener)
    expect(target.listenerCount('test')).to.equal(2, 'did not report correct number of listeners before invocation')

    target.removeEventListener('test', listener)
    target.dispatchEvent(new CustomEvent('test'))

    expect(invocations).to.equal(1, 'did not report correct number of invocations')
    expect(target.listenerCount('test')).to.equal(1, 'did not report correct number of listeners after invocation')
  })

  it('should not detach other registrations when a `once` listener fires', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    target.addEventListener('test', listener, { once: true })
    target.addEventListener('test', listener, true)
    expect(target.listenerCount('test')).to.equal(2)

    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(2)

    // the `once` registration is gone, the other one is still attached
    expect(target.listenerCount('test')).to.equal(1)

    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(3)
  })

  it('should not accumulate listeners over add/remove cycles', () => {
    const target = new TypedEventEmitter<EventTypes>()
    const counter = { invocations: 0 }

    for (let i = 0; i < 100; i++) {
      const listener = (): void => {
        counter.invocations++
      }
      target.addEventListener('test', listener)
      target.removeEventListener('test', listener)
    }

    target.dispatchEvent(new CustomEvent('test'))

    expect(counter.invocations).to.equal(0)
    expect(target.listenerCount('test')).to.equal(0)
  })

  it('should detach a listener via a signal', () => {
    const target = new TypedEventEmitter<EventTypes>()
    let invocations = 0
    const listener = (): void => {
      invocations++
    }

    const controller = new AbortController()

    target.addEventListener('test', listener, { signal: controller.signal })
    expect(target.listenerCount('test')).to.equal(1)

    controller.abort()

    expect(target.listenerCount('test')).to.equal(0)

    target.dispatchEvent(new CustomEvent('test'))
    expect(invocations).to.equal(0)
  })
})
