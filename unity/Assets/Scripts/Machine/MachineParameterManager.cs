using System;
using System.Globalization;
using System.Text.RegularExpressions;
using EDMDigitalTwin.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace EDMDigitalTwin.Machine
{
    public class MachineParameterManager : MonoBehaviour
    {
        private static readonly Regex NumberPattern = new Regex("\"(?<field>[A-Za-z0-9_]+)\"\\s*:\\s*(?<value>-?\\d+(?:\\.\\d+)?)");

        [SerializeField] private MachineParameters machineParameters = new MachineParameters();

        public UnityEvent<MachineParameters> OnParametersChanged;

        public MachineParameters Current => machineParameters;

        public void ApplyPatchJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                Debug.LogWarning("Cannot apply machine parameter patch because the JSON message is empty.");
                return;
            }

            MachineParametersPatch patch = ParsePatch(json);

            ApplyPatch(patch);
        }

        public void ApplyPatch(MachineParametersPatch patch)
        {
            if (patch == null)
            {
                return;
            }

            machineParameters.ApplyPatch(patch);
            OnParametersChanged?.Invoke(machineParameters);
            Debug.Log($"Machine parameters updated: I={machineParameters.currentA}A V={machineParameters.voltageV}V Gap={machineParameters.gapVoltageV}V Ton={machineParameters.pulseOnUs}us Toff={machineParameters.pulseOffUs}us");
        }

        private static MachineParametersPatch ParsePatch(string json)
        {
            var patch = new MachineParametersPatch();

            foreach (Match match in NumberPattern.Matches(json))
            {
                string field = match.Groups["field"].Value;
                string rawValue = match.Groups["value"].Value;

                if (!float.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out float value))
                {
                    continue;
                }

                switch (field)
                {
                    case "currentA":
                        patch.currentA = value;
                        break;
                    case "voltageV":
                        patch.voltageV = value;
                        break;
                    case "gapVoltageV":
                        patch.gapVoltageV = value;
                        break;
                    case "pulseOnUs":
                        patch.pulseOnUs = value;
                        break;
                    case "pulseOffUs":
                        patch.pulseOffUs = value;
                        break;
                    case "temperatureC":
                        patch.temperatureC = value;
                        break;
                    case "mrr":
                        patch.mrr = value;
                        break;
                    case "toolWear":
                        patch.toolWear = value;
                        break;
                }
            }

            return patch;
        }
    }
}
