import { useCallback, useState } from 'react';
import { api } from '../api/client';

export type DragType = 'task' | 'step' | 'activity';

export interface DragItem {
  type: DragType;
  id: string;
  /** For tasks: the step they're currently in */
  sourceStepId?: string;
  /** For steps: the activity they're currently in */
  sourceActivityId?: string;
}

interface UseDragDropOptions {
  projectId: string;
  onMoveComplete: () => void;
}

export function useDragDrop({ projectId, onMoveComplete }: UseDragDropOptions) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: DragItem) => {
      setDragItem(item);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(item));
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5';
      }
    },
    [],
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDragItem(null);
    setDropTarget(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '';
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(targetId);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleTaskDrop = useCallback(
    async (e: React.DragEvent, targetStepId: string) => {
      e.preventDefault();
      setDropTarget(null);

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const item: DragItem = JSON.parse(raw);
        if (item.type !== 'task' || !item.sourceStepId) return;
        if (item.sourceStepId === targetStepId) return;

        await api.patch(`/tasks/${item.id}/move`, {
          step_id: targetStepId,
          from_step_id: item.sourceStepId,
        });
        onMoveComplete();
      } catch {
        // Failed — map will refetch and show original state
      }
    },
    [onMoveComplete],
  );

  const handleStepDrop = useCallback(
    async (e: React.DragEvent, targetActivityId: string) => {
      e.preventDefault();
      setDropTarget(null);

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const item: DragItem = JSON.parse(raw);
        if (item.type !== 'step' || !item.sourceActivityId) return;
        if (item.sourceActivityId === targetActivityId) return;

        await api.patch(`/steps/${item.id}/move`, {
          activity_id: targetActivityId,
        });
        onMoveComplete();
      } catch {
        // Failed
      }
    },
    [onMoveComplete],
  );

  const handleActivityDrop = useCallback(
    async (e: React.DragEvent, targetIndex: number, activityIds: string[]) => {
      e.preventDefault();
      setDropTarget(null);

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const item: DragItem = JSON.parse(raw);
        if (item.type !== 'activity') return;

        const newOrder = activityIds.filter((id) => id !== item.id);
        newOrder.splice(targetIndex, 0, item.id);

        await api.post(`/projects/${projectId}/activities/reorder`, {
          ids: newOrder,
        });
        onMoveComplete();
      } catch {
        // Failed
      }
    },
    [projectId, onMoveComplete],
  );

  return {
    dragItem,
    dropTarget,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleTaskDrop,
    handleStepDrop,
    handleActivityDrop,
  };
}
