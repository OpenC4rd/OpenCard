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

function mergeBlockOverride(block: CardBlock, instance: CardInstanceRecord): CardBlock {
    const overrides = instance.data[block.id] ?? {}
    const projected = Object.fromEntries(Object.entries(overrides).filter(([fieldKey]) => (
        fieldKey !== 'additionalFieldDefinition' && isInstanceBlockFieldOverridable(fieldKey)
    )))

    switch (block.type) {
        case 'simple-container-block':
            return {
                ...block,
                ...projected,
                additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
                children: block.children.map((child) => ({
                    location: { ...child.location },
                    block: mergeBlockOverride(child.block, instance),
                })),
            }
        case 'flow-container-block':
            return {
                ...block,
                ...projected,
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
                ...projected,
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
