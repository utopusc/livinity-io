import {t} from '@/utils/i18n'

// Phase 38 Plan 03 — `description()` legacy export removed (no longer
// referenced after the password-gate flow was deleted). `title()` and
// `backPath` are still consumed by the new FactoryResetModal.
//
// In a function because otherwise translation won't always work
// Could also put into a hook or component
export const title = () => t('factory-reset.modal.heading')

export const backPath = '/settings'
