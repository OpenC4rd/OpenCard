import { readonly, ref } from 'vue'

type Confirmation = { title: string; message: string; confirmLabel: string }
const pending = ref<(Confirmation & { resolve: (accepted: boolean) => void }) | null>(null)

export const confirmationRequest = readonly(pending)
export function requestConfirmation(options: Confirmation): Promise<boolean> {
  pending.value?.resolve(false)
  return new Promise(resolve => { pending.value = { ...options, resolve } })
}
export function resolveConfirmation(accepted: boolean): void {
  const request = pending.value
  pending.value = null
  request?.resolve(accepted)
}
