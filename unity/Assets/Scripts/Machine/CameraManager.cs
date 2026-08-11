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
        [SerializeField] private Transform freeOrbitTarget;
        [SerializeField] private Transform frontView;
        [SerializeField] private Transform topView;
        [SerializeField] private Transform sideView;
        [SerializeField] private Transform toolView;
        [SerializeField] private Transform isometricView;

        [Header("Free View")]
        [SerializeField] private float rotateSpeed = 140f;
        [SerializeField] private float panSpeed = 0.012f;
        [SerializeField] private float zoomSpeed = 3.5f;
        [SerializeField] private float minDistance = 0.75f;
        [SerializeField] private float maxDistance = 35f;

        private bool freeViewEnabled;
        private Vector3 orbitPivot;
        private float orbitDistance = 8f;

        public CameraView CurrentView { get; private set; } = CameraView.Isometric;

        private void Awake()
        {
            if (targetCamera == null)
            {
                targetCamera = Camera.main;
            }

            ResolveViewReferences();
        }

        private void Start()
        {
            if (CurrentView != CameraView.Free)
            {
                SetView(CurrentView);
            }
        }

        private void Update()
        {
            if (!freeViewEnabled || targetCamera == null)
            {
                return;
            }

            UpdateFreeCamera();
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
                EnableFreeView();
                return;
            }

            freeViewEnabled = false;
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

        private void EnableFreeView()
        {
            freeViewEnabled = true;
            if (targetCamera == null)
            {
                targetCamera = Camera.main;
            }

            orbitPivot = freeOrbitTarget != null ? freeOrbitTarget.position : ResolveDefaultPivot();
            if (targetCamera != null)
            {
                orbitDistance = Mathf.Clamp(Vector3.Distance(targetCamera.transform.position, orbitPivot), minDistance, maxDistance);
            }
        }

        private void UpdateFreeCamera()
        {
            Transform cameraTransform = targetCamera.transform;

            if (Input.GetMouseButton(0))
            {
                float yaw = Input.GetAxis("Mouse X") * rotateSpeed * Time.deltaTime;
                float pitch = -Input.GetAxis("Mouse Y") * rotateSpeed * Time.deltaTime;
                cameraTransform.RotateAround(orbitPivot, Vector3.up, yaw);
                cameraTransform.RotateAround(orbitPivot, cameraTransform.right, pitch);
            }

            if (Input.GetMouseButton(1) || Input.GetMouseButton(2))
            {
                Vector3 pan = (-cameraTransform.right * Input.GetAxis("Mouse X") - cameraTransform.up * Input.GetAxis("Mouse Y")) * (panSpeed * orbitDistance);
                orbitPivot += pan;
                cameraTransform.position += pan;
            }

            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.001f)
            {
                orbitDistance = Mathf.Clamp(orbitDistance - scroll * zoomSpeed, minDistance, maxDistance);
                cameraTransform.position = orbitPivot - cameraTransform.forward * orbitDistance;
            }
        }

        private void ResolveViewReferences()
        {
            if (targetCamera == null) targetCamera = Camera.main;
            if (frontView == null) frontView = FindSceneTransform("FrontView");
            if (topView == null) topView = FindSceneTransform("TopView");
            if (sideView == null) sideView = FindSceneTransform("SideView");
            if (toolView == null) toolView = FindSceneTransform("ToolView");
            if (isometricView == null) isometricView = FindSceneTransform("IsoView");
            if (freeOrbitTarget == null) freeOrbitTarget = FindSceneTransform("CameraViews");
        }

        private static Transform FindSceneTransform(string transformName)
        {
            if (string.IsNullOrWhiteSpace(transformName))
            {
                return null;
            }

            foreach (Transform candidate in FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                if (candidate.name == transformName)
                {
                    return candidate;
                }
            }

            return null;
        }

        private Vector3 ResolveDefaultPivot()
        {
            Transform viewsRoot = FindSceneTransform("CameraViews");
            if (viewsRoot != null)
            {
                return viewsRoot.position;
            }

            return targetCamera != null ? targetCamera.transform.position + targetCamera.transform.forward * orbitDistance : Vector3.zero;
        }
    }
}
