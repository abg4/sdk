import { BigNumber } from "ethers";
import { MAX_SAFE_JS_INT } from "@uma/common/dist/Constants";
import { toBN } from "../utils";
import { HUBPOOL_CHAIN_ID } from "../constants";
import { parseEther } from "ethers/lib/utils";

/**
 * Computes a linear integral over a piecewise function
 * @param cutoffArray An array of tuples that define the cutoff points and values of the piecewise function
 * @param index The index of the cutoffArray that we're currently in
 * @param integralStart Where we're starting the integral
 * @param integralEnd Where we're ending the integral
 * @returns The integral of the piecewise function over the given range
 */
export function performLinearIntegration(
  cutoffArray: [BigNumber, BigNumber][],
  index: number,
  integralStart: BigNumber,
  integralEnd: BigNumber
): BigNumber {
  const lengthUnderCurve = integralEnd.sub(integralStart);
  const resolveValue = (index: number): BigNumber => cutoffArray[index][1];
  let feeIntegral = resolveValue(Math.min(index, cutoffArray.length - 1)).mul(lengthUnderCurve);
  // If we're not in the bounds of this array, we need to perform an additional computation
  if (index > 0 && index < cutoffArray.length) {
    const [currCutoff, currValue] = cutoffArray[index];
    const [prevCutoff, prevValue] = cutoffArray[index - 1];
    const slope = prevValue.sub(currValue).div(prevCutoff.sub(currCutoff));
    // We need to compute a discrete integral at this point. We have the following
    // psuedo code:
    // fee_integral = (
    //     fx_i*(integral_end - integral_start) +
    //     slope*(
    //         (integral_end**2/2 - x_i*integral_end) -
    //         (integral_start**2/2 - x_i*integral_start)
    //     )
    // )
    // NOT: we define the variables above [x_i, fx_i ] as [currCutoff, currValue] in the code below
    const integralEndExpression = integralEnd.pow(2).div(2).sub(currCutoff.mul(integralEnd));
    const integralStartExpression = integralStart.pow(2).div(2).sub(currCutoff.mul(integralStart));
    feeIntegral = feeIntegral.add(slope.mul(integralEndExpression.sub(integralStartExpression)));
  }
  return feeIntegral;
}

/**
 * Retrieve the numerical bounds of a given interval from an array of buckets
 * @param cutoffArray An array of tuples that define the cutoff points and values of the piecewise function
 * @param index The index of the cutoffArray that we're currently in
 * @returns The upper and lower bounds of the interval
 */
export function getBounds(cutoffArray: [BigNumber, BigNumber][], index: number): [BigNumber, BigNumber] {
  if (index === 0) {
    return [BigNumber.from(-MAX_SAFE_JS_INT), cutoffArray[0][0]];
  } else if (index >= cutoffArray.length) {
    return [cutoffArray[cutoffArray.length - 1][0], BigNumber.from(MAX_SAFE_JS_INT)];
  } else {
    return [cutoffArray[index - 1][0], cutoffArray[index][0]];
  }
}

/**
 * Get the interval that the target is within and the bounds of that interval
 * @param cutoffArray An array of tuples that define the cutoff points and values of the piecewise function
 * @param target The target value that we're trying to find the interval for
 * @returns The index of the interval that the target is in and the bounds of that interval
 */
export function getInterval(
  cutoffArray: [BigNumber, BigNumber][],
  target: BigNumber
): [number, [BigNumber, BigNumber]] {
  let result: [number, [BigNumber, BigNumber]] = [
    -1,
    [BigNumber.from(-MAX_SAFE_JS_INT), BigNumber.from(MAX_SAFE_JS_INT)],
  ];
  for (let i = 0; i <= cutoffArray.length; i++) {
    const [lowerBound, upperBound] = getBounds(cutoffArray, i);
    if (target.gte(lowerBound) && target.lt(upperBound)) {
      result = [i, [lowerBound, upperBound]];
      break;
    }
  }
  return result;
}

/**
 * Computes the balancing fee for a refund request
 * @param cutoffArray An array of tuples that define the cutoff points and values of the piecewise function
 * @param runningBalance The current running balance of the spoke pool
 * @param modificationAmount The amount that the user will be refunding
 * @returns The balancing fee for the refund
 */
