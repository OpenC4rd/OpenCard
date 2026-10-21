type RemovabilityFlags = {
  isReadonly?: boolean
  unremovable?: boolean
}

/** Removal clears the stored value; the property definition itself always stays. */
export function isPropertyRemovable(definition: RemovabilityFlags): boolean {
  return definition.isReadonly !== true && definition.unremovable !== true
}
