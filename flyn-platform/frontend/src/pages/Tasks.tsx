import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, Search, Filter, MoreVertical, Clock, CheckCircle2,
  AlertCircle, Calendar, User, Layout, List as ListIcon,
  Search as SearchIcon, Sparkles, ChevronRight, GripVertical, Loader2, Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { tasksService, Task, CreateTaskDto, UpdateTaskDto } from "@/services/tasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const Tasks = () => {
  const { t } = useTranslation();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // New task form state
  const [newTask, setNewTask] = useState<Partial<CreateTaskDto>>({
    title: "",
    status: "todo",
    priority: "medium",
    dueDate: new Date().toISOString().slice(0, 10),
    assignee: "Me",
    category: "General"
  });

  const columns: { id: Task['status']; title: string; color: string }[] = [
    { id: "todo", title: "To Do", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
    { id: "in-progress", title: "In Progress", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    { id: "review", title: "Review", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    { id: "done", title: "Done", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  ];

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await tasksService.getTasks();
      setTasks(data);
    } catch (error) {
      console.error("Failed to load tasks", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async () => {
    if (!newTask.title) return;
    try {
      const created = await tasksService.createTask(newTask as CreateTaskDto);
      setTasks(prev => [...prev, created]);
      setIsNewTaskOpen(false);
      setNewTask({ title: "", status: "todo", priority: "medium", dueDate: new Date().toISOString().slice(0, 10), assignee: "Me", category: "General" });
    } catch (error) {
      console.error("Failed to create task", error);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: Task['status']) => {
    try {
      setIsUpdating(taskId);
      const updated = await tasksService.updateTask(taskId, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    } catch (error) {
      console.error("Failed to update status", error);
    } finally {
      setIsUpdating(null);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const exportTasksCSV = () => {
    const headers = ['Title', 'Status', 'Priority', 'Assignee', 'Due Date', 'Category'];
    const rows = tasks.map(t => [t.title, t.status, t.priority, t.assignee || '', t.dueDate || '', t.category]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `tasks-${new Date().toISOString().slice(0,10)}.csv` });
    link.click();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Task Manager</h1>
            <p className="text-sm text-muted-foreground">Track and manage your team's activities across the platform.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 border border-border p-1 rounded-lg mr-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setView("kanban")}
                className={cn("h-8 px-3 gap-2", view === "kanban" && "bg-background text-foreground shadow-sm")}
              >
                <Layout className="w-4 h-4" />
                <span className="text-xs">Board</span>
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setView("list")}
                className={cn("h-8 px-3 gap-2", view === "list" && "bg-background text-foreground shadow-sm")}
              >
                <ListIcon className="w-4 h-4" />
                <span className="text-xs">List</span>
              </Button>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 border-border text-muted-foreground" onClick={exportTasksCSV}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button onClick={() => setIsNewTaskOpen(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4" />
              <span>New Task</span>
            </Button>
          </div>
        </div>

        {/* Filters & Control Bar */}
        <div className="flex items-center justify-between gap-4 bg-muted/30 border border-border p-3 rounded-xl">
          <div className="flex-1 max-w-md relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, categories, or members..." 
              className="pl-9 bg-background border-border focus:border-primary/50 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 border-border text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 border-border text-primary">
              <Sparkles className="w-4 h-4" />
              <span>AI Prioritize</span>
            </Button>
          </div>
        </div>

        {/* Task Board / List */}
        {loading ? (
          <div className="flex items-center justify-center h-[50vh]">
            <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
          </div>
        ) : view === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[600px] overflow-x-auto pb-4">
            {columns.map(col => (
              <div key={col.id} className="flex flex-col gap-4 min-w-[280px]">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider font-bold", col.color)}>
                      {col.title}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">
                      {filteredTasks.filter(t => t.status === col.id).length}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => { setNewTask({...newTask, status: col.id}); setIsNewTaskOpen(true); }}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex-1 space-y-3 rounded-xl bg-muted/20 p-2.5 border border-border shadow-inner">
                  {filteredTasks.filter(t => t.status === col.id).map(task => (
                    <motion.div
                      key={task.id}
                      layoutId={task.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "group bg-card hover:bg-accent/5 border border-border hover:border-primary/30 rounded-xl p-3.5 shadow-sm transition-all cursor-pointer relative overflow-hidden",
                        isUpdating === task.id && "opacity-50 pointer-events-none"
                      )}
                    >
                      {/* Interactive Drag Handle Area Placeholder */}
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-muted group-hover:bg-primary/50 transition-colors" />

                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground bg-muted/30">
                          {task.category}
                        </Badge>
                        <select 
                          className="bg-transparent text-xs text-muted-foreground border border-border rounded px-1 py-0.5 appearance-none cursor-pointer hover:text-foreground focus:outline-none"
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value as Task['status'])}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="todo">To Do</option>
                          <option value="in-progress">In Progress</option>
                          <option value="review">Review</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                      
                      <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-2 leading-snug">
                        {task.title}
                      </h3>
                      {task.contactName && (
                        <div className="flex items-center gap-1 mb-2">
                          <User className="w-3 h-3 text-primary/60" />
                          <span className="text-[10px] text-primary/70 font-medium truncate">{task.contactName}</span>
                        </div>
                      )}
                      {task.description && (
                        <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2 leading-relaxed">{task.description}</p>
                      )}

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shadow-inner">
                            {(task.assignee || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[60px]">{task.assignee || 'Unassigned'}</span>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-medium">
                          {task.priority === "high" && (
                            <span className="flex items-center gap-1 text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                              <AlertCircle className="w-3 h-3" />
                              High
                            </span>
                          )}
                          {(task.priority === "medium" || task.priority === "low") && (
                            <span className="flex items-center gap-1 text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                              <Clock className="w-3 h-3" />
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'No date'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {isUpdating === task.id && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex justify-center items-center rounded-xl z-10">
                           <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {filteredTasks.filter(t => t.status === col.id).length === 0 && (
                    <div className="h-28 flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground italic text-xs bg-muted/5">
                      <span>No tasks in this column</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="bg-card border-border overflow-hidden shadow-xl">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredTasks.map(task => (
                    <tr key={task.id} className="hover:bg-accent/5 transition-colors group">
                      <td className="p-4 text-sm font-medium text-foreground">
                        <div className="flex flex-col gap-1.5">
                          <span>{task.title}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-tight font-semibold inline-flex w-fit bg-muted px-2 py-0.5 rounded">{task.category}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <select 
                            className={cn(
                              "text-xs px-2 py-1 rounded-md border appearance-none cursor-pointer outline-none transition-colors bg-background",
                              columns.find(c => c.id === task.status)?.color
                            )}
                            value={task.status}
                            onChange={(e) => handleStatusChange(task.id, e.target.value as Task['status'])}
                            disabled={isUpdating === task.id}
                          >
                            <option value="todo">To Do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="review">Review</option>
                            <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <div className={cn(
                          "flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-full w-fit bg-muted/50",
                          task.priority === "high" ? "text-rose-500 border border-rose-500/20" : 
                          task.priority === "medium" ? "text-amber-500 border border-amber-500/20" : 
                          "text-emerald-500 border border-emerald-500/20"
                        )}>
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full shadow-sm",
                            task.priority === "high" ? "bg-rose-500 shadow-rose-500/50" : 
                            task.priority === "medium" ? "bg-amber-500 shadow-amber-500/50" : 
                            "bg-emerald-500 shadow-emerald-500/50"
                          )} />
                          {(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary border border-primary/20 shadow-inner">
                            {(task.assignee || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-muted-foreground font-medium">{task.assignee || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground text-right font-mono tabular-nums">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredTasks.length === 0 && (
                     <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 italic">No tasks found</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
        <DialogContent className="sm:max-w-[425px] bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground font-semibold tracking-tight">Create New Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground shadow-sm">Task Title</label>
              <Input 
                value={newTask.title} 
                onChange={(e) => setNewTask({...newTask, title: e.target.value})} 
                placeholder="What needs to be done?"
                className="bg-background border-border focus:border-primary/50 text-foreground rounded-lg px-3 py-2"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground">Status</label>
                <select 
                  className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
                  value={newTask.status}
                  onChange={(e) => setNewTask({...newTask, status: e.target.value as Task['status']})}
                >
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground">Priority</label>
                <select 
                  className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
                  value={newTask.priority}
                  onChange={(e) => setNewTask({...newTask, priority: e.target.value as Task['priority']})}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground">Due Date</label>
                <Input 
                  type="date"
                  value={newTask.dueDate} 
                  onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})} 
                  className="bg-background border-border text-foreground rounded-lg h-10"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground">Category</label>
                <Input 
                  value={newTask.category} 
                  onChange={(e) => setNewTask({...newTask, category: e.target.value})} 
                  placeholder="e.g. CRM, Dev"
                  className="bg-background border-border text-foreground rounded-lg h-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Assignee</label>
              <Input
                value={newTask.assignee}
                onChange={(e) => setNewTask({...newTask, assignee: e.target.value})}
                placeholder="Team member name"
                className="bg-background border-border text-foreground rounded-lg"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Link to Contact (optional)</label>
              <Input
                value={newTask.contactName || ''}
                onChange={(e) => setNewTask({...newTask, contactName: e.target.value})}
                placeholder="Contact name (for CRM linking)"
                className="bg-background border-border text-foreground rounded-lg"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Description (optional)</label>
              <textarea
                value={newTask.description || ''}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                placeholder="Additional details..."
                rows={2}
                className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border pt-4 mt-2">
            <Button variant="ghost" onClick={() => setIsNewTaskOpen(false)} className="text-muted-foreground hover:text-foreground">
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={!newTask.title} className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6">
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Tasks;
