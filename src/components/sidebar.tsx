import { MessageSquare, Plus, ShieldCheck, Table2, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type View = "chat" | "transactions";

const NAV: { view: View; label: string; icon: typeof MessageSquare }[] = [
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "transactions", label: "Transactions", icon: Table2 },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Wallet className="size-4" />
      </div>
      <span className="font-semibold">Money Chat</span>
    </div>
  );
}

export function Sidebar({
  view,
  onViewChange,
  onNewChat,
  loadSampleData,
  upload,
}: {
  view: View;
  onViewChange: (view: View) => void;
  onNewChat: () => void;
  loadSampleData: () => void;
  upload: () => void;
}) {
  return (
    <aside className="glass hidden w-60 shrink-0 flex-col gap-6 rounded-2xl p-4 md:flex">
      <Logo />

      <button
        onClick={onNewChat}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
      >
        <Plus className="size-4" /> New chat
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/70 dark:hover:bg-white/10",
              view === v && "bg-white/80 font-medium shadow-sm dark:bg-white/10",
            )}
          >
            <Icon className="size-4 text-muted-foreground" /> {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 rounded-xl bg-linear-to-br from-violet-500 to-purple-700 p-4 text-white">
        <ShieldCheck className="size-5" />
        <div>
          <p className="font-medium">Private by design</p>
          <p className="mt-1 text-sm text-white/80">
            Your statements are read in your browser and never uploaded to us.
          </p>
        </div>
        <Button
          onClick={loadSampleData}
          className="bg-white/20 text-white hover:bg-white/30"
        >
          Try sample data
        </Button>
      </div>

      <button onClick={upload} className="flex items-center gap-3 px-2 text-sm text-muted-foreground hover:text-foreground">
        <Upload className="size-4" /> Upload statements
      </button>
    </aside>
  );
}
