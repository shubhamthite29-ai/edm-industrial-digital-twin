using System;
using UnityEngine;

namespace EDMDigitalTwin.Machine
{
    [Serializable]
    public class MachineParameters
    {
        [Header("Electrical")]
        public float currentA = 18f;
        public float voltageV = 90f;
        public float gapVoltageV = 72f;
        public float pulseOnUs = 150f;
        public float pulseOffUs = 45f;

        [Header("Derived")]
        public float temperatureC = 32f;
        public float mrr = 0f;
        public float toolWear = 0f;

        public void ApplyPatch(MachineParametersPatch patch)
        {
            if (patch.currentA.HasValue) currentA = patch.currentA.Value;
            if (patch.voltageV.HasValue) voltageV = patch.voltageV.Value;
            if (patch.gapVoltageV.HasValue) gapVoltageV = patch.gapVoltageV.Value;
            if (patch.pulseOnUs.HasValue) pulseOnUs = patch.pulseOnUs.Value;
            if (patch.pulseOffUs.HasValue) pulseOffUs = patch.pulseOffUs.Value;
            if (patch.temperatureC.HasValue) temperatureC = patch.temperatureC.Value;
            if (patch.mrr.HasValue) mrr = patch.mrr.Value;
            if (patch.toolWear.HasValue) toolWear = patch.toolWear.Value;
        }
    }

    [Serializable]
    public class MachineParametersPatch
    {
        public float? currentA;
        public float? voltageV;
        public float? gapVoltageV;
        public float? pulseOnUs;
        public float? pulseOffUs;
        public float? temperatureC;
        public float? mrr;
        public float? toolWear;
    }
}
