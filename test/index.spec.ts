/* eslint-env mocha */

import { expect } from 'aegir/chai'
import { TypedEventEmitter } from '../src/index.ts'

interface EventTypes {
  test: CustomEvent<string>
  other: CustomEvent<string>
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
})
