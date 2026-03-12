# Marching Tetrahedra Terrain Builder

A small Astroneer-inspired browser game prototype featuring:

- Full marching tetrahedra mesh extraction from a scalar field
- Smooth interpolation across all generated surface triangles
- Real-time terrain building and destruction with a soft brush
- Stylized pastel terrain coloring and foggy atmosphere
- FPS-style flight controls for sculpting terrain in 3D

## Run

```bash
python3 -m http.server 8000
```

Then open: <http://localhost:8000>

## Controls

- `L` lock/unlock pointer
- `WASD` move
- `Space` / `Shift` up/down
- Mouse move to look
- Left mouse button: build terrain
- Right mouse button: destroy terrain
- Mouse wheel: change brush radius
