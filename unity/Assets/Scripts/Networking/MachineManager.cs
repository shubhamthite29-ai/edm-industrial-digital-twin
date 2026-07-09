using UnityEngine;
using EDMDigitalTwin.Machine;
using System.Reflection;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        [Tooltip("Assign your existing Machinecontroller/MachineController component here.")]
        public MonoBehaviour machineController;

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

            if (IsRunning || IsControllerRunning())
            {
                Debug.Log("Start command ignored because the machine cycle is already running.");
                return;
            }

            IsRunning = true;
            SetMachineState(MachineState.MACHINING);
            MachineEvents.RaiseMachineStarted();
            InvokeControllerMethod("StartMachining");
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

        private bool IsControllerRunning()
        {
            if (machineController == null)
            {
                return false;
            }

            PropertyInfo property = machineController.GetType().GetProperty("IsRunning", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (property != null && property.PropertyType == typeof(bool))
            {
                return (bool)property.GetValue(machineController);
            }

            FieldInfo field = machineController.GetType().GetField("IsRunning", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(machineController);
            }

            return false;
        }

        private void InvokeControllerMethod(string methodName)
        {
            if (machineController == null)
            {
                Debug.LogWarning($"Cannot call {methodName} because machineController is not assigned.");
                return;
            }

            MethodInfo method = machineController.GetType().GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                Debug.LogWarning($"Assigned machine controller does not contain method {methodName}().");
                return;
            }

            method.Invoke(machineController, null);
        }
    }
}
