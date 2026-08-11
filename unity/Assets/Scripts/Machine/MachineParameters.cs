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
        public float gapDistanceMm = 0.055f;
        public float servoFeedPercent = 0.32f;
        public float flushingPressureBar = 2.8f;
        public float flowRateLpm = 8f;
        public float conductivityUsCm = 5f;
        public float openCircuitVoltageV = 100f;
        public float toolDiameterMm = 8f;
        public string workpieceMaterial = "H13 Steel";
        public string electrodeMaterial = "Copper";
        public float depthOfCutMm = 18f;

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
            if (patch.gapDistanceMm.HasValue) gapDistanceMm = patch.gapDistanceMm.Value;
            if (patch.servoFeedPercent.HasValue) servoFeedPercent = patch.servoFeedPercent.Value;
            if (patch.flushingPressureBar.HasValue) flushingPressureBar = patch.flushingPressureBar.Value;
            if (patch.flowRateLpm.HasValue) flowRateLpm = patch.flowRateLpm.Value;
            if (patch.conductivityUsCm.HasValue) conductivityUsCm = patch.conductivityUsCm.Value;
            if (patch.openCircuitVoltageV.HasValue) openCircuitVoltageV = patch.openCircuitVoltageV.Value;
            if (patch.toolDiameterMm.HasValue) toolDiameterMm = patch.toolDiameterMm.Value;
            if (!string.IsNullOrWhiteSpace(patch.workpieceMaterial)) workpieceMaterial = patch.workpieceMaterial;
            if (!string.IsNullOrWhiteSpace(patch.electrodeMaterial)) electrodeMaterial = patch.electrodeMaterial;
            if (patch.depthOfCutMm.HasValue) depthOfCutMm = patch.depthOfCutMm.Value;
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
        public float? gapDistanceMm;
        public float? servoFeedPercent;
        public float? flushingPressureBar;
        public float? flowRateLpm;
        public float? conductivityUsCm;
        public float? openCircuitVoltageV;
        public float? toolDiameterMm;
        public string workpieceMaterial;
        public string electrodeMaterial;
        public float? depthOfCutMm;
        public float? temperatureC;
        public float? mrr;
        public float? toolWear;
    }
}
