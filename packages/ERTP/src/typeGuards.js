import { M, matches } from '@agoric/store';

export const BrandShape = M.remotable('Brand');
export const IssuerShape = M.remotable('Issuer');
export const PaymentShape = M.remotable('Payment');
export const PurseShape = M.remotable('Purse');
export const DepositFacetShape = M.remotable('DepositFacet');
const NotifierShape = M.remotable('Notifier');
export const MintShape = M.remotable('Mint');

/**
 * When the AmountValue of an Amount fits the NatValueShape, i.e., when it is
 * a non-negative bigint, then it represents that many units of the
 * fungible asset represented by that amount. The brand of that amount
 * should indeed represent a kind of asset consisting of a countable
 * set of fungible units.
 */
const NatValueShape = M.nat();

/**
 * When the AmountValue of an Amount fits the CopySetValueShape, i.e., when it
 * is a CopySet, then it represents the set of those
 * keys, where each key represents some individual non-fungible
 * item, like a concert ticket, from the non-fungible asset class
 * represented by that amount's brand. The amount itself represents
 * the set of these items, as opposed to any of the other items
 * from the same asset class.
 *
 * If a given value class represents concert tickets, it seems bizarre
 * that we can form amounts of any key. The hard constraint is that
 * the code that holds the mint for that asset class---the one associated
 * with that brand, only mints the items representing the real units
 * of that asset class as defined by it. Anyone else can put together
 * an amount expressing, for example, that they "want" some items that
 * will never be minted. That want will never be satisfied.
 * "You can't always get..."
 */
const CopySetValueShape = M.set();

/**
 * When the AmountValue of an Amount fits the SetValueShape, i.e., when it
 * is a CopyArray of passable Keys. This representation is deprecated.
 *
 * @deprecated Please change from using array-based SetValues to CopySet-based
 * CopySetValues.
 */
const SetValueShape = M.arrayOf(M.key());

/**
 * When the AmountValue of an Amount fits the CopyBagValueShape, i.e., when it
 * is a CopyBag, then it represents the bag (multiset) of those
 * keys, where each key represents some individual semi-fungible
 * item, like a concert ticket, from the semi-fungible asset class
 * represented by that amount's brand. The number of times that key
 * appears in the bag is the number of fungible units of that key.
 * The amount itself represents
 * the bag of these items, as opposed to any of the other items
 * from the same asset class.
 *
 * If a given value class represents concert tickets, it seems bizarre
 * that we can form amounts of any key. The hard constraint is that
 * the code that holds the mint for that asset class---the one associated
 * with that brand, only mints the items representing the real units
 * of that asset class as defined by it. Anyone else can put together
 * an amount expressing, for example, that they "want" some items that
 * will never be minted. That want will never be satisfied.
 * "You can't always get..."
 */
const CopyBagValueShape = M.bag();

const AmountValueShape = M.or(
  NatValueShape,
  CopySetValueShape,
  SetValueShape,
  CopyBagValueShape,
);

export const AmountShape = harden({
  brand: BrandShape,
  value: AmountValueShape,
});

/**
 * Returns true if value is a Nat bigint.
 *
 * @param {AmountValue} value
 * @returns {value is import('./types.js').NatValue}
 */
export const isNatValue = value => matches(value, NatValueShape);
harden(isNatValue);

/**
 * Returns true if value is a CopySet
 *
 * @param {AmountValue} value
 * @returns {value is CopySetValue}
 */
export const isCopySetValue = value => matches(value, CopySetValueShape);
harden(isCopySetValue);

/**
 * Returns true if value is a pass by copy array structure. Does not
 * check for duplicates. To check for duplicates, use setMathHelpers.coerce.
 *
 * @deprecated Please change from using array-based SetValues to CopySet-based
 * CopySetValues.
 * @param {AmountValue} value
 * @returns {value is SetValue}
 */
export const isSetValue = value => matches(value, SetValueShape);
harden(isSetValue);

/**
 * Returns true if value is a CopyBag
 *
 * @param {AmountValue} value
 * @returns {value is CopyBagValue}
 */
export const isCopyBagValue = value => matches(value, CopyBagValueShape);
harden(isCopyBagValue);

// One GOOGOLth should be enough decimal places for anybody.
export const MAX_ABSOLUTE_DECIMAL_PLACES = 100;

