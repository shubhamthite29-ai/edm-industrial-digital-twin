using System;
using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public static class GatewayMessageTypes
    {
        public const string ClientHello = "client.hello";
        public const string Heartbeat = "heartbeat";
        public const string MachineCommand = "machine.command";
        public const string MachineParametersPatch = "machine.parameters.patch";
        public const string UnityState = "unity.state";
        public const string Ack = "ack";
        public const string Error = "error";
    }

    [Serializable]
    public class GatewayMessage
    {
        public string schemaVersion = "1.0";
        public string messageId;
        public string timestamp;
        public string source = "unity";
        public string type;
        public MessagePayload payload = new MessagePayload();
    }

    [Serializable]
    public class MessagePayload
    {
        public string role;
        public string command;
        public string status;
        public string messageId;
        public string detail;
        public string code;
    }

    public static class GatewayMessageFactory
    {
        public static GatewayMessage ClientHello()
        {
            return new GatewayMessage
            {
                messageId = Guid.NewGuid().ToString(),
                timestamp = DateTime.UtcNow.ToString("O"),
                source = "unity",
                type = GatewayMessageTypes.ClientHello,
                payload = new MessagePayload
                {
                    role = "unity"
                }
            };
        }

        public static GatewayMessage Heartbeat(string status = "alive")
        {
            return new GatewayMessage
            {
                messageId = Guid.NewGuid().ToString(),
                timestamp = DateTime.UtcNow.ToString("O"),
                source = "unity",
                type = GatewayMessageTypes.Heartbeat,
                payload = new MessagePayload
                {
                    status = status
                }
            };
        }

        public static GatewayMessage UnityState(string status)
        {
            return new GatewayMessage
            {
                messageId = Guid.NewGuid().ToString(),
                timestamp = DateTime.UtcNow.ToString("O"),
                source = "unity",
                type = GatewayMessageTypes.UnityState,
                payload = new MessagePayload
                {
                    status = status
                }
            };
        }

        public static string ToJson(GatewayMessage message)
        {
            return JsonUtility.ToJson(message);
        }

        public static bool TryFromJson(string json, out GatewayMessage message)
        {
            try
            {
                message = JsonUtility.FromJson<GatewayMessage>(json);
                return message != null && !string.IsNullOrWhiteSpace(message.type);
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Failed to parse gateway message: {exception.Message}");
                message = null;
                return false;
            }
        }
    }
}
