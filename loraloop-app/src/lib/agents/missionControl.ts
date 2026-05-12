export type AgentRole = "AURA" | "ECHO" | "NEXUS" | "SYSTEM";
export type EventType = "THOUGHT" | "ACTION" | "RESULT" | "ERROR" | "SUCCESS";

export interface AgentEvent {
  id: string;
  agent: AgentRole;
  type: EventType;
  message: string;
  timestamp: string;
}

export class AgentOrchestrator {
  private onEvent: (event: AgentEvent) => void;
  private isActive: boolean = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private brandDna: any = null;

  constructor(onEvent: (event: AgentEvent) => void) {
    this.onEvent = onEvent;
  }

  public async startMission(brandDna: any) {
    this.isActive = true;
    this.brandDna = brandDna;
    this.emit("SYSTEM", "ACTION", "Mission Started: Growth Sprint v1.0");
    this.runLoop();
  }

  public stopMission() {
    this.isActive = false;
    this.emit("SYSTEM", "SUCCESS", "Mission Aborted by User.");
  }

  private emit(agent: AgentRole, type: EventType, message: string) {
    this.onEvent({
      id: Math.random().toString(36).substring(7),
      agent,
      type,
      message,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  private async runLoop() {
    while (this.isActive) {
      // Step 1: Aura analyzes context
      this.emit("AURA", "THOUGHT", `Analyzing brand alignment for ${this.brandDna?.businessName || 'current brand'}...`);
      await this.delay(3000);
      this.emit("AURA", "RESULT", "Consistency check: 100%. Core values identified: Innovation, Speed, Quality.");

      // Step 2: Echo generates idea
      this.emit("ECHO", "THOUGHT", "Ideating social content for LinkedIn and X...");
      await this.delay(4000);
      const idea = "The future of autonomous brand growth is here.";
      this.emit("ECHO", "ACTION", `Drafting post: "${idea}"`);
      await this.delay(3000);
      this.emit("ECHO", "SUCCESS", "Content bundle generated with suggested visual assets.");

      // Step 3: Nexus syncs
      this.emit("NEXUS", "ACTION", "Syncing with Postiz backend... Polling best engagement windows.");
      await this.delay(3000);
      try {
        // Mocking an API call to Postiz
        this.emit("NEXUS", "RESULT", "Optimal window found: Today at 2:00 PM.");
        this.emit("NEXUS", "SUCCESS", "Post scheduled to LinkedIn, X, and Instagram.");
      } catch (e) {
        this.emit("NEXUS", "ERROR", "Failed to sync with Postiz. Retrying in T-60s...");
      }

      this.emit("SYSTEM", "SUCCESS", "Cycle complete. Waiting for next window...");
      await this.delay(15000); // Wait between cycles
    }
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
