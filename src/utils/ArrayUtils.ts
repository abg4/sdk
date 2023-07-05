/**
 * Returns the last index of an array that matches the given predicate.
 * @note Emulates Array.prototype.findLastIndex
 * @param array The array to search.
 * @param predicate The predicate function to apply to each element.
 * @returns The last index of the array that matches the predicate, or -1 if no element matches.
 */
export function findLastIndex<T>(array: T[], predicate: (value: T, index: number, obj: T[]) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

/**
 * Returns the last element of an array that matches the given predicate.
 * @note Emulates Array.prototype.findLast
 * @param array The array to search.
 * @param predicate The predicate function to apply to each element.
 * @returns The last element of the array that matches the predicate, or undefined if no element matches.
 */
export function findLast<T>(array: T[], predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined {
  const index = findLastIndex(array, predicate);
  return index >= 0 ? array[index] : undefined;
}

/**
 * Performs an asynchronous filter operation on an array. This function behaves like Array.prototype.filter, but
 * accepts an asynchronous predicate function.
 * @param array The array to filter.
 * @param predicate The asynchronous predicate function to apply to each element.
 * @returns A promise that resolves to an array of elements that match the predicate.
 */
export async function filterAsync<T>(
  array: T[],
  predicate: (value: T, index: number, obj: T[]) => Promise<boolean>
): Promise<T[]> {
  const results = await Promise.all(array.map(predicate));
  return array.filter((_, index) => results[index]);
}
