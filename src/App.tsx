import React, { useState, useEffect, useCallback, useRef } from 'react';
import popupContent from './pop-up.md?raw';
import { Joyride, Step } from 'react-joyride';
import { io, Socket } from 'socket.io-client';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GripVertical, 
  ArrowRight, 
  Users, 
  Layers, 
  ListTodo,
  CheckCircle2,
  Send,
  Loader2
} from 'lucide-react';
import { Task, BoardState, ColumnId } from './types.ts';
import { SortableTask } from './components/SortableTask.tsx';
import { Column } from './components/Column.tsx';

const socket: Socket = io();

// Get or create unique session ID for this user
const getSessionId = () => {
  let id = localStorage.getItem('voter_session_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('voter_session_id', id);
  }
  return id;
};

const sessionId = getSessionId();

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};

function PopupModal({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      /^\*\*[^*]+\*\*$/.test(part)
        ? <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
        : part
    );
  };

  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    return lines.map((line, i) => {
      if (/^#### /.test(line)) return <h4 key={i} className="text-sm font-bold text-slate-700 mt-3 mb-1">{renderInline(line.slice(5))}</h4>;
      if (/^### /.test(line)) return <h3 key={i} className="text-base font-bold text-slate-800 mt-4 mb-1">{renderInline(line.slice(4))}</h3>;
      if (/^## /.test(line)) return <h2 key={i} className="text-lg font-bold text-slate-800 mt-4 mb-1">{renderInline(line.slice(3))}</h2>;
      if (/^# /.test(line)) return <h1 key={i} className="text-xl font-bold text-slate-900 mt-4 mb-2">{renderInline(line.slice(2))}</h1>;
      if (/^- /.test(line)) return <li key={i} className="ml-4 list-disc text-sm text-slate-700">{renderInline(line.slice(2))}</li>;
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="text-sm text-slate-700 leading-relaxed">{renderInline(line)}</p>;
    });
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Information</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {popupContent.trim() ? renderMarkdown(popupContent) : (
            <p className="text-sm text-slate-400 italic">No content.</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded hover:bg-slate-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState<BoardState>({
    backlog: [],
    iteration0: [],
    iteration1: [],
    iteration2: [],
    iteration3: [],
  });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [backlogFilter, setBacklogFilter] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [showPopup, setShowPopup] = useState(true);
  const [runTour, setRunTour] = useState(false);
  const [tourKey, setTourKey] = useState(0);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenTour');
    if (!hasSeenTour) {
      setRunTour(true);
    }
  }, []);

  const tourSteps: Step[] = [
    {
      target: '.tour-filter',
      title: 'Filter Backlog',
      content: 'You can use this dropdown to filter the Task Backlog column by specific areas.',
      disableBeacon: true,
      placement: 'bottom',
    },
    {
      target: '.tour-task-column-header',
      title: 'Drag Tasks',
      content: 'Drag a task from the backlog...',
      placement: 'bottom',
    },
    {
      target: '.tour-iteration-columns',
      title: 'Vote and Prioritize',
      content: '...and drop it into an iteration column to indicate that you believe the task should be performed as part of that particular iteration.',
      placement: 'top',
    },
    {
      target: '.tour-submit',
      title: 'Submit Vote',
      content: 'When you are finished voting, click here to submit your results.',
      placement: 'bottom',
    }
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = ['finished', 'skipped'];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('hasSeenTour', 'true');
    }
  };

  const relaunchTour = () => {
    setTourKey(prev => prev + 1);
    setRunTour(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Derive unique areas from ALL tasks on the board to keep filter options stable
  const allTasks = [...board.backlog, ...board.iteration0, ...board.iteration1, ...board.iteration2, ...board.iteration3];
  const availableAreas = Array.from(new Set(allTasks.map(task => task.area).filter(Boolean))) as string[];

  const filteredBacklog = backlogFilter === 'all' 
    ? board.backlog 
    : board.backlog.filter(task => task.area === backlogFilter);

  useEffect(() => {
    // Initialize session with server
    socket.emit('session:init', sessionId);

    socket.on('state:init', (initialState: BoardState) => {
      setBoard(initialState);
      setIsReady(true);
    });

    socket.on('state:updated', (newState: BoardState) => {
      setBoard(newState);
    });

    return () => {
      socket.off('state:init');
      socket.off('state:updated');
    };
  }, []);

  const updateBoard = useCallback((newBoard: BoardState) => {
    // Automatically sort iteration columns by area (Column 1) alphabetically
    const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => (a.area || '').localeCompare(b.area || ''));
    
    newBoard.iteration0 = sortTasks(newBoard.iteration0);
    newBoard.iteration1 = sortTasks(newBoard.iteration1);
    newBoard.iteration2 = sortTasks(newBoard.iteration2);
    newBoard.iteration3 = sortTasks(newBoard.iteration3);

    setBoard(newBoard);
    socket.emit('state:update', { sessionId, state: newBoard });
  }, []);

  const findContainer = (id: string) => {
    if (id in board) return id as ColumnId;
    
    return (Object.keys(board) as ColumnId[]).find((key) =>
      board[key].find((task) => task.id === id)
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const { id } = active;
    
    const container = findContainer(id as string);
    if (container) {
      const task = board[container].find((task) => task.id === id);
      if (task) setActiveTask(task);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    setBoard((prev) => {
      // Find the containers based on the most up-to-date state
      const findContainerInState = (id: string, state: BoardState) => {
        if (id in state) return id as ColumnId;
        return (Object.keys(state) as ColumnId[]).find((key) =>
          state[key].find((task) => task.id === id)
        );
      };

      const activeContainer = findContainerInState(activeId, prev);
      const overContainer = findContainerInState(overId, prev);

      if (!activeContainer || !overContainer || activeContainer === overContainer) {
        return prev;
      }

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];

      const activeIndex = activeItems.findIndex((item) => item.id === activeId);
      const overIndex = overItems.findIndex((item) => item.id === overId);

      let newIndex;
      if (overId in prev) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowLastItem = over && overIndex === overItems.length - 1;
        const modifier = isBelowLastItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return {
        ...prev,
        [activeContainer]: [...prev[activeContainer].filter((item) => item.id !== active.id)],
        [overContainer]: [
          ...prev[overContainer].slice(0, newIndex),
          activeItems[activeIndex],
          ...prev[overContainer].slice(newIndex, prev[overContainer].length),
        ],
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const overId = over?.id as string;

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (!activeContainer || !overContainer || activeContainer !== overContainer) {
      // Logic handled in handleDragOver, but we enforce sorting for final drop by using updateBoard
      const newBoard = { ...board };
      updateBoard(newBoard);
      setActiveTask(null);
      return;
    }

    const activeIndex = board[activeContainer].findIndex((item) => item.id === activeId);
    const overIndex = board[overContainer].findIndex((item) => item.id === overId);

    // Always use updateBoard to enforce sorting for iteration columns
    const newBoard = { ...board };
    
    if (activeIndex !== overIndex) {
      newBoard[overContainer] = arrayMove(newBoard[overContainer], activeIndex, overIndex);
    }
    
    updateBoard(newBoard);
    setActiveTask(null);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitSuccess(false);
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ board, sessionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      console.error('Error submitting votes:', err);
      alert('Failed to upload votes: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full mb-4"
        />
        <p className="text-slate-500 font-medium">Connecting to session...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden select-none">
      {showPopup && <PopupModal onClose={() => setShowPopup(false)} />}
      <Joyride
        key={tourKey}
        steps={tourSteps}
        run={runTour}
        continuous={true}
        showSkipButton={true}
        showProgress={true}
        disableScrolling={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#6366f1',
            zIndex: 100000,
          },
          tooltip: {
            borderRadius: '12px',
          },
          tooltipContent: {
            fontSize: '14px',
            color: '#1e293b',
          },
          tooltipTitle: {
            fontSize: '16px',
            color: '#0f172a',
            fontWeight: 'bold',
          },
          buttonNext: {
            backgroundColor: '#6366f1',
            borderRadius: '8px',
          },
          buttonBack: {
            color: '#64748b',
          },
          buttonSkip: {
            color: '#64748b',
          }
        }}
      />
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            V
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-800 uppercase">Iteration Planner</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Workspace: Project Strategy</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button
              onClick={relaunchTour}
              className="flex items-center gap-2 px-3 py-2 rounded text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
            >
              Launch Tour
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || submitSuccess}
              className={`tour-submit flex items-center gap-2 px-5 py-2 rounded text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                submitSuccess ? 'bg-green-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : (submitSuccess ? <CheckCircle2 size={14} /> : <Send size={14} />)}
              {submitSuccess ? 'VOTE SUBMITTED' : 'SUBMIT VOTE'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex gap-6 p-6 overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Backlog Column - Sidebar Style */}
            <div className="w-72 flex flex-col shrink-0 tour-task-column">
              <Column
                id="backlog"
                title="Task Backlog"
                icon={<ListTodo className="text-slate-400" size={16} />}
                description="Unsorted items"
                tasks={filteredBacklog}
                variant="sidebar"
                filter={
                  <select
                    value={backlogFilter}
                    onChange={(e) => setBacklogFilter(e.target.value)}
                    className="tour-filter w-full bg-white border border-slate-200 text-slate-700 text-[10px] font-bold uppercase rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="all">Filter by Area: All</option>
                    {availableAreas.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                }
              />
            </div>

            <div className="flex-1 flex gap-6 min-h-0 tour-iteration-columns">
              {/* Iteration 0 */}
              <Column
                id="iteration0"
                title="Iteration 0"
                icon={<ArrowRight className="text-gray-500" size={16} />}
                description="Initial Setup"
                tasks={board.iteration0}
                variant="main"
              />

              {/* Iteration 1 */}
              <Column
                id="iteration1"
                title="Iteration 1"
                icon={<CheckCircle2 className="text-blue-500" size={16} />}
                description="Growth Focus"
                tasks={board.iteration1}
                variant="main"
              />

              {/* Iteration 2 */}
              <Column
                id="iteration2"
                title="Iteration 2"
                icon={<ArrowRight className="text-indigo-500" size={16} />}
                description="Stability & Scale"
                tasks={board.iteration2}
                variant="main"
              />

              {/* Iteration 3 */}
              <Column
                id="iteration3"
                title="Iteration 3"
                icon={<ArrowRight className="text-purple-500" size={16} />}
                description="Future Considerations"
                tasks={board.iteration3}
                variant="main"
              />
            </div>

            <DragOverlay dropAnimation={dropAnimation}>
              {activeTask ? (
                <div className="task-card bg-white p-3 rounded-lg border border-slate-200 flex gap-3 shadow-xl ring-4 ring-blue-50/50 cursor-grabbing w-72">
                  <div 
                    style={{ backgroundColor: activeTask.color || '#e2e8f0' }}
                    className="w-1 shrink-0 rounded-full my-1 opacity-60"
                  />
                  <div className="flex-1 min-w-0">
                    {activeTask.area && (
                      <div className="flex items-center mb-1">
                        <span 
                          className="text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded shadow-sm border border-slate-200"
                          style={{ color: activeTask.color || '#64748b', backgroundColor: `${activeTask.color}15` || '#f1f5f9' }}
                        >
                          {activeTask.area}
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-slate-800 leading-tight">
                      {activeTask.content}
                    </p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
      </main>

      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          {/* Session info removed */}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-[10px] font-medium text-slate-500 italic uppercase">Drag items to prioritize iterations</span>
        </div>
      </footer>
    </div>
  );
}

