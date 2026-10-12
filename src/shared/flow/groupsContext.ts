import { createContext, useContext } from 'react';
import type { FlowGroup } from '../../core/model';

/** 線の経路計算で枠を避けるため、グループの一覧を線の部品まで届ける */
const GroupsContext = createContext<FlowGroup[]>([]);

export const GroupsProvider = GroupsContext.Provider;

export function useGroups(): FlowGroup[] {
  return useContext(GroupsContext);
}
