export function persistenceErrorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Could not save Supplier Product.";
}

export async function persistSupplierProductForm<T>(
  persist: () => Promise<T>,
  onSuccess: () => void,
  onFailure: (message: string) => void,
) {
  try {
    const saved = await persist();
    onSuccess();
    return saved;
  } catch (cause) {
    onFailure(persistenceErrorMessage(cause));
    return undefined;
  }
}
