/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { TypedEventEmitter } from '../src/index.js'

describe('main-event', () => {
  it('should be an EventTarget', async () => {
    const target = new TypedEventEmitter()

    expect(target).to.be.an.instanceOf(EventTarget)
  })

  it('should type event emitters', async () => {
    interface EventTypes {
      test: CustomEvent<string>
    }

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
    interface EventTypes {
      test: CustomEvent<string>
    }

    const target = new TypedEventEmitter<EventTypes>()

    expect(target.listenerCount('test')).to.equal(0)

    target.addEventListener('test', () => {})

    expect(target.listenerCount('test')).to.equal(1)
  })

  it('should reduce event listener count after dispatch', () => {
    interface EventTypes {
      test: CustomEvent<string>
    }

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

  it('should reduce event listener count after removal', () => {
    interface EventTypes {
      test: CustomEvent<string>
    }

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
    interface EventTypes {
      test: CustomEvent<string>
    }

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
})
