using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        public void StartMachining()
        {
            Debug.Log("Machine cycle started");
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
    }
}
