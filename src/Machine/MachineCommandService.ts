import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";

type MachineCommand = "start" | "stop" | "reset" | "home" | "emergency_stop" | "pause" | "resume" | "request_status";

export class MachineCommandService {
  constructor(private readonly client: RealtimeClient = realtimeClient) {}

  startMachining() {
    return this.sendCommand("start");
  }

  stopMachining() {
    return this.sendCommand("stop");
  }

  resetMachine() {
    return this.sendCommand("reset");
  }

  homeMachine() {
    return this.sendCommand("home");
  }

  emergencyStop() {
    return this.sendCommand("emergency_stop");
  }

  pauseMachining() {
    return this.sendCommand("pause");
  }

  resumeMachining() {
    return this.sendCommand("resume");
  }

  requestStatus() {
    return this.sendCommand("request_status");
  }

  private sendCommand(command: MachineCommand) {
    const message: GatewayMessage = {
      type: "machine.command",
      payload: {
        command,
      },
    };

    return this.client.send(message);
  }
}

export const machineCommandService = new MachineCommandService();
