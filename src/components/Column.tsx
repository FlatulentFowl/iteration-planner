import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { SortableTask } from './SortableTask.tsx';
import { Task } from '../types.ts';

interface ColumnProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  tasks: Task[];
  variant?: 'sidebar' | 'main';
  filter?: React.ReactNode;
}

export function Column({ id, title, icon, description, tasks, variant = 'main', filter }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const taskIds = React.useMemo(() => tasks.map((t) => t.id), [tasks]);

  if (variant === 'sidebar') {
    return (
      <div className="flex flex-col h-full bg-slate-100/80 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">
                {tasks.length}
              </span>
            </div>
          </div>
          {filter && (
            <div className="w-full">
              {filter}
            </div>
          )}
        </div>

        <div
          ref={setNodeRef}
          className="flex-1 p-3 space-y-3 overflow-y-auto"
        >
          <SortableContext id={id} items={taskIds}>
            {tasks.map((task) => (
              <SortableTask key={task.id} task={task} />
            ))}
          </SortableContext>
          {tasks.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-300">
              <p className="text-[10px] font-bold uppercase tracking-tighter">Backlog Empty</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col iteration-drop-zone rounded-xl border-2 border-dashed border-slate-300/60 overflow-hidden">
      <div className="p-4 flex items-center justify-between bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Count:</span>
          <span className={`px-3 py-1 text-white rounded text-xs font-bold ${id === 'iteration1' ? 'bg-blue-600' : 'bg-indigo-600'}`}>
            {tasks.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 p-4 space-y-3 overflow-y-auto"
      >
        <SortableContext id={id} items={taskIds}>
          {tasks.map((task) => (
            <SortableTask key={task.id} task={task} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-lg">
            <p className="text-xs font-bold uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full">Drop to plan</p>
          </div>
        )}
      </div>
    </div>
  );
}
