import { computed, type ComputedRef, type Ref } from 'vue'
import type { OcNodeCollection, OcNodeSelectionEvent } from '../../../shared/ui/node/node.types'
import type { SettingsCategoryKey } from '../../settings/model/appSettings'
import type { ShellListGroup } from '../shell.types'
import { SETTINGS_CATEGORIES_LIST_KEY } from '../shellSidebarConfig'

type Translate = (key: string, fallback?: string) => string

export interface SettingsSectionOptions {
  translate: Translate
  categoryKey: Readonly<Ref<SettingsCategoryKey>>
  categoryTreeData: Readonly<Ref<OcNodeCollection>>
  onSelectionChange: (event: OcNodeSelectionEvent) => void
}

export function createSettingsSection(options: SettingsSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => [{
    key: 'primary',
    transitionKey: 'space:settings:none',
    title: '',
    lists: [{
      key: SETTINGS_CATEGORIES_LIST_KEY,
      title: options.translate('settings.title', 'Settings'),
      placeholder: '',
      actions: [],
      content: {
        type: 'tree' as const,
        data: options.categoryTreeData.value,
        selectedKeys: [options.categoryKey.value],
        role: 'listbox' as const,
        selectionMode: 'single' as const,
        activationMode: 'none' as const,
        onSelectionChange: options.onSelectionChange,
      },
    }],
  }])
}
