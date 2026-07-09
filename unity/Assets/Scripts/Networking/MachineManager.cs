using UnityEngine;
using EDMDigitalTwin.Machine;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        public MachineController machineController;

        [SerializeField] private WebSocketClient webSocketClient;
        [SerializeField] private MachineState currentState = MachineState.READY;

        public bool IsRunning { get; private set; }
        public MachineState CurrentState => currentState;

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
            SetMachineState(MachineState.MACHINING);
            MachineEvents.RaiseMachineStarted();
            machineController.StartMachining();
        }

        public void StopMachining()
        {
            IsRunning = false;
            SetMachineState(MachineState.RETRACTING);
            Debug.Log("Machine cycle stopped");
        }

        public void ResetMachine()
        {
            IsRunning = false;
            SetMachineState(MachineState.READY);
            Debug.Log("Machine reset requested");
        }

        public void HomeMachine()
        {
            IsRunning = false;
            SetMachineState(MachineState.READY_TO_START);
            Debug.Log("Machine home requested");
        }

        public void PauseMachining()
        {
            SetMachineState(MachineState.WAITING_FOR_PARAMETERS);
            Debug.Log("Machine pause requested");
        }

        public void ResumeMachining()
        {
            if (IsRunning)
            {
                SetMachineState(MachineState.MACHINING);
            }

            Debug.Log("Machine resume requested");
        }

        public void EmergencyStop()
        {
            IsRunning = false;
            SetMachineState(MachineState.EMERGENCY_STOP);
            Debug.LogWarning("Emergency stop requested");
        }

        public void NotifyMachiningFinished()
        {
            if (!IsRunning)
            {
                return;
            }

            IsRunning = false;
            SetMachineState(MachineState.COMPLETED);
            MachineEvents.RaiseMachineFinished();
            SendUnityState("idle");
        }

        public void PublishCurrentState()
        {
            SendUnityState(IsRunning ? "machining" : "idle");
        }

        private void SetMachineState(MachineState state)
        {
            if (currentState == state)
            {
                SendUnityState(IsRunning ? "machining" : "idle");
                return;
            }

            currentState = state;
            MachineEvents.RaiseStateChanged(state);
            SendUnityState(IsRunning ? "machining" : "idle");
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
