import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";

type MachineCommand = "start" | "stop" | "reset" | "emergency_stop";

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

  emergencyStop() {
    return this.sendCommand("emergency_stop");
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