export function getRefundBalancingFee(
  cutoffArray: [BigNumber, BigNumber][],
  runningBalance: BigNumber,
  modificationAmount: BigNumber
): BigNumber {
  const [balanceIndex, [balanceLowerBound]] = getInterval(cutoffArray, runningBalance);
  const [balanceLessModificationIndex, [, balanceLessModificationUpperBound]] = getInterval(
    cutoffArray,
    runningBalance.sub(modificationAmount)
  );
  let totalFee = toBN(0);
  for (let index = balanceIndex; index >= balanceLessModificationIndex; index--) {
    let integralStart: BigNumber;
    let integralEnd: BigNumber;

    // If everything is in the same interval, we can just compute the integral
    // from balance to balance - modificationAmount
    if (index === balanceIndex && index === balanceLessModificationIndex) {
      integralStart = runningBalance;
      integralEnd = runningBalance.sub(modificationAmount);
    }
    // If not in the same interval, then when we are in the balance
    // interval, start at balance and go to the lb (because balance-modification)
    // is lower
    else if (index === balanceIndex) {
      integralStart = runningBalance;
      integralEnd = balanceLowerBound;
    }
    // If not in the same interval, then when we are in the balance-less-modification
    // interval, start at balance-less-modification and go to the ub (because balance)
    // is higher
    else if (index === balanceLessModificationIndex) {
      integralStart = balanceLessModificationUpperBound;
      integralEnd = runningBalance.sub(modificationAmount);
    }
    // If not in the same interval, then when we are in the middle interval, start at
    // the lb and go to the ub
    else {
      const [lowerBound, upperBound] = getBounds(cutoffArray, index);
      integralStart = lowerBound;
      integralEnd = upperBound;
    }
    totalFee = totalFee.add(performLinearIntegration(cutoffArray, index, integralStart, integralEnd));
  }
  return totalFee;
}

/**
 * Computes the balancing fee for a deposit.
 * @param cutoffArray An array of tuples that define the cutoff points and values of the piecewise function
 * @param runningBalance The current running balance of the spoke pool
 * @param modificationAmount The amount that the user will be depositing
 * @returns The balancing fee for the deposit
 */
export function getDepositBalancingFee(
  cutoffArray: [BigNumber, BigNumber][],
  runningBalance: BigNumber,
  modificationAmount: BigNumber
): BigNumber {
  const [balanceIndex, [, balanceUpperBound]] = getInterval(cutoffArray, runningBalance);
  const [balancePlusModificationIndex, [balancePlusModificationLowerBound]] = getInterval(
    cutoffArray,
    runningBalance.add(modificationAmount)
  );
  let totalFee = toBN(0);

  // If everything is in the same interval, we can just compute the integral
  // from balance to balance + modificationAmount
  for (let index = balanceIndex; index <= balancePlusModificationIndex; index++) {
    let integralStart: BigNumber;
    let integralEnd: BigNumber;
    // If everything is in the same interval, we can just compute the integral
    // from balance to balance + modificationAmount (this is the same as the refund case except in reverse)
    if (index === balanceIndex && index === balancePlusModificationIndex) {
      integralStart = runningBalance;
      integralEnd = runningBalance.add(modificationAmount);
    }
    // If not in the same interval, then when we are in the balance
    // interval, start at balance and go to the ub (because balance+modification)
    // is higher
    else if (index === balanceIndex) {
      integralStart = runningBalance;
      integralEnd = balanceUpperBound;
    }
    // If not in the same interval, then when we are in the balance-plus-modification
    // interval, start at balance-plus-modification and go to the lb
    else if (index === balancePlusModificationIndex) {
      integralStart = balancePlusModificationLowerBound;
      integralEnd = runningBalance.add(modificationAmount);
    }
    // Otherwise, integrate over the entire interval
    else {
      const [lowerBound, upperBound] = getBounds(cutoffArray, index);
      integralStart = lowerBound;
      integralEnd = upperBound;
    }
    totalFee = totalFee.add(performLinearIntegration(cutoffArray, index, integralStart, integralEnd));
  }

  return totalFee;
}

/**
 * Computes the utilization at a given point in time based on the
 * current balances and equity of the hub and spoke pool targets.
 * @param decimals The number of decimals for the token
 * @param hubBalance The current balance of the hub pool for the token
 * @param hubEquity The current equity of the hub pool for the token
 * @param ethSpokeBalance The current balance of the ETH spoke pool for the token
 * @param targetSpoke The current balance of the target spoke pool for the token - this is a list.
 * @returns The utilization of the hub pool
 */
export function calculateUtilization(
  decimals: number,
  hubBalance: BigNumber,
  hubEquity: BigNumber,
  ethSpokeBalance: BigNumber,
  spokeTargets: { target: BigNumber; spokeChainId: number }[]
) {
  const numerator = hubBalance
    .add(ethSpokeBalance)
    .add(spokeTargets.reduce((a, b) => (b.spokeChainId !== HUBPOOL_CHAIN_ID ? a.add(b.target) : a), BigNumber.from(0)));
  const denominator = hubEquity;
  const result = numerator.mul(parseEther("1.0")).div(denominator); // We need to multiply by 1e18 to get the correct precision for the result
  return BigNumber.from(10).pow(decimals).sub(result);
}
