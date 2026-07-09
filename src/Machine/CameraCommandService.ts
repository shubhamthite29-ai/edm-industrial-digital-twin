import { realtimeClient, type GatewayMessage, type RealtimeClient } from "../Realtime/RealtimeClient";
import type { CameraView } from "../types/twin";

export class CameraCommandService {
  constructor(private readonly client: RealtimeClient = realtimeClient) {}

  setView(view: CameraView) {
    const message: GatewayMessage = {
      type: "camera.command",
      payload: {
        view,
      },
    };

    return this.client.send(message);
  }
}

export const cameraCommandService = new CameraCommandService();
