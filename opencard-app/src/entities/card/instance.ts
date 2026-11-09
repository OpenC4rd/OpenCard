/** Blueprint instance override projection for Card documents. */
import type {
    CardBlock,
    CardDocument,
    CardInstanceRecord,
} from './model'
import { cloneAdditionalFieldDefinitions } from './model'

export function isInstanceBlockFieldOverridable(fieldKey: string): boolean {
    return fieldKey !== 'name'
}

/** 把一张卡的覆写叠到块上：有值的替换，`null` 的移除，字段随后按缺失走属性默认值。 */
export function applyBlockOverrides<T extends object>(
    record: T,
    overrides: CardInstanceRecord['data'][string] | undefined,
): T {
    const projected = { ...record } as Record<string, unknown>
    for (const [fieldKey, value] of Object.entries(overrides ?? {})) {
        if (fieldKey === 'additionalFieldDefinition' || !isInstanceBlockFieldOverridable(fieldKey)) continue
        if (value === null) delete projected[fieldKey]
        else projected[fieldKey] = value
    }
    return projected as T
}

function mergeBlockOverride(source: CardBlock, instance: CardInstanceRecord): CardBlock {
    const block = applyBlockOverrides(source, instance.data[source.id])

    switch (block.type) {
        case 'simple-container-block':
            return {
                ...block,
                additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
                children: block.children.map((child) => ({
                    location: { ...child.location },
                    block: mergeBlockOverride(child.block, instance),
                })),
            }
        case 'flow-container-block':
            return {
                ...block,
                additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
                children: block.children.map((child) => ({
                    location: { ...child.location },
                    block: mergeBlockOverride(child.block, instance),
                })),
            }
        // 叶子块只做一层覆盖；旧文档里已并入文本块的类型也走这里。
        default:
            return {
                ...block,
                additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
            }
    }
}

export function applyInstance(
    document: CardDocument,
    instance: CardInstanceRecord | null,
): CardDocument {
    if (!instance) {
        return document
    }

    return {
        ...document,
        faces: {
            front: {
                ...document.faces.front,
                children: document.faces.front.children.map((child) => ({
                    location: { ...child.location },
                    block: mergeBlockOverride(child.block, instance),
                })),
            },
            back: {
                ...document.faces.back,
                children: document.faces.back.children.map((child) => ({
                    location: { ...child.location },
                    block: mergeBlockOverride(child.block, instance),
                })),
            },
        },
    }
}
