export interface Task {
  id: string;
  content: string;
  color?: string;
  area?: string;
}

export interface BoardState {
  backlog: Task[];
  iteration0: Task[];
  iteration1: Task[];
  iteration2: Task[];
  iteration3: Task[];
}

export type ColumnId = keyof BoardState;
