using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        public MachineController machineController;

        [SerializeField] private WebSocketClient webSocketClient;

        public bool IsRunning { get; private set; }

        private void Awake()
        {
            if (webSocketClient == null)
            {
                webSocketClient = FindFirstObjectByType<WebSocketClient>();
            }
        }

        public void StartMachining()
        {
            if (machineController == null)
            {
                Debug.LogWarning("MachineController reference is missing. Assign it in the inspector.");
                return;
            }

            if (IsRunning || machineController.IsRunning)
            {
                Debug.Log("Start command ignored because the machine cycle is already running.");
                return;
            }

            IsRunning = true;
            SendUnityState("machining");
            machineController.StartMachining();
        }

        public void StopMachining()
        {
            Debug.Log("Machine cycle stopped");
        }

        public void ResetMachine()
        {
            Debug.Log("Machine reset requested");
        }

        public void EmergencyStop()
        {
            Debug.LogWarning("Emergency stop requested");
        }

        public void NotifyMachiningFinished()
        {
            if (!IsRunning)
            {
                return;
            }

            IsRunning = false;
            SendUnityState("idle");
        }

        private void SendUnityState(string status)
        {
            if (webSocketClient == null)
            {
                webSocketClient = FindFirstObjectByType<WebSocketClient>();
            }

            if (webSocketClient == null)
            {
                Debug.LogWarning($"Cannot publish Unity state '{status}' because WebSocketClient is missing.");
                return;
            }

            webSocketClient.Send(GatewayMessageFactory.UnityState(status));
        }
    }
}
