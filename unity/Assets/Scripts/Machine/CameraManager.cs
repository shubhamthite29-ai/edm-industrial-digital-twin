using UnityEngine;

namespace EDMDigitalTwin.Machine
{
    public enum CameraView
    {
        Front,
        Top,
        Side,
        Tool,
        Isometric,
        Free
    }

    public class CameraManager : MonoBehaviour
    {
        [SerializeField] private Camera targetCamera;
        [SerializeField] private Transform frontView;
        [SerializeField] private Transform topView;
        [SerializeField] private Transform sideView;
        [SerializeField] private Transform toolView;
        [SerializeField] private Transform isometricView;

        public CameraView CurrentView { get; private set; } = CameraView.Isometric;

        private void Awake()
        {
            if (targetCamera == null)
            {
                targetCamera = Camera.main;
            }
        }

        public void SetView(string viewName)
        {
            if (string.IsNullOrWhiteSpace(viewName))
            {
                Debug.LogWarning("Camera command ignored because the view name is empty.");
                return;
            }

            if (!System.Enum.TryParse(viewName, true, out CameraView view))
            {
                Debug.LogWarning($"Unsupported camera view: {viewName}");
                return;
            }

            SetView(view);
        }

        public void SetView(CameraView view)
        {
            CurrentView = view;

            if (view == CameraView.Free)
            {
                return;
            }

            Transform source = view switch
            {
                CameraView.Front => frontView,
                CameraView.Top => topView,
                CameraView.Side => sideView,
                CameraView.Tool => toolView,
                CameraView.Isometric => isometricView,
                _ => null
            };

            if (targetCamera == null || source == null)
            {
                Debug.LogWarning($"Camera view {view} is not configured.");
                return;
            }

            targetCamera.transform.SetPositionAndRotation(source.position, source.rotation);
        }
    }
}
