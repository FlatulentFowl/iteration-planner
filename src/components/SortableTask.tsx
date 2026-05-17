import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Task } from '../types.ts';

interface SortableTaskProps {
  task: Task;
  variant?: 'compact' | 'full';
}

export function SortableTask({ task }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group bg-white p-3 rounded-lg border border-slate-200 flex gap-3 shadow-sm task-card transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'invisible' : ''
      }`}
    >
      <div 
        style={{ backgroundColor: task.color || '#e2e8f0' }}
        className="w-1 shrink-0 rounded-full my-1 opacity-60"
      />
      <div className="drag-handle flex flex-col justify-center gap-1 py-1 shrink-0 opacity-40">
        <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
        <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
        <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
      </div>
      <div className="flex-1 min-w-0">
        {task.area && (
          <div className="flex items-center mb-1">
            <span 
              className="text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded shadow-sm border border-slate-200"
              style={{ color: task.color || '#64748b', backgroundColor: `${task.color}15` || '#f1f5f9' }}
            >
              {task.area}
            </span>
          </div>
        )}
        <p className="text-xs font-semibold text-slate-800 leading-tight break-words">
          {task.content}
        </p>
      </div>
    </div>
  );
}
