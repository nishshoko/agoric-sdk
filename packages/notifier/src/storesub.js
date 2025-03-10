import { E } from '@endo/eventual-send';
import { Far, makeMarshal } from '@endo/marshal';
import { observeIteration } from './asyncIterableAdaptor.js';
import { makePublishKit, subscribeEach } from './publish-kit.js';
import { makeSubscriptionKit } from './subscriber.js';

/**
 * @template T
 * @param {Subscriber<T>} subscriber
 * @param {(v: T) => void} consumeValue
 */
const forEachPublicationRecord = async (subscriber, consumeValue) => {
  const iteratorP = E(subscribeEach(subscriber))[Symbol.asyncIterator]();

  let finished = false;
  while (!finished) {
    // Allow nested awaits (in loop) because it's safe for each to run in a turn
    // eslint-disable-next-line no-await-in-loop, @jessie.js/no-nested-await
    const { value, done } = await E(iteratorP).next();
    // eslint-disable-next-line no-await-in-loop, @jessie.js/no-nested-await
    await consumeValue(value);
    finished = !!done;
  }
};

/**
 * Begin iterating the source, storing serialized iteration values.  If the
 * storageNode's `setValue` operation rejects, no further writes to it will
 * be attempted (but results will remain available from the subscriber).
 *
 * Returns a StoredSubscriber that can be used by a client to directly follow
 * the iteration themselves, or obtain information to subscribe to the stored
 * data out-of-band.
 *
 * @template T
 * @param {Subscriber<T>} subscriber
 * @param {ERef<StorageNode>} storageNode
 * @param {ERef<ReturnType<typeof makeMarshal>>} marshaller
 * @returns {StoredSubscriber<T>}
 */
export const makeStoredSubscriber = (subscriber, storageNode, marshaller) => {
  assert(subscriber && storageNode && marshaller, 'missing argument');

  const storeValue = value =>
    E(marshaller)
      .serialize(value)
      .then(serialized => {
        const encoded = JSON.stringify(serialized);
        return E(storageNode).setValue(encoded);
      });

  // Start publishing the source.
  forEachPublicationRecord(subscriber, storeValue).catch(err => {
    // TODO: How should we handle and/or surface this failure?
    // https://github.com/Agoric/agoric-sdk/pull/5766#discussion_r922498088
    console.error('StoredSubscriber failed to iterate', err);
  });

  /** @type {Unserializer} */
  const unserializer = Far('unserializer', {
    unserialize: data => E(marshaller).unserialize(data),
  });

  /** @type {StoredSubscriber<T>} */
  const storesub = Far('StoredSubscriber', {
    ...subscriber,
    getStoreKey: () => E(storageNode).getStoreKey(),
    getUnserializer: () => unserializer,
  });
  return storesub;
};

/**
 * @deprecated use makeStoredSubscriber
 *
 * Begin iterating the source, storing serialized iteration values.  If the
 * storageNode's `setValue` operation rejects, the iteration will be terminated.
 *
 * Returns a StoredSubscription that can be used by a client to directly follow
 * the iteration themselves, or obtain information to subscribe to the stored
 * data out-of-band.
 *
 * @template T
 * @param {Subscription<T>} subscription
 * @param {ERef<StorageNode>} [storageNode]
 * @param {ERef<ReturnType<typeof makeMarshal>>} [marshaller]
 * @returns {StoredSubscription<T>}
 */
export const makeStoredSubscription = (
  subscription,
  storageNode,
  marshaller = makeMarshal(undefined, undefined, {
    marshalSaveError: () => {},
  }),
) => {
  /** @type {Unserializer} */
  const unserializer = Far('unserializer', {
    unserialize: data => E(marshaller).unserialize(data),
  });

  // Abort the iteration on the next observation if the publisher ever fails.
  let publishFailed = false;
  let publishException;

  const fail = err => {
    publishFailed = true;
    publishException = err;
  };

  // Must *not* be an async function, because it sometimes must throw to abort
  // the iteration.
  const publishValue = obj => {
    assert(storageNode);
    if (publishFailed) {
      // To properly abort the iteration, this must be a synchronous exception.
      throw publishException;
    }

    // Publish the value, capturing any error.
    E(marshaller)
      .serialize(obj)
      .then(serialized => {
        const encoded = JSON.stringify(serialized);
        return E(storageNode).setValue(encoded);
      })
      .catch(fail);
  };

  if (storageNode) {
    // Start publishing the source.
    observeIteration(subscription, {
      updateState: publishValue,
      finish: publishValue,
    }).catch(fail);
  }

  /** @type {StoredSubscription<T>} */
  // eslint-disable-next-line -- different per package https://github.com/Agoric/agoric-sdk/issues/4620
  // @ts-ignore getStoreKey type does not have `subscription`
  const storesub = Far('StoredSubscription', {
    getStoreKey: async () => {
      if (!storageNode) {
        return harden({ subscription });
      }
      const storeKey = await E(storageNode).getStoreKey();
      return harden({ ...storeKey, subscription });
    },
    getUnserializer: () => unserializer,
    getSharableSubscriptionInternals:
      subscription.getSharableSubscriptionInternals,
    [Symbol.asyncIterator]: subscription[Symbol.asyncIterator],
  });
  return storesub;
};
harden(makeStoredSubscription);

/**
 * @deprecated use StoredPublishKit
 * @template T
 * @typedef {object} StoredPublisherKit
 * @property {StoredSubscription<T>} subscriber
 * @property {IterationObserver<T>} publisher
 */

/**
 * @deprecated use makeStoredPublishKit
 *
 * @template [T=unknown]
 * @param {ERef<StorageNode>} [storageNode]
 * @param {ERef<Marshaller>} [marshaller]
 * @param {string} [childPath]
 * @returns {StoredPublisherKit<T>}
 */
export const makeStoredPublisherKit = (storageNode, marshaller, childPath) => {
  const { publication, subscription } = makeSubscriptionKit();

  if (storageNode && childPath) {
    storageNode = E(storageNode).makeChildNode(childPath);
  }

  // wrap the subscription to tee events to storage, repeating to this `subscriber`
  const subscriber = makeStoredSubscription(
    subscription,
    storageNode,
    marshaller,
  );

  return {
    publisher: publication,
    subscriber,
  };
};

/**
 * Like makePublishKit this makes a `{ publisher, subscriber }` pair for doing efficient
 * distributed pub/sub supporting both "each" and "latest" iteration
 * of published values.
 *
 * What's different is `subscriber` tees records, writing out to storageNode.
 *
 * @template [T=unknown]
 * @param {ERef<StorageNode>} storageNode
 * @param {ERef<Marshaller>} marshaller
 * @returns {StoredPublishKit<T>}
 */
export const makeStoredPublishKit = (storageNode, marshaller) => {
  const { publisher, subscriber } = makePublishKit();

  return {
    publisher,
    // wrap the subscriber to tee events to storage
    subscriber: makeStoredSubscriber(subscriber, storageNode, marshaller),
  };
};
harden(makeStoredPublishKit);
