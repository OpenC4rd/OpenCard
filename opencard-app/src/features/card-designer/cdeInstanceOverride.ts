export function resetInstanceOverrideField(
  instanceData: Record<string, Record<string, unknown>>,
  blockId: string,
  fieldKey: string,
): boolean {
  const instanceBlockData = instanceData[blockId]
  if (!instanceBlockData || !Object.prototype.hasOwnProperty.call(instanceBlockData, fieldKey)) {
    return false
  }

  delete instanceBlockData[fieldKey]
  if (Object.keys(instanceBlockData).length === 0) {
    delete instanceData[blockId]
  }

  return true
}
