# Chip and Platform Object Grammar

## object family index

- `chip-die-substrate`: one fabricated semiconductor object with substrate, die, seams, etched grid, and package edges.
- `platform-stack`: one layered platform object with stacked planes, blocks, or control/data layers.
- `interconnect-fabric`: one connective technical object defined by lanes, bridges, mesh, or fabric structure.
- `system-cutaway`: one engineered shell or chassis with a visible internal hierarchy.

## chip-die-substrate

Use when the brief mentions chip, die, substrate, wafer, silicon, package, memory die, or compute die.

Preferred visible hierarchy:
- base substrate plane
- one or more raised die slabs
- etched grid or seam language on the die
- package edge, carrier frame, or memory slab as secondary structure

Useful vocabulary:
- die slab
- substrate plane
- interconnect seam
- etched grid
- memory slab
- package edge
- heat path

Good pseudo-3D cues:
- visible thickness on substrate and die
- inset seams
- etched line work
- restrained metallic or silicon highlights

Avoid:
- generic glowing cube
- floating icon collage
- flat motherboard screenshot imitation

## platform-stack

Use when the brief is about platform architecture, layered system stack, control plane, data plane, orchestration layers, or engine stack.

Preferred visible hierarchy:
- bottom foundational plate
- one to three lifted structural layers
- a clear top-to-bottom logic
- one or two critical linkages between layers

Useful vocabulary:
- foundation plate
- service layer
- control layer
- runtime slab
- orchestration tier
- top cap

Good pseudo-3D cues:
- separated layers
- consistent thickness
- shadow gaps between planes
- anchored labels on only the most important layers

Avoid:
- flat flowchart
- many equal floating cards
- dashboard panels pretending to be a stack

## interconnect-fabric

Use when the brief is about interconnect, topology, fabric, mesh, lanes, bridges, or system pathways.

Preferred visible hierarchy:
- one primary fabric body
- visible directional lanes or channels
- bridge points or switching joints
- one or two structural labels, not many

Useful vocabulary:
- fabric spine
- bridge lane
- mesh channel
- routing seam
- switching joint
- latency path

Good pseudo-3D cues:
- angled channels
- visible bridges
- thickness on routing surfaces
- restrained glow only where structure or flow matters

Avoid:
- neon network wallpaper
- random node cloud
- flat subway map treatment

## system-cutaway

Use when the brief centers on a machine, device, module, or technical object that should be shown as an engineered body with internals.

Preferred visible hierarchy:
- outer shell or chassis
- one opening or cutaway edge
- two or three internal tiers or parts
- sparse annotations around the perimeter

Useful vocabulary:
- machined shell
- cutaway tier
- structural join
- internal chamber
- service layer
- support spine

Avoid:
- consumer gadget hero shot
- glossy product ad
- flat silhouette with labels everywhere