export const AssetKindShape = M.or('nat', 'set', 'copySet', 'copyBag');

export const DisplayInfoShape = M.partial(
  harden({
    decimalPlaces: M.and(
      M.gte(-MAX_ABSOLUTE_DECIMAL_PLACES),
      M.lte(MAX_ABSOLUTE_DECIMAL_PLACES),
    ),
    assetKind: AssetKindShape,
  }),
  harden({
    // Including this empty `rest` ensures that there are no other
    // properties beyond those in the `base` record.
  }),
);

// //////////////////////// Interfaces /////////////////////////////////////////

export const BrandI = M.interface('Brand', {
  isMyIssuer: M.callWhen(M.await(IssuerShape)).returns(M.boolean()),
  getAllegedName: M.call().returns(M.string()),
  getDisplayInfo: M.call().returns(DisplayInfoShape),
  getAmountShape: M.call().returns(M.pattern()),
});

/**
 * @param {Pattern} [brandShape]
 * @param {Pattern} [assetKindShape]
 * @param {Pattern} [amountShape]
 */
export const makeIssuerInterfaces = (
  brandShape = BrandShape,
  assetKindShape = AssetKindShape,
  amountShape = AmountShape,
) => {
  const IssuerI = M.interface('Issuer', {
    getBrand: M.call().returns(brandShape),
    getAllegedName: M.call().returns(M.string()),
    getAssetKind: M.call().returns(assetKindShape),
    getDisplayInfo: M.call().returns(DisplayInfoShape),
    makeEmptyPurse: M.call().returns(PurseShape),

    isLive: M.callWhen(M.await(PaymentShape)).returns(M.boolean()),
    getAmountOf: M.callWhen(M.await(PaymentShape)).returns(amountShape),
    burn: M.callWhen(M.await(PaymentShape))
      .optional(M.pattern())
      .returns(amountShape),
    claim: M.callWhen(M.await(PaymentShape))
      .optional(M.pattern())
      .returns(PaymentShape),
    combine: M.call(M.arrayOf(M.eref(PaymentShape)))
      .optional(amountShape)
      .returns(M.eref(PaymentShape)),
    split: M.callWhen(M.await(PaymentShape), amountShape).returns(
      M.arrayOf(PaymentShape),
    ),
    splitMany: M.callWhen(
      M.await(PaymentShape),
      M.arrayOf(amountShape),
    ).returns(M.arrayOf(PaymentShape)),
  });

  const MintI = M.interface('Mint', {
    getIssuer: M.call().returns(IssuerShape),
    mintPayment: M.call(amountShape).returns(PaymentShape),
  });

  const PaymentI = M.interface('Payment', {
    getAllegedBrand: M.call().returns(brandShape),
  });

  const PurseI = M.interface('Purse', {
    getAllegedBrand: M.call().returns(brandShape),
    getCurrentAmount: M.call().returns(amountShape),
    getCurrentAmountNotifier: M.call().returns(NotifierShape),
    // PurseI does *not* delay `deposit` until `srcPayment` is fulfulled.
    // Rather, the semantics of `deposit` require it to provide its
    // callers with a strong guarantee that `deposit` messages are
    // processed without further delay in the order they arrive.
    // PurseI therefore requires that the `srcPayment` argument already
    // be a remotable, not a promise.
    // PurseI only calls this raw method after validating that
    // `srcPayment` is a remotable, leaving it
    // to this raw method to validate that this remotable is actually
    // a live payment of the correct brand with sufficient funds.
    deposit: M.call(PaymentShape).optional(M.pattern()).returns(amountShape),
    getDepositFacet: M.call().returns(DepositFacetShape),
    withdraw: M.call(amountShape).returns(PaymentShape),
    getRecoverySet: M.call().returns(M.setOf(PaymentShape)),
    recoverAll: M.call().returns(amountShape),
  });

  const DepositFacetI = M.interface('DepositFacet', {
    receive: PurseI.methodGuards.deposit,
  });

  const PurseIKit = harden({
    purse: PurseI,
    depositFacet: DepositFacetI,
  });

  return harden({
    IssuerI,
    MintI,
    PaymentI,
    PurseIKit,
  });
};
harden(makeIssuerInterfaces);
