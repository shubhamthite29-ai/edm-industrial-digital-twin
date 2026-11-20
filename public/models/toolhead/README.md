# Toolhead CAD components

The independent Toolhead Digital Twin loads these six binary glTF 2.0 files
directly from `edm-toolhead.glb/`:

- `base_edm_machine_main.glb`
- `down_closer_plate_main.glb`
- `motor_bracket_top.glb`
- `upper_closer_plate_final_changed.glb`
- `pusher_150mm.glb`
- `tool_head.glb`

`edm-toolhead.glb` is a directory name retained from the supplied asset
package; it is not itself a GLB file. The viewer validates and loads each
component path individually.

The viewer groups Base, both closer plates, and Motor Bracket as the fixed
assembly. Pusher and Tool Head are the moving assembly. Source CAD X is mapped
to the viewer's vertical travel direction, while the canonical toolhead state
remains in millimetres. No CAD file is modified by the dashboard.
