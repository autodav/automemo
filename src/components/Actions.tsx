import { createContext, useContext } from 'react'
import type { LogSheetState } from './LogSheet'
import type { DeadlineSheetState } from './DeadlineSheet'
import type { ExpenseSheetState } from './ExpenseSheet'

export interface Actions {
  openLog: (s?: LogSheetState) => void
  openDeadline: (s?: DeadlineSheetState) => void
  openExpense: (s?: ExpenseSheetState) => void
  openNotifications: () => void
}
export const ActionsCtx = createContext<Actions | null>(null)
export function useActions(): Actions {
  const a = useContext(ActionsCtx)
  if (!a) throw new Error('useActions fuori dal provider')
  return a
}
