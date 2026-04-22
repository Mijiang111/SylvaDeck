export function getAsyncActionErrorMessage(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function fireAndForget<T>(
  promise: Promise<T>,
  onError?: (error: unknown) => void,
) {
  promise.catch((error) => {
    console.error(error);
    onError?.(error);
  });
}
